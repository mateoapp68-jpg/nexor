/**
 * MetaBotEngine – handles incoming Facebook Messenger events.
 * Mirrors the logic of bot-engine.ts but uses the Meta Graph API for sending.
 *
 * Bug fixes vs initial version:
 *  1. Buffer uses conversation.updatedAt (same robust strategy as bot-engine.ts)
 *  2. Conversation upsert resets follow-up timers when user responds
 *  3. Sale report triggers createNotification (in-app bell + Web Push)
 */

import { prisma } from './prisma'
import { decrypt } from './crypto'
import { transcribeAudio, analyzeImage, chatWithUsage, ChatMessage, BotJsonResponse } from './openai'
import { sendMetaText, sendMetaImage, sendMetaVideo, markMetaAsRead } from './meta'
import { buildSystemPrompt, detectIdentifiedProduct, enforceCharLimits, extractSentUrls } from './bot-engine'
import { createNotification } from './notifications'
import { resolveOpenAIKey, logAiUsage } from './ai-credits'

const BUFFER_DELAY_MS = 15_000
const MAX_HISTORY_MESSAGES = 6
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

// ─── Normalize Meta event ─────────────────────────────────────────────────────

interface NormalizedMeta {
  msgId: string
  senderId: string   // Meta PSID (page-scoped user ID)
  userName: string
  type: 'text' | 'audio' | 'image'
  text?: string
  audioUrl?: string
  imageUrl?: string
}

function normalizeMetaEvent(event: Record<string, unknown>): NormalizedMeta | null {
  try {
    const sender   = (event.sender  as Record<string, unknown>)
    const msg      = (event.message as Record<string, unknown>)
    const senderId = (sender?.id ?? '') as string
    if (!senderId || !msg) return null

    const msgId    = (msg.mid ?? '') as string
    const userName = '' // Meta doesn't send name in webhook

    // Text
    if (msg.text && !msg.attachments) {
      return { msgId, senderId, userName, type: 'text', text: msg.text as string }
    }

    // Attachments
    const attachments = (msg.attachments as Array<Record<string, unknown>>) ?? []
    const att = attachments[0]
    if (!att) return { msgId, senderId, userName, type: 'text', text: '' }

    const attType = att.type as string
    const payload = (att.payload as Record<string, unknown>) ?? {}
    const url     = (payload.url ?? '') as string

    if (attType === 'audio') return { msgId, senderId, userName, type: 'audio', audioUrl: url }
    if (attType === 'image') return { msgId, senderId, userName, type: 'image', imageUrl: url }
    if (attType === 'video') return { msgId, senderId, userName, type: 'image', imageUrl: url }

    return { msgId, senderId, userName, type: 'text', text: `[Adjunto: ${attType}]` }
  } catch {
    return null
  }
}

// ─── Engine ───────────────────────────────────────────────────────────────────

export class MetaBotEngine {
  static async handleEvent(botId: string, event: Record<string, unknown>): Promise<void> {

    // 1. Load bot + secret + owner
    const bot = await prisma.bot.findUnique({
      where: { id: botId },
      include: { secret: true, user: { select: { id: true } } },
    })
    if (!bot || bot.status !== 'ACTIVE' || !bot.secret) {
      console.warn(`[META] Bot ${botId} no activo o sin credenciales`)
      return
    }
    if (!bot.secret.metaPageTokenEnc) {
      console.warn(`[META] Bot ${botId} sin Page Access Token`)
      return
    }

    const pageToken  = bot.secret.metaPageTokenEnc ? decrypt(bot.secret.metaPageTokenEnc) : ''
    if (!pageToken) {
      console.warn(`[META] Bot ${botId} sin Page Access Token configurado`)
      return
    }
    const resolvedKey = await resolveOpenAIKey(botId)
    if (!resolvedKey) {
      console.warn(`[META] Bot ${botId} sin API key de OpenAI (sin key propia ni saldo global)`)
      return
    }
    const openaiKey = resolvedKey.key

    // 2. Normalize event
    const norm = normalizeMetaEvent(event)
    if (!norm) return

    const { msgId, senderId, type } = norm

    // 3. Dedup by messageId
    if (msgId) {
      const exists = await prisma.message.findUnique({ where: { messageId: msgId } })
      if (exists) { console.log(`[META] Duplicado ${msgId}, omitiendo`); return }
    }

    // 4. Check if already sold or bot disabled for this chat
    const existingConv = await prisma.conversation.findUnique({
      where: { botId_userPhone: { botId, userPhone: senderId } },
    })
    if (existingConv?.sold) {
      console.log(`[META] Usuario ${senderId} ya compró, ignorando`)
      return
    }
    if ((existingConv as Record<string, unknown>)?.botDisabled) {
      console.log(`[META] Bot desactivado para ${senderId}, ignorando`)
      return
    }

    // 5. Mark as read
    markMetaAsRead(senderId, pageToken).catch(() => {})

    // 6. Process message content
    let userText = ''
    let resolvedType: 'text' | 'audio' | 'image' = 'text'

    try {
      if (type === 'text') {
        userText = norm.text || ''
        resolvedType = 'text'
      } else if (type === 'audio' && norm.audioUrl) {
        resolvedType = 'audio'
        userText = await transcribeAudio(norm.audioUrl, openaiKey)
      } else if (type === 'image' && norm.imageUrl) {
        resolvedType = 'image'
        userText = `[Imagen enviada] ${await analyzeImage(norm.imageUrl, openaiKey)}`
      }
    } catch (e) {
      console.error('[META] Error procesando contenido:', e)
      userText = norm.text || '[Mensaje recibido]'
    }

    if (!userText.trim()) {
      console.warn(`[META] Texto vacío para bot ${botId}, omitiendo`)
      return
    }

    // 7. Upsert conversation — update updatedAt for buffer detection + reset follow-ups
    const conv = await prisma.conversation.upsert({
      where: { botId_userPhone: { botId, userPhone: senderId } },
      create: {
        botId,
        userPhone: senderId,
        userName: norm.userName || null,
        botState: { create: { welcomeSent: false } },
      },
      update: {
        updatedAt: new Date(),        // ← triggers buffer winner detection
        followUp1At: null,
        followUp1Sent: false,
        followUp2At: null,
        followUp2Sent: false,
        ...(norm.userName && { userName: norm.userName }),
      },
      include: { botState: true },
    })
    const conversationId = conv.id
    const arrivedAt      = conv.updatedAt
    const welcomeSent    = conv.botState?.welcomeSent ?? false

    // 8. Save incoming message to buffer
    await prisma.message.create({
      data: {
        conversationId,
        role: 'user',
        type: resolvedType,
        content: userText,
        messageId: msgId || undefined,
        buffered: true,
      },
    })

    console.log(`[META] Buffer: mensaje guardado (${resolvedType}) para ${senderId}, esperando ${BUFFER_DELAY_MS / 1000}s...`)

    // 9. Buffer: wait 15s, then check if we're still the latest message
    await sleep(BUFFER_DELAY_MS)

    const freshConv = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { updatedAt: true },
    })
    if (freshConv && freshConv.updatedAt > arrivedAt) {
      console.log(`[META] Buffer: cedido al mensaje más reciente para ${senderId}`)
      return
    }

    // 10. We are the buffer winner — load all buffered messages
    const bufferedMsgs = await prisma.message.findMany({
      where: { conversationId, role: 'user', buffered: true },
      orderBy: { createdAt: 'asc' },
    })
    if (!bufferedMsgs.length) return

    console.log(`[META] Buffer: procesando ${bufferedMsgs.length} mensaje(s) para ${senderId}`)

    // 11. Combine buffered messages
    const combinedText = bufferedMsgs
      .map(m => {
        switch (m.type) {
          case 'audio': return `🎙️ (audio transcrito): ${m.content}`
          case 'image': return `📷 (imagen analizada): ${m.content}`
          default:      return `📝 (texto): ${m.content}`
        }
      })
      .join('\n')

    // Replace buffered messages with single combined message (in transaction)
    await prisma.$transaction([
      prisma.message.deleteMany({ where: { conversationId, role: 'user', buffered: true } }),
      prisma.message.create({
        data: {
          conversationId,
          role: 'user',
          type: resolvedType,
          content: combinedText,
          messageId: msgId || undefined,
          buffered: false,
        },
      }),
    ])

    // 12. Load history
    const recentMessages = await prisma.message.findMany({
      where: { conversationId, buffered: false },
      orderBy: { createdAt: 'desc' },
      take: MAX_HISTORY_MESSAGES,
    })
    recentMessages.reverse()

    const chatHistory: ChatMessage[] = recentMessages.map(m => {
      if (m.role === 'assistant') {
        try {
          const parsed = JSON.parse(m.content) as Record<string, unknown>
          const parts  = [parsed.mensaje1, parsed.mensaje2, parsed.mensaje3].filter(Boolean).join('\n')
          return { role: 'assistant' as const, content: parts || m.content }
        } catch {
          return { role: 'assistant' as const, content: m.content }
        }
      }
      return { role: m.role as 'user', content: m.content }
    })

    // 13. Load products + build prompt
    const products = await prisma.product.findMany({
      where: { bots: { some: { botId } }, active: true },
    })

    // 13b. Detectar productos mencionados (ahorra tokens — fallback seguro a catálogo completo)
    const identifiedProductIds = detectIdentifiedProduct(recentMessages, products as Array<Record<string, unknown>>)
    if (identifiedProductIds.length) {
      const names = identifiedProductIds.map(id => products.find(p => p.id === id)?.name).join(', ')
      console.log(`[META] Smart filter: productos="${names}" — otros en modo minimal`)
    }

    // 13c. Extraer URLs ya enviadas — escanea TODOS los mensajes del asistente
    const allAssistantMessages = await prisma.message.findMany({
      where: { conversationId, role: 'assistant', buffered: false },
      select: { content: true, role: true },
      orderBy: { createdAt: 'asc' },
    })
    const sentUrls = extractSentUrls(allAssistantMessages)
    if (sentUrls.length) {
      console.log(`[META] URLs ya enviadas (${sentUrls.length}) extraídas de ${allAssistantMessages.length} msgs del asistente`)
    }

    const systemPrompt = buildSystemPrompt(
      bot,
      products as Array<Record<string, unknown>>,
      conv.userName,
      senderId,
      identifiedProductIds,
      sentUrls,
      welcomeSent,
    )

    // 14. Call OpenAI
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let response: BotJsonResponse
    try {
      const aiModel = (bot as any).aiModel || 'gpt-4o'
      const aiResult = await chatWithUsage(systemPrompt, chatHistory, openaiKey, aiModel)
      response = aiResult.response
      if (resolvedKey.isGlobal) {
        logAiUsage({ userId: resolvedKey.userId, service: 'meta-engine', model: aiModel, promptTokens: aiResult.promptTokens, completionTokens: aiResult.completionTokens }).catch(() => {})
      }
    } catch (aiErr: any) {
      console.error(`[META] OpenAI error para ${senderId}:`, aiErr.message)
      const isQuotaError = aiErr.message?.includes('insufficient_quota') || aiErr.message?.includes('429')
      if (isQuotaError) {
        await prisma.bot.update({ where: { id: botId }, data: { status: 'PAUSED' } }).catch(() => {})
        createNotification(
          bot.user.id,
          '⚠️ Bot pausado — Sin saldo en OpenAI',
          `El bot "${bot.name}" fue pausado automáticamente porque tu API key de OpenAI no tiene saldo. Recarga créditos y reactívalo manualmente.`,
          '/dashboard/services/whatsapp',
        ).catch(() => {})
        console.warn(`[META] Bot ${botId} PAUSADO automáticamente por quota insuficiente en OpenAI`)
      } else {
        await sendMetaText(senderId, '¡Hola! Recibí tu mensaje, en un momento te atiendo 😊', pageToken).catch(() => {})
      }
      return
    }

    // 15. Aplicar límites de caracteres en código
    enforceCharLimits(response, bot, !welcomeSent)

    // 15b. Filtro de seguridad: eliminar URLs repetidas aunque la IA las incluyera
    if (sentUrls.length) {
      const sentSet = new Set(sentUrls)
      response.fotos_mensaje1 = (response.fotos_mensaje1 ?? []).filter((u: string) => !sentSet.has(u))
      response.videos_mensaje1 = (response.videos_mensaje1 ?? []).filter((u: string) => !sentSet.has(u))
    }

    // 16. Send responses via Meta
    console.log(`[META] Enviando respuesta → ${senderId}`)

    if (response.mensaje1) {
      await sendMetaText(senderId, response.mensaje1, pageToken).catch(e =>
        console.error('[META] sendText m1 ERROR:', e),
      )
      await sleep(Math.floor(Math.random() * 1000) + 1000)
    }

    for (const photoUrl of response.fotos_mensaje1 ?? []) {
      if (typeof photoUrl === 'string' && photoUrl.startsWith('https://')) {
        await sendMetaImage(senderId, photoUrl, pageToken).catch(e =>
          console.error('[META] sendImage ERROR:', e),
        )
        await sleep(800)
      }
    }

    for (const videoUrl of (response.videos_mensaje1 ?? []) as string[]) {
      if (videoUrl.startsWith('https://')) {
        await sendMetaVideo(senderId, videoUrl, pageToken).catch(e =>
          console.error('[META] sendVideo ERROR:', e),
        )
        await sleep(1200)
      }
    }

    if (response.mensaje2) {
      await sendMetaText(senderId, response.mensaje2, pageToken).catch(e =>
        console.error('[META] sendText m2 ERROR:', e),
      )
      await sleep(Math.floor(Math.random() * 1000) + 1000)
    }

    if (response.mensaje3) {
      await sendMetaText(senderId, response.mensaje3, pageToken).catch(e =>
        console.error('[META] sendText m3 ERROR:', e),
      )
    }

    // 16. Handle sale report
    if (response.reporte) {
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { sold: true, soldAt: new Date() },
      }).catch(() => {})

      // In-app notification + Web Push to bot owner
      createNotification(
        bot.user.id,
        `🤖 Nueva venta — ${bot.name} (Messenger)`,
        response.reporte.slice(0, 120),
        '/dashboard/services/whatsapp',
      ).catch(() => {})

      console.log(`[META] Conversación ${conversationId} finalizada — venta confirmada para ${senderId}`)
    } else {
      const now = new Date()
      await prisma.conversation.update({
        where: { id: conversationId },
        data: {
          followUp1At:   new Date(now.getTime() + (bot.followUp1Delay || 15)   * 60 * 1000),
          followUp1Sent: false,
          followUp2At:   new Date(now.getTime() + (bot.followUp2Delay || 4320) * 60 * 1000),
          followUp2Sent: false,
        },
      }).catch(() => {})
      console.log(`[META] Seguimientos programados para ${senderId}`)
    }

    // 17. Save assistant response
    await prisma.message.create({
      data: {
        conversationId,
        role: 'assistant',
        type: 'text',
        content: JSON.stringify(response),
        buffered: false,
      },
    })

    // 18. Actualizar welcomeSent en botState (solo cuando el producto ya está identificado)
    const stateUpdates: Record<string, unknown> = {}
    if (!welcomeSent && response.mensaje1 && identifiedProductIds.length > 0) {
      stateUpdates.welcomeSent = true
      stateUpdates.welcomeSentAt = new Date()
    }
    if (response.reporte) {
      stateUpdates.lastIntent = 'confirmation'
    }
    if (Object.keys(stateUpdates).length > 0) {
      await prisma.botState.upsert({
        where: { conversationId },
        create: { conversationId, ...stateUpdates },
        update: stateUpdates,
      }).catch(() => {})
    }

    console.log(`[META] ✓ Respuesta enviada a ${senderId}`)
  }
}
