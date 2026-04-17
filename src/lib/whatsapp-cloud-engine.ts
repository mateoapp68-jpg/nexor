/**
 * WhatsAppCloudEngine – handles incoming WhatsApp Cloud API events.
 * Uses Meta's official WhatsApp Business API (not Baileys, not YCloud).
 * Mirrors the logic of meta-engine.ts adapted for WA Cloud API format.
 *
 * Webhook format: object = 'whatsapp_business_account'
 * Messages: entry[].changes[].value.messages[]
 * Contacts: entry[].changes[].value.contacts[]
 */

import { prisma } from './prisma'
import { decrypt } from './crypto'
import { transcribeAudio, analyzeImage, chatWithUsage, ChatMessage, BotJsonResponse } from './openai'
import { sendWaText, sendWaImage, sendWaVideo, markWaAsRead } from './whatsapp-cloud'
import { buildSystemPrompt, detectIdentifiedProduct, enforceCharLimits, extractSentUrls } from './bot-engine'
import { createNotification } from './notifications'
import { resolveOpenAIKey, logAiUsage } from './ai-credits'

const BUFFER_DELAY_MS = 15_000
const MAX_HISTORY_MESSAGES = 6
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

// ─── Normalize WhatsApp Cloud event ──────────────────────────────────────────

interface NormalizedWaCloud {
  msgId: string
  from: string         // phone number e.g. "59176966121"
  userName: string
  type: 'text' | 'audio' | 'image'
  text?: string
  audioId?: string     // WA media ID (needs download)
  audioUrl?: string    // direct URL if available
  imageId?: string
  imageUrl?: string
}

/**
 * Normalize a single WA Cloud message object.
 * contacts[] comes alongside messages[] in the same value object.
 */
export function normalizeWaCloudMessage(
  msg: Record<string, unknown>,
  contacts: Array<Record<string, unknown>>,
): NormalizedWaCloud | null {
  try {
    const from   = (msg.from ?? '') as string
    const msgId  = (msg.id   ?? '') as string
    const type   = (msg.type ?? '') as string
    if (!from || !msgId) return null

    const contact  = contacts.find(c => (c.wa_id as string) === from) ?? {}
    const profile  = (contact.profile as Record<string, unknown>) ?? {}
    const userName = (profile.name as string) ?? ''

    if (type === 'text') {
      const text = ((msg.text as Record<string, unknown>)?.body ?? '') as string
      return { msgId, from, userName, type: 'text', text }
    }

    if (type === 'audio' || type === 'voice') {
      const audio = (msg.audio ?? msg.voice) as Record<string, unknown>
      return { msgId, from, userName, type: 'audio', audioId: audio?.id as string }
    }

    if (type === 'image') {
      const image = msg.image as Record<string, unknown>
      return { msgId, from, userName, type: 'image', imageId: image?.id as string }
    }

    if (type === 'video') {
      const video = msg.video as Record<string, unknown>
      // Treat video as image for analysis
      return { msgId, from, userName, type: 'image', imageId: video?.id as string }
    }

    if (type === 'sticker') {
      return { msgId, from, userName, type: 'text', text: '[Sticker recibido]' }
    }

    if (type === 'location') {
      const loc = msg.location as Record<string, unknown>
      const lat  = loc?.latitude as number
      const lng  = loc?.longitude as number
      const text = `[Ubicación enviada] https://maps.google.com/?q=${lat},${lng}`
      return { msgId, from, userName, type: 'text', text }
    }

    // Unknown type
    return { msgId, from, userName, type: 'text', text: `[Mensaje tipo: ${type}]` }
  } catch {
    return null
  }
}

/**
 * Download a WA Cloud media object and return its binary content as a Blob.
 * Meta's media URLs require an Authorization header — OpenAI/Whisper cannot fetch them directly.
 *
 * Step 1: GET /{media-id} with Bearer token → { url, mime_type }
 * Step 2: GET that url with Bearer token → actual binary data
 */
async function downloadWaMedia(mediaId: string, token: string): Promise<{ blob: Blob; mimeType: string }> {
  const WA_API_VERSION = 'v20.0'

  // Step 1: get media metadata
  const metaRes = await fetch(`https://graph.facebook.com/${WA_API_VERSION}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!metaRes.ok) throw new Error(`[WA_CLOUD] Media meta ${metaRes.status}: ${await metaRes.text()}`)
  const meta = await metaRes.json() as Record<string, unknown>
  const cdnUrl  = meta.url as string
  const mimeType = (meta.mime_type as string) || 'application/octet-stream'

  // Step 2: download actual binary with Bearer token
  const binRes = await fetch(cdnUrl, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!binRes.ok) throw new Error(`[WA_CLOUD] Media download ${binRes.status}`)
  const buffer = await binRes.arrayBuffer()
  return { blob: new Blob([buffer], { type: mimeType }), mimeType }
}

/**
 * Download WA Cloud media and return as base64 data URL (for OpenAI Vision).
 */
async function downloadWaMediaAsDataUrl(mediaId: string, token: string): Promise<string> {
  const { blob, mimeType } = await downloadWaMedia(mediaId, token)
  const buffer = await blob.arrayBuffer()
  const base64 = Buffer.from(buffer).toString('base64')
  return `data:${mimeType};base64,${base64}`
}

// ─── Engine ───────────────────────────────────────────────────────────────────

export class WhatsAppCloudEngine {
  static async handleMessage(
    botId: string,
    msg: Record<string, unknown>,
    contacts: Array<Record<string, unknown>>,
  ): Promise<void> {

    // 1. Load bot + secret + owner
    const bot = await prisma.bot.findUnique({
      where: { id: botId },
      include: { secret: true, user: { select: { id: true } } },
    })
    if (!bot || bot.status !== 'ACTIVE' || !bot.secret) {
      console.warn(`[WA_CLOUD] Bot ${botId} no activo o sin credenciales`)
      return
    }

    const secret = bot.secret as Record<string, unknown>
    if (!secret.metaPageTokenEnc || !secret.metaPhoneNumberId) {
      console.warn(`[WA_CLOUD] Bot ${botId} sin token o phoneNumberId configurado`)
      return
    }

    const token         = decrypt(secret.metaPageTokenEnc as string)
    const phoneNumberId = secret.metaPhoneNumberId as string

    if (!token) {
      console.warn(`[WA_CLOUD] Bot ${botId} token vacío`)
      return
    }

    const resolvedKey = await resolveOpenAIKey(botId)
    if (!resolvedKey) {
      console.warn(`[WA_CLOUD] Bot ${botId} sin API key de OpenAI`)
      return
    }
    const openaiKey = resolvedKey.key

    // 2. Normalize message
    const norm = normalizeWaCloudMessage(msg, contacts)
    if (!norm) return

    const { msgId, from, type } = norm

    // 3. Dedup by messageId
    if (msgId) {
      const exists = await prisma.message.findUnique({ where: { messageId: msgId } })
      if (exists) { console.log(`[WA_CLOUD] Duplicado ${msgId}, omitiendo`); return }
    }

    // 4. Check sold / bot disabled
    const existingConv = await prisma.conversation.findUnique({
      where: { botId_userPhone: { botId, userPhone: from } },
    })
    if (existingConv?.sold) {
      console.log(`[WA_CLOUD] Usuario ${from} ya compró, ignorando`)
      return
    }
    if ((existingConv as Record<string, unknown> | null)?.botDisabled) {
      console.log(`[WA_CLOUD] Bot desactivado para ${from}, ignorando`)
      return
    }

    // 5. Mark as read
    markWaAsRead(msgId, phoneNumberId, token).catch(() => {})

    // 6. Process message content
    let userText = ''
    let resolvedType: 'text' | 'audio' | 'image' = 'text'

    try {
      if (type === 'text') {
        userText = norm.text || ''
        resolvedType = 'text'
      } else if (type === 'audio' && norm.audioId) {
        resolvedType = 'audio'
        // Download binary with Bearer token; pass Blob to Whisper (transcribeAudio supports Blob)
        const { blob: audioBlob } = await downloadWaMedia(norm.audioId, token)
        userText = await transcribeAudio(audioBlob, openaiKey)
      } else if (type === 'image' && norm.imageId) {
        resolvedType = 'image'
        // Download binary and encode as base64 data URL; OpenAI Vision supports data: URLs
        const dataUrl = await downloadWaMediaAsDataUrl(norm.imageId, token)
        userText = `[Imagen enviada] ${await analyzeImage(dataUrl, openaiKey)}`
      }
    } catch (e) {
      console.error('[WA_CLOUD] Error procesando contenido:', e)
      userText = norm.text || '[Mensaje recibido]'
    }

    if (!userText.trim()) {
      console.warn(`[WA_CLOUD] Texto vacío para bot ${botId}, omitiendo`)
      return
    }

    // 7. Upsert conversation — reset follow-up timers when user responds
    const conv = await prisma.conversation.upsert({
      where: { botId_userPhone: { botId, userPhone: from } },
      create: {
        botId,
        userPhone: from,
        userName: norm.userName || null,
        botState: { create: { welcomeSent: false } },
      },
      update: {
        updatedAt: new Date(),
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

    console.log(`[WA_CLOUD] Buffer: mensaje guardado (${resolvedType}) para ${from}, esperando ${BUFFER_DELAY_MS / 1000}s...`)

    // 9. Buffer: wait 15s, then check if we're still the latest
    await sleep(BUFFER_DELAY_MS)

    const freshConv = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { updatedAt: true },
    })
    if (freshConv && freshConv.updatedAt > arrivedAt) {
      console.log(`[WA_CLOUD] Buffer: cedido al mensaje más reciente para ${from}`)
      return
    }

    // 10. We are the buffer winner — load all buffered messages
    const bufferedMsgs = await prisma.message.findMany({
      where: { conversationId, role: 'user', buffered: true },
      orderBy: { createdAt: 'asc' },
    })
    if (!bufferedMsgs.length) return

    console.log(`[WA_CLOUD] Buffer: procesando ${bufferedMsgs.length} mensaje(s) para ${from}`)

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

    const identifiedProductIds = detectIdentifiedProduct(recentMessages, products as Array<Record<string, unknown>>)
    if (identifiedProductIds.length) {
      const names = identifiedProductIds.map(id => products.find(p => p.id === id)?.name).join(', ')
      console.log(`[WA_CLOUD] Smart filter: productos="${names}"`)
    }

    const allAssistantMessages = await prisma.message.findMany({
      where: { conversationId, role: 'assistant', buffered: false },
      select: { content: true, role: true },
      orderBy: { createdAt: 'asc' },
    })
    const sentUrls = extractSentUrls(allAssistantMessages)

    const systemPrompt = buildSystemPrompt(
      bot,
      products as Array<Record<string, unknown>>,
      conv.userName,
      from,
      identifiedProductIds,
      sentUrls,
      welcomeSent,
    )

    // 14. Call OpenAI
    let response: BotJsonResponse
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const aiModel = (bot as any).aiModel || 'gpt-4o'
      const aiResult = await chatWithUsage(systemPrompt, chatHistory, openaiKey, aiModel)
      response = aiResult.response
      if (resolvedKey.isGlobal) {
        logAiUsage({
          userId: resolvedKey.userId,
          service: 'whatsapp-cloud-engine',
          model: aiModel,
          promptTokens: aiResult.promptTokens,
          completionTokens: aiResult.completionTokens,
        }).catch(() => {})
      }
    } catch (aiErr: unknown) {
      const err = aiErr as Error
      console.error(`[WA_CLOUD] OpenAI error para ${from}:`, err.message)
      const isQuotaError = err.message?.includes('insufficient_quota') || err.message?.includes('429')
      if (isQuotaError) {
        await prisma.bot.update({ where: { id: botId }, data: { status: 'PAUSED' } }).catch(() => {})
        createNotification(
          bot.user.id,
          '⚠️ Bot pausado — Sin saldo en OpenAI',
          `El bot "${bot.name}" fue pausado automáticamente porque tu API key de OpenAI no tiene saldo.`,
          '/dashboard/services/whatsapp',
        ).catch(() => {})
      } else {
        await sendWaText(from, '¡Hola! Recibí tu mensaje, en un momento te atiendo 😊', phoneNumberId, token).catch(() => {})
      }
      return
    }

    // 15. Aplicar límites de caracteres
    enforceCharLimits(response, bot, !welcomeSent)

    // Filtro de seguridad: eliminar URLs repetidas
    if (sentUrls.length) {
      const sentSet = new Set(sentUrls)
      response.fotos_mensaje1  = (response.fotos_mensaje1  ?? []).filter((u: string) => !sentSet.has(u))
      response.videos_mensaje1 = (response.videos_mensaje1 ?? []).filter((u: string) => !sentSet.has(u))
    }

    // 16. Send responses via WhatsApp Cloud API
    console.log(`[WA_CLOUD] Enviando respuesta → ${from}`)

    if (response.mensaje1) {
      await sendWaText(from, response.mensaje1, phoneNumberId, token).catch(e =>
        console.error('[WA_CLOUD] sendText m1 ERROR:', e),
      )
      await sleep(Math.floor(Math.random() * 1000) + 1000)
    }

    for (const photoUrl of response.fotos_mensaje1 ?? []) {
      if (typeof photoUrl === 'string' && photoUrl.startsWith('https://')) {
        await sendWaImage(from, photoUrl, phoneNumberId, token).catch(e =>
          console.error('[WA_CLOUD] sendImage ERROR:', e),
        )
        await sleep(800)
      }
    }

    for (const videoUrl of (response.videos_mensaje1 ?? []) as string[]) {
      if (videoUrl.startsWith('https://')) {
        await sendWaVideo(from, videoUrl, phoneNumberId, token).catch(e =>
          console.error('[WA_CLOUD] sendVideo ERROR:', e),
        )
        await sleep(1200)
      }
    }

    if (response.mensaje2) {
      await sendWaText(from, response.mensaje2, phoneNumberId, token).catch(e =>
        console.error('[WA_CLOUD] sendText m2 ERROR:', e),
      )
      await sleep(Math.floor(Math.random() * 1000) + 1000)
    }

    if (response.mensaje3) {
      await sendWaText(from, response.mensaje3, phoneNumberId, token).catch(e =>
        console.error('[WA_CLOUD] sendText m3 ERROR:', e),
      )
    }

    // 17. Handle sale report
    if (response.reporte) {
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { sold: true, soldAt: new Date() },
      }).catch(() => {})

      // Enviar reporte al número configurado (igual que YCLOUD/Baileys)
      const reportPhone = bot.secret.reportPhone
      if (reportPhone?.trim()) {
        const reportTo = reportPhone.replace(/\D/g, '')
        await sendWaText(reportTo, response.reporte, phoneNumberId, token).catch(e =>
          console.error('[WA_CLOUD] sendReport ERROR:', e.message),
        )
      }

      createNotification(
        bot.user.id,
        `🤖 Nueva venta — ${bot.name} (WhatsApp Cloud)`,
        response.reporte.slice(0, 120),
        '/dashboard/services/whatsapp',
      ).catch(() => {})

      console.log(`[WA_CLOUD] Conversación ${conversationId} finalizada — venta confirmada para ${from}`)
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
      console.log(`[WA_CLOUD] Seguimientos programados para ${from}`)
    }

    // 18. Save assistant response
    await prisma.message.create({
      data: {
        conversationId,
        role: 'assistant',
        type: 'text',
        content: JSON.stringify(response),
        buffered: false,
      },
    })

    // 19. Update welcomeSent in botState
    const stateUpdates: Record<string, unknown> = {}
    if (!welcomeSent && response.mensaje1 && identifiedProductIds.length > 0) {
      stateUpdates.welcomeSent    = true
      stateUpdates.welcomeSentAt  = new Date()
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

    console.log(`[WA_CLOUD] ✓ Respuesta enviada a ${from}`)
  }
}
