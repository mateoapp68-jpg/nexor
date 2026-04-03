/**
 * Baileys Manager — Singleton que gestiona múltiples conexiones WhatsApp Web.
 * Una conexión por botId. Sesión guardada en ./baileys-sessions/[botId]/
 */

import makeWASocket, {
    DisconnectReason,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    WASocket,
    proto,
    downloadMediaMessage,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import path from 'path'
import fs from 'fs'
import { prisma } from '@/lib/prisma'
import { chat } from '@/lib/openai'
import { decrypt } from '@/lib/crypto'
import { toDataURL } from 'qrcode'
import { processFollowUps } from './follow-up-worker'
import { buildSystemPrompt, detectIdentifiedProduct, enforceCharLimits, extractSentUrls } from './bot-engine'
import { createNotification } from './notifications'

// ── Types ──────────────────────────────────────────────────────────────────────

export type BaileysStatus = 'disconnected' | 'connecting' | 'qr_ready' | 'connected'

export interface WhatsAppLabel {
    id: string
    name: string
    color: number
    predefinedId?: string
}

export interface LabelAssociation {
    labelId: string
    chatId: string
}

interface BaileysConnection {
    status: BaileysStatus
    qrBase64?: string
    phone?: string
    sock?: WASocket
    openaiKey: string
    reportPhone: string
    botId: string
    botName: string
    labels: Map<string, WhatsAppLabel>
    labelChats: LabelAssociation[]
}

// ── In-memory store (global para sobrevivir Next.js HMR) ──────────────────────
declare global {
    // eslint-disable-next-line no-var
    var __baileys_connections: Map<string, BaileysConnection> | undefined
    // eslint-disable-next-line no-var
    var __follow_up_worker_started: boolean | undefined
}

const connections: Map<string, BaileysConnection> =
    global.__baileys_connections ?? (global.__baileys_connections = new Map())

const SESSIONS_DIR = process.env.BAILEYS_SESSIONS_DIR || path.join(process.cwd(), 'baileys-sessions')
const MAX_HISTORY = 10
const BUFFER_DELAY_MS = 15_000
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

// ── Combinar mensajes del buffer ───────────────────────────────────────────────

interface BufferedMsg {
    id: string
    type: string
    content: string
    createdAt: Date
}

function combineBufferedMessages(messages: BufferedMsg[]): string {
    const sorted = [...messages].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    return sorted
        .map(m => {
            switch (m.type) {
                case 'audio': return `🎙️ (audio transcrito): ${m.content}`
                case 'image': return `📷 (imagen recibida): ${m.content}`
                default: return `📝 (texto): ${m.content}`
            }
        })
        .join('\n')
}

// ── Message handler ────────────────────────────────────────────────────────────

async function handleMessage(
    conn: BaileysConnection,
    msg: proto.IWebMessageInfo,
) {
    const sock = conn.sock!
    if (!msg.key?.remoteJid) return
    const jid = msg.key.remoteJid

    // Ignorar mensajes propios, grupos y status
    if (
        msg.key.fromMe ||
        jid === 'status@broadcast' ||
        jid.endsWith('@g.us')
    ) return

    // Verificar que el bot siga ACTIVE en BD (puede haberse pausado mientras el socket sigue conectado)
    const botStatus = await prisma.bot.findUnique({
        where: { id: conn.botId },
        select: { status: true },
    })
    if (!botStatus || botStatus.status !== 'ACTIVE') {
        // Bot pausado o eliminado — NO leer ni procesar nada (invisible para el cliente)
        console.log(`[BAILEYS] Bot ${conn.botId} está ${botStatus?.status ?? 'eliminado'}, ignorando mensaje sin leer`)
        return
    }

    // Deduplicación por ID de mensaje
    if (msg.key.id) {
        const exists = await prisma.message.findUnique({ where: { messageId: msg.key.id } })
        if (exists) {
            console.log(`[BAILEYS] Mensaje duplicado ${msg.key.id}, omitiendo`)
            return
        }
    }

    // Leer credenciales frescas de BD en cada mensaje (nunca desde memoria)
    const freshSecret = await prisma.botSecret.findUnique({ where: { botId: conn.botId } })
    if (!freshSecret?.openaiApiKeyEnc) {
        console.warn(`[BAILEYS] Bot ${conn.botId} sin API key de OpenAI`)
        return
    }
    const openaiKey = decrypt(freshSecret.openaiApiKeyEnc)

    const userPhone = jid.replace('@s.whatsapp.net', '')
    let userName = msg.pushName || ''

    // Si el nombre es puramente numérico, es un fallback del teléfono
    if (userName && /^\d+$/.test(userName.replace(/[+\s-]/g, ''))) {
        userName = ''
    }

    // Extraer contenido del mensaje
    let content = ''
    let msgType: 'text' | 'audio' | 'image' | 'location' = 'text'
    const msgContent = msg.message

    if (msgContent?.conversation) {
        content = msgContent.conversation
        msgType = 'text'
    } else if (msgContent?.extendedTextMessage?.text) {
        content = msgContent.extendedTextMessage.text
        msgType = 'text'
    } else if (msgContent?.audioMessage) {
        msgType = 'audio'
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const buffer = await downloadMediaMessage(msg as any, 'buffer', {})
            const { transcribeAudio } = await import('@/lib/openai')
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const blob = new Blob([buffer as any], { type: 'audio/ogg' })
            content = await transcribeAudio(blob, openaiKey)
        } catch {
            content = '[Audio recibido - no se pudo transcribir]'
        }
    } else if (msgContent?.imageMessage) {
        msgType = 'image'
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const buffer = await downloadMediaMessage(msg as any, 'buffer', {})
            const { analyzeImage } = await import('@/lib/openai')
            const b64 = (buffer as Buffer).toString('base64')
            const dataUrl = `data:image/jpeg;base64,${b64}`
            const analysis = await (analyzeImage as any)(dataUrl, openaiKey)
            content = `[Imagen recibida] ${analysis} ${msgContent.imageMessage.caption ? `| Pie de foto: ${msgContent.imageMessage.caption}` : ''}`
        } catch {
            content = msgContent.imageMessage.caption || '[Imagen recibida - error al analizar]'
        }
    } else if (msgContent?.locationMessage || (msgContent as any)?.liveLocationMessage) {
        msgType = 'location'
        const loc = msgContent?.locationMessage || (msgContent as any)?.liveLocationMessage
        const lat = loc.degreesLatitude
        const lon = loc.degreesLongitude
        const name = loc.name || ''
        const address = loc.address || ''
        content = `📍 Ubicación recibida: ${name} ${address}`.trim()
        if (lat && lon) content += ` | https://maps.google.com/?q=${lat},${lon}`
    } else {
        return
    }

    if (!content.trim()) return

    // Verificar si ya compró o si el bot está desactivado para este chat
    const existingConv = await prisma.conversation.findUnique({
        where: { botId_userPhone: { botId: conn.botId, userPhone } },
        select: { sold: true, botDisabled: true },
    })
    if (existingConv?.sold) return
    if (existingConv?.botDisabled) return

    // Marcar como leído
    if (msg.key) {
        await sock.readMessages([msg.key]).catch(err =>
            console.error('[BAILEYS] Error al marcar como leído:', err)
        )
    }

    // --- BUFFER ---
    let conversation = await prisma.conversation.upsert({
        where: { botId_userPhone: { botId: conn.botId, userPhone } },
        update: {
            userName: userName || undefined,
            updatedAt: new Date(),
            followUp1At: null,
            followUp1Sent: false,
            followUp2At: null,
            followUp2Sent: false,
        },
        create: {
            botId: conn.botId,
            userPhone,
            userName,
            botState: { create: { welcomeSent: false } },
        },
        include: { botState: true },
    })

    const resolvedUserName = userName || conversation.userName || ''
    const conversationId = conversation.id
    const arrivedAt = conversation.updatedAt
    const welcomeSent = (conversation as unknown as { botState?: { welcomeSent: boolean } }).botState?.welcomeSent ?? false

    await prisma.message.create({
        data: {
            conversationId,
            role: 'user',
            type: msgType,
            content,
            buffered: true,
            messageId: msg.key.id || undefined,
        },
    })

    await sleep(BUFFER_DELAY_MS)

    const freshConv = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { updatedAt: true },
    })

    if (freshConv && freshConv.updatedAt > arrivedAt) return

    const bufferedMsgs = await prisma.message.findMany({
        where: { conversationId, role: 'user', buffered: true },
        orderBy: { createdAt: 'asc' },
    })

    if (bufferedMsgs.length === 0) return

    const combinedUserText = combineBufferedMessages(bufferedMsgs)

    await prisma.$transaction([
        prisma.message.deleteMany({
            where: { conversationId, role: 'user', buffered: true },
        }),
        prisma.message.create({
            data: {
                conversationId,
                role: 'user',
                type: 'text',
                content: combinedUserText,
                buffered: false,
            },
        }),
    ])

    const history = await prisma.message.findMany({
        where: { conversationId, buffered: false },
        orderBy: { createdAt: 'desc' },
        take: MAX_HISTORY,
    })
    const chatHistory = history.reverse().map(m => {
        if (m.role === 'assistant') {
            try {
                const parsed = JSON.parse(m.content)
                return { role: 'assistant' as const, content: [parsed.mensaje1, parsed.mensaje2, parsed.mensaje3].filter(Boolean).join('\n') }
            } catch {
                return { role: 'assistant' as const, content: m.content }
            }
        }
        return { role: m.role as 'user' | 'assistant', content: m.content }
    })

    const bot = await prisma.bot.findUnique({
        where: { id: conn.botId },
        include: { user: { select: { id: true } } },
    })
    if (!bot) return

    const botProducts = await prisma.product.findMany({
        where: { bots: { some: { botId: conn.botId } }, active: true },
    })

    const identifiedProductIds = detectIdentifiedProduct(chatHistory, botProducts as Array<Record<string, unknown>>)
    if (identifiedProductIds.length) {
        const names = identifiedProductIds.map(id => botProducts.find(p => p.id === id)?.name).join(', ')
        console.log(`[BAILEYS] Smart filter: productos="${names}" — otros en modo minimal`)
    }

    // Extract URLs already sent so the AI doesn't repeat them
    const allAssistantMessages = await prisma.message.findMany({
        where: { conversationId, role: 'assistant', buffered: false },
        select: { content: true, role: true },
        orderBy: { createdAt: 'asc' },
    })
    const sentUrls = extractSentUrls(allAssistantMessages)

    const systemPrompt = buildSystemPrompt(
        bot,
        botProducts as Array<Record<string, unknown>>,
        resolvedUserName,
        userPhone,
        identifiedProductIds,
        sentUrls,
        welcomeSent,
    )

    let response: Awaited<ReturnType<typeof chat>>
    try {
        response = await chat(systemPrompt, chatHistory, openaiKey, (bot as any).aiModel || 'gpt-4o')
    } catch (aiErr: any) {
        console.error(`[BAILEYS] OpenAI error para ${userPhone}:`, aiErr.message)
        const isQuotaError = aiErr.message?.includes('insufficient_quota') || aiErr.message?.includes('429')
        if (isQuotaError) {
            // Sin saldo → pausar bot automáticamente (igual que si el dueño lo desactiva)
            await prisma.bot.update({ where: { id: conn.botId }, data: { status: 'PAUSED' } }).catch(() => {})
            createNotification(
                bot.user.id,
                '⚠️ Bot pausado — Sin saldo en OpenAI',
                `El bot "${bot.name}" fue pausado automáticamente porque tu API key de OpenAI no tiene saldo. Recarga créditos y reactívalo manualmente.`,
                '/dashboard/services/whatsapp',
            ).catch(() => {})
            console.warn(`[BAILEYS] Bot ${conn.botId} PAUSADO automáticamente por quota insuficiente en OpenAI`)
        } else {
            // Otro error transitorio → respaldo para no dejar al usuario en visto
            await sock.sendMessage(jid, { text: '¡Hola! Recibí tu mensaje, en un momento te atiendo 😊' }).catch(() => {})
        }
        return
    }

    enforceCharLimits(response, bot, !welcomeSent)

    // Remove URLs already sent to prevent repeats
    if (sentUrls.length) {
        const sentSet = new Set(sentUrls)
        response.fotos_mensaje1 = (response.fotos_mensaje1 ?? []).filter((u: string) => !sentSet.has(u))
        response.videos_mensaje1 = (response.videos_mensaje1 ?? []).filter((u: string) => !sentSet.has(u))
    }

    const sendMsg = async (text: string) => {
        await sock.sendPresenceUpdate('composing', jid)
        await sleep(Math.floor(Math.random() * 1000) + 1000)
        await sock.sendMessage(jid, { text })
    }

    if (response.mensaje1) await sendMsg(response.mensaje1)
    for (const photoUrl of response.fotos_mensaje1) {
        if (photoUrl.startsWith('https://')) {
            await sock.sendPresenceUpdate('composing', jid)
            await sleep(500)
            await sock.sendMessage(jid, { image: { url: photoUrl } }).catch(() => { })
        }
    }
    const videosToSend: string[] = Array.isArray(response.videos_mensaje1)
        ? (response.videos_mensaje1 as unknown[]).filter((v): v is string => typeof v === 'string' && v.startsWith('https://'))
        : []
    for (const videoUrl of videosToSend) {
        await sock.sendPresenceUpdate('composing', jid)
        await sleep(800)
        await sock.sendMessage(jid, { video: { url: videoUrl } }).catch(() => { })
    }
    if (response.mensaje2) await sendMsg(response.mensaje2)
    if (response.mensaje3) await sendMsg(response.mensaje3)

    if (response.reporte && conn.reportPhone) {
        const reportJid = `${conn.reportPhone.replace(/^\+/, '')}@s.whatsapp.net`
        if (reportJid) await sock.sendMessage(reportJid, { text: response.reporte }).catch(() => { })

        // Marcar como sold para pausar el bot
        await prisma.conversation.update({
            where: { id: conversationId },
            data: { sold: true, soldAt: new Date() }
        }).catch(() => { })

        // Notificación push al dueño del bot
        createNotification(
            bot.user.id,
            `🤖 Nueva venta — ${bot.name}`,
            response.reporte.slice(0, 120),
            '/dashboard/services/whatsapp',
        ).catch(() => {})

        console.log(`[BAILEYS] Conversación ${conversationId} finalizada (Reporte generado)`)

        // Etiquetar
        try {
            const labelJid = jid.endsWith('@lid') ? `${userPhone.replace(/\D/g, "")}@s.whatsapp.net` : jid
            await (sock as any).addChatLabel(labelJid, '4')
        } catch { }
    } else {
        const now = new Date()
        await prisma.conversation.update({
            where: { id: conversationId },
            data: {
                followUp1At: new Date(now.getTime() + (bot.followUp1Delay || 15) * 60 * 1000),
                followUp1Sent: false,
                followUp2At: new Date(now.getTime() + (bot.followUp2Delay || 4320) * 60 * 1000),
                followUp2Sent: false,
            },
        }).catch(() => { })
    }

    await prisma.message.create({
        data: {
            conversationId,
            role: 'assistant',
            type: 'text',
            content: JSON.stringify(response),
            buffered: false,
        },
    })

    // Update botState: mark welcomeSent once the product is identified and first message sent
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
}

export const BaileysManager = {
    getStatus(botId: string) {
        const conn = connections.get(botId)
        if (!conn) return { status: 'disconnected' }
        return { status: conn.status, qrBase64: conn.qrBase64, phone: conn.phone }
    },

    getLabels(botId: string): WhatsAppLabel[] {
        const conn = connections.get(botId)
        if (!conn) return []
        return Array.from(conn.labels.values())
    },

    getLabelContacts(botId: string, labelId: string): string[] {
        const conn = connections.get(botId)
        if (!conn) return []
        return conn.labelChats
            .filter(a => a.labelId === labelId)
            .map(a => {
                // chatId format: "591XXXXXXXX@s.whatsapp.net" → "+591XXXXXXXX"
                const phone = a.chatId.replace('@s.whatsapp.net', '').replace('@lid', '')
                return `+${phone}`
            })
    },

    async sendText(botId: string, toPhone: string, text: string): Promise<boolean> {
        const conn = connections.get(botId)
        if (!conn?.sock || conn.status !== 'connected') return false
        const jid = `${toPhone.replace(/^\+/, '').replace(/\s/g, '')}@s.whatsapp.net`
        try {
            await conn.sock.sendMessage(jid, { text })
            return true
        } catch (err) {
            console.error('[BAILEYS] sendText error:', err)
            return false
        }
    },

    async sendImage(botId: string, toPhone: string, imageUrl: string): Promise<boolean> {
        const conn = connections.get(botId)
        if (!conn?.sock || conn.status !== 'connected') return false
        const jid = `${toPhone.replace(/^\+/, '').replace(/\s/g, '')}@s.whatsapp.net`
        try {
            await conn.sock.sendMessage(jid, { image: { url: imageUrl } })
            return true
        } catch (err) {
            console.error('[BAILEYS] sendImage error:', err)
            return false
        }
    },

    async sendVideo(botId: string, toPhone: string, videoUrl: string): Promise<boolean> {
        const conn = connections.get(botId)
        if (!conn?.sock || conn.status !== 'connected') return false
        const jid = `${toPhone.replace(/^\+/, '').replace(/\s/g, '')}@s.whatsapp.net`
        try {
            await conn.sock.sendMessage(jid, { video: { url: videoUrl } })
            return true
        } catch (err) {
            console.error('[BAILEYS] sendVideo error:', err)
            return false
        }
    },

    async connect(botId: string, botName: string, openaiKey: string, reportPhone: string) {
        const existing = connections.get(botId)
        if (existing?.status === 'connected' || existing?.status === 'connecting') return

        const sessionDir = path.join(SESSIONS_DIR, botId)
        if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true })

        const conn: BaileysConnection = { status: 'connecting', openaiKey, reportPhone, botId, botName, labels: new Map(), labelChats: [] }
        connections.set(botId, conn)

        try {
            const { state, saveCreds } = await useMultiFileAuthState(sessionDir)
            const { version } = await fetchLatestBaileysVersion()
            const sock = makeWASocket({
                version,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, require('pino')({ level: 'silent' })),
                },
                logger: (require('pino')({ level: 'silent' })),
                browser: ['Ubuntu', 'Chrome', '120.0.0'],
                syncFullHistory: false,
                markOnlineOnConnect: false,
            })

            conn.sock = sock
            sock.ev.on('creds.update', saveCreds)
            sock.ev.on('connection.update', async update => {
                const { connection, qr } = update
                if (qr) conn.qrBase64 = await toDataURL(qr), conn.status = 'qr_ready'
                if (connection === 'open') {
                    conn.status = 'connected'
                    const phone = sock.user?.id?.split(':')[0] ?? ''
                    conn.phone = phone
                    await prisma.bot.update({ where: { id: botId }, data: { baileysPhone: phone } }).catch(() => { })
                }
                if (connection === 'close') {
                    const statusCode = new Boom(update.lastDisconnect?.error)?.output?.statusCode
                    conn.status = 'disconnected'
                    connections.delete(botId)

                    const isLoggedOut =
                        statusCode === DisconnectReason.loggedOut ||
                        statusCode === DisconnectReason.connectionReplaced

                    if (isLoggedOut) {
                        // WhatsApp cerró la sesión definitivamente — limpiar y NO reconectar
                        const sessionDir = path.join(SESSIONS_DIR, botId)
                        if (fs.existsSync(sessionDir)) fs.rmSync(sessionDir, { recursive: true, force: true })
                        await prisma.bot.update({ where: { id: botId }, data: { baileysPhone: null } }).catch(() => { })
                        console.log(`[BAILEYS] Bot ${botId} logged out por WhatsApp — sesión borrada`)
                    } else {
                        // Desconexión temporal — reconectar en 5s
                        setTimeout(() => BaileysManager.connect(botId, botName, openaiKey, reportPhone), 5000)
                    }
                }
            })

            sock.ev.on('messages.upsert', async ({ messages, type }) => {
                if (type !== 'notify') return
                for (const msg of messages) {
                    handleMessage(conn, msg).catch(err =>
                        console.error(`[BAILEYS] Error procesando mensaje botId=${botId}:`, err)
                    )
                }
            })

            // ── Labels sync ──────────────────────────────────────────────
            sock.ev.on('labels.edit', (label: any) => {
                if (label.deleted) {
                    conn.labels.delete(label.id)
                    conn.labelChats = conn.labelChats.filter(a => a.labelId !== label.id)
                } else {
                    conn.labels.set(label.id, {
                        id: label.id,
                        name: label.name,
                        color: label.color ?? 0,
                        predefinedId: label.predefinedId,
                    })
                }
                console.log(`[BAILEYS] Label sync botId=${botId}: ${conn.labels.size} etiquetas`)
            })

            sock.ev.on('labels.association', ({ type: actionType, association }: any) => {
                if (association?.type === 'label_jid') {
                    if (actionType === 'add') {
                        // Avoid duplicates
                        const exists = conn.labelChats.some(
                            a => a.labelId === association.labelId && a.chatId === association.chatId
                        )
                        if (!exists) {
                            conn.labelChats.push({ labelId: association.labelId, chatId: association.chatId })
                        }
                    } else {
                        conn.labelChats = conn.labelChats.filter(
                            a => !(a.labelId === association.labelId && a.chatId === association.chatId)
                        )
                    }
                }
            })

        } catch (err) {
            console.error(`[BAILEYS] Error al iniciar conexión para bot ${botId}:`, err)
            connections.delete(botId)
        }
    },

    disconnect(botId: string) {
        const conn = connections.get(botId)
        if (conn?.sock) conn.sock.logout().catch(() => { })
        connections.delete(botId)
        const sessionDir = path.join(SESSIONS_DIR, botId)
        if (fs.existsSync(sessionDir)) fs.rmSync(sessionDir, { recursive: true, force: true })
        prisma.bot.update({ where: { id: botId }, data: { baileysPhone: null } }).catch(() => { })
    },
}

if (!global.__follow_up_worker_started) {
    global.__follow_up_worker_started = true
    setInterval(() => {
        processFollowUps().catch(() => { })
    }, 60 * 1000)
}

// Start broadcast scheduler alongside baileys
import('@/lib/broadcast-worker').then(({ startBroadcastScheduler }) => {
    startBroadcastScheduler()
}).catch(() => {})
