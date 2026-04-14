import { prisma } from './prisma'
import { chatWithUsage, FOLLOWUP_MODEL } from './openai'
import { sendText } from './ycloud'
import { decrypt } from './crypto'
import { BaileysManager } from './baileys-manager'
import { resolveOpenAIKey, logAiUsage } from './ai-credits'

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

/**
 * Procesa los seguimientos automáticos pendientes (15 min y 3 días).
 * Se puede llamar desde un cron job o un intervalo.
 */
export async function processFollowUps() {
    const now = new Date()

    // 1. Buscar seguimientos de 15 minutos pendientes
    const followUps1 = await prisma.conversation.findMany({
        where: {
            sold: false,
            botDisabled: false,
            followUp1At: { lte: now },
            followUp1Sent: false,
            bot: { status: 'ACTIVE' },
        },
        include: {
            bot: {
                include: { secret: true }
            },
            messages: {
                orderBy: { createdAt: 'desc' },
                take: 10,
            }
        }
    })

    // 2. Buscar seguimientos de 3 días pendientes
    const followUps2 = await prisma.conversation.findMany({
        where: {
            sold: false,
            botDisabled: false,
            followUp2At: { lte: now },
            followUp2Sent: false,
            bot: { status: 'ACTIVE' },
        },
        include: {
            bot: {
                include: { secret: true }
            },
            messages: {
                orderBy: { createdAt: 'desc' },
                take: 10,
            }
        }
    })

    console.log(`[WORKER] Iniciando proceso de seguimientos. Pendientes: 15m=${followUps1.length}, 3d=${followUps2.length}`)

    for (const conv of followUps1) {
        await executeFollowUp(conv, 1)
    }

    for (const conv of followUps2) {
        await executeFollowUp(conv, 2)
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function executeFollowUp(conv: any, type: 1 | 2) {
    const { bot, userPhone, userName, messages, id: conversationId } = conv

    console.log(`[WORKER] Ejecutando seguimiento ${type} para ${userPhone} (${userName})`)

    try {
        const resolvedKey = await resolveOpenAIKey(bot.id)
        if (!resolvedKey) {
            console.warn(`[WORKER] Bot ${bot.id} sin API key de OpenAI (sin key propia ni saldo global), omitiendo seguimiento`)
            return
        }
        const openaiKey = resolvedKey.key
        // ✅ FIX 1: Decodificar JSON de los mensajes del asistente antes de pasar al prompt
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const history = messages.reverse().map((m: any) => {
            if (m.role === 'assistant') {
                try {
                    const parsed = JSON.parse(m.content)
                    const text = [parsed.mensaje1, parsed.mensaje2, parsed.mensaje3].filter(Boolean).join('\n')
                    return { role: 'assistant' as const, content: text || m.content }
                } catch {
                    return { role: 'assistant' as const, content: m.content }
                }
            }
            return { role: m.role as 'user' | 'assistant', content: m.content }
        })

        const delayMinutes = type === 1 ? bot.followUp1Delay : bot.followUp2Delay
        const delayText = delayMinutes >= 1440 ? `${Math.floor(delayMinutes / 1440)} días` : `${delayMinutes} minutos`

        const prompt = `Actúa como el asistente de ventas de "${bot.name}".
El cliente ${userName || 'interesado'} (${userPhone}) escribió hace ${delayText}, pero la conversación quedó inconclusa y no se concretó el pedido.

Historial reciente:
${history.map((h: any) => `${h.role}: ${h.content.slice(0, 100)}`).join('\n')}

Genera un mensaje breve, cercano, cálido y muy humano en español para retomar la conversación de manera natural.

OBJETIVO:
Reconectar de forma amable, generar confianza y abrir espacio para que el cliente responda.

REGLAS IMPORTANTES:
1. Usa un tono natural, como si escribieras a alguien conocido.
2. Evita lenguaje robótico, formal o corporativo.
3. No repitas saludos si ya fueron usados en el historial.
4. No menciones que es un seguimiento ni que eres una IA.
5. Máximo 2 frases.
6. El mensaje debe tener mínimo 40 y máximo 80 caracteres.
7. Debe sentirse genuino, cálido y amigable.

IMPORTANTE: Responde únicamente en formato JSON con este schema exacto:
{
  "mensaje1": "mensaje aquí"
}`

        const aiResult = await chatWithUsage(prompt, [], openaiKey, FOLLOWUP_MODEL)
        const aiResponse = aiResult.response
        if (resolvedKey.isGlobal) {
            logAiUsage({ userId: resolvedKey.userId, service: 'follow-up', model: FOLLOWUP_MODEL, promptTokens: aiResult.promptTokens, completionTokens: aiResult.completionTokens }).catch(() => {})
        }
        const messageText = aiResponse.mensaje1 || "¿Hola? ¿Sigues ahí? Queríamos saber si tienes alguna duda con tu pedido."

        // Enviar según el tipo de bot
        let sent = false
        if (bot.type === 'BAILEYS') {
            const status = BaileysManager.getStatus(bot.id)
            if (status.status === 'connected') {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const conn = (global as any).__baileys_connections?.get(bot.id)
                if (conn?.sock) {
                    const jid = userPhone.includes('@') ? userPhone : `${userPhone.replace(/\D/g, '')}@s.whatsapp.net`
                    await conn.sock.sendPresenceUpdate('composing', jid)
                    await sleep(Math.floor(Math.random() * 1000) + 1000)
                    await conn.sock.sendMessage(jid, { text: messageText })
                    sent = true
                }
            }
        } else if (bot.type === 'META') {
            // META follow-ups: use Meta Graph API
            if (bot.secret.metaPageTokenEnc) {
                try {
                    const { sendMetaText } = await import('./meta')
                    const pageToken = decrypt(bot.secret.metaPageTokenEnc)
                    await sendMetaText(userPhone, messageText, pageToken)
                    sent = true
                } catch (metaErr) {
                    console.error(`[WORKER] Error enviando seguimiento Meta a ${userPhone}:`, metaErr)
                }
            } else {
                console.warn(`[WORKER] Bot META ${bot.id} sin Page Token, omitiendo seguimiento`)
            }
        } else {
            // YCLOUD
            if (!bot.secret.ycloudApiKeyEnc) {
                console.warn(`[WORKER] Bot YCloud ${bot.id} sin API key, omitiendo seguimiento`)
            } else {
                const apiKey = decrypt(bot.secret.ycloudApiKeyEnc)
                const from = bot.secret.whatsappInstanceNumber
                const to = userPhone.replace(/\D/g, '')
                await sendText(from, to, messageText, apiKey)
                sent = true
            }
        }

        if (sent) {
            if (type === 1) {
                // El primer seguimiento (15m) se envía una sola vez
                await prisma.conversation.update({
                    where: { id: conversationId },
                    data: { followUp1Sent: true }
                })
            } else {
                // El segundo seguimiento (3 días) es RECURRENTE
                // Lo reprogramamos para dentro de otros N minutos (ej: 4320m = 3 días)
                const nextRun = new Date(Date.now() + (bot.followUp2Delay || 4320) * 60 * 1000)
                await prisma.conversation.update({
                    where: { id: conversationId },
                    data: {
                        followUp2At: nextRun,
                        followUp2Sent: false // Mantener en false para que el worker lo vuelva a procesar
                    }
                })
                console.log(`[WORKER] Seguimiento recurrente (3d) reprogramado para el ${nextRun.toLocaleString()} para ${userPhone}`)
            }

            // Guardar el mensaje enviado en el historial
            await prisma.message.create({
                data: {
                    conversationId,
                    role: 'assistant',
                    type: 'text',
                    content: JSON.stringify({ mensaje1: messageText, mensaje2: '', mensaje3: '', fotos_mensaje1: [], reporte: '' }),
                }
            })

            console.log(`[WORKER] Seguimiento ${type} enviado con éxito a ${userPhone}`)
        } else {
            console.warn(`[WORKER] No se pudo enviar seguimiento a ${userPhone} (Bot desconectado o error)`)
        }

    } catch (err) {
        console.error(`[WORKER] Error en seguimiento ${type} para ${userPhone}:`, err)
    }
}
