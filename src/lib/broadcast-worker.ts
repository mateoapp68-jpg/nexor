/**
 * Broadcast Worker — envía mensajes masivos de WhatsApp por Baileys
 * con delay configurable entre contactos, imágenes rotativas y mensaje único por contacto generado por AI.
 */

import { prisma } from '@/lib/prisma'
import { BaileysManager } from '@/lib/baileys-manager'
import { decrypt } from '@/lib/crypto'
import { getGlobalOpenAIKey, logAiUsage } from '@/lib/ai-credits'
import { sendWaText, sendWaImage, sendWaVideo, sendWaAudio, sendWaTemplate } from '@/lib/whatsapp-cloud'

const OPENAI_BASE = 'https://api.openai.com/v1'

interface GenerateResult {
    message: string
    promptTokens: number
    completionTokens: number
}

async function generateUniqueMessage(
    prompt: string,
    apiKey: string,
    botRules?: string | null,
    messageExample?: string | null,
): Promise<GenerateResult> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)

    const systemContent = [
        botRules?.trim()
            ? `REGLAS Y PERSONALIDAD DEL BOT:\n${botRules.trim()}`
            : null,
        `Eres un experto en ventas por WhatsApp. Genera mensajes cortos, cálidos y únicos.
REGLAS ADICIONALES:
- NUNCA uses el nombre del contacto, el mensaje debe ser genérico
- Incluir emojis estratégicamente
- NUNCA generar el mismo mensaje dos veces
- El mensaje debe ser completamente único y diferente cada vez`,
        messageExample?.trim()
            ? `EJEMPLAR DE REFERENCIA (seguí este estilo y formato exacto, pero con contenido diferente):\n"${messageExample.trim()}"`
            : null,
    ].filter(Boolean).join('\n\n')

    const userContent = messageExample?.trim()
        ? `Genera un mensaje de WhatsApp único para este tema: "${prompt}". Seguí el estilo del ejemplar de referencia pero con contenido completamente diferente. Genera solo el mensaje, sin comillas, sin explicaciones.`
        : `Genera un mensaje de WhatsApp único basado en este tema: "${prompt}". No uses nombres propios. Genera solo el mensaje, sin comillas, sin explicaciones.`

    try {
        const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            signal: controller.signal,
            body: JSON.stringify({
                model: 'gpt-4o',
                messages: [
                    { role: 'system', content: systemContent },
                    { role: 'user', content: userContent },
                ],
                temperature: 1.0,
                max_tokens: 200,
            }),
        })
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}))
            throw new Error(`OpenAI error: ${errData?.error?.message || res.status}`)
        }
        const data = await res.json()
        return {
            message: data.choices?.[0]?.message?.content?.trim() || prompt,
            promptTokens: data.usage?.prompt_tokens ?? 0,
            completionTokens: data.usage?.completion_tokens ?? 0,
        }
    } finally {
        clearTimeout(timeout)
    }
}

function delayMs(value: number, unit: string): number {
    if (unit === 'minutes') return value * 60 * 1000
    return value * 1000
}

export async function executeBroadcast(campaignId: string) {
    const campaign = await (prisma as any).broadcastCampaign.findUnique({
        where: { id: campaignId },
        include: {
            images: { orderBy: { order: 'asc' } },
            contacts: { where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' } },
            bot: {
                select: {
                    type: true,
                    systemPromptTemplate: true,
                    secret: {
                        select: {
                            metaPageTokenEnc: true,
                            metaPhoneNumberId: true,
                        },
                    },
                },
            },
        },
    })

    if (!campaign || campaign.status === 'COMPLETED' || campaign.status === 'FAILED') return

    const isWaCloud = campaign.bot?.type === 'WHATSAPP_CLOUD'

    // Mark as running
    await (prisma as any).broadcastCampaign.update({
        where: { id: campaignId },
        data: { status: 'RUNNING', startedAt: new Date() },
    })

    // OpenAI key: config del usuario → key global del admin (solo si tiene saldo)
    let openaiKey = ''
    let isGlobalKey = false
    const oaiConfig = await (prisma as any).openAIConfig.findUnique({ where: { userId: campaign.userId } })
    if (oaiConfig?.isValid && oaiConfig.apiKeyEnc) {
        try { openaiKey = decrypt(oaiConfig.apiKeyEnc) } catch {}
    }
    if (!openaiKey) {
        const user = await (prisma as any).user.findUnique({ where: { id: campaign.userId }, select: { aiCreditsUsd: true } })
        if (user?.aiCreditsUsd > 0) {
            openaiKey = (await getGlobalOpenAIKey()) ?? ''
            if (openaiKey) isGlobalKey = true
        }
    }
    const allMedia: any[] = campaign.images || []
    const audioFiles = allMedia.filter((m: any) => m.type === 'AUDIO')
    const visualMedia = allMedia.filter((m: any) => m.type !== 'AUDIO')
    const hasAudio = audioFiles.length > 0
    const hasVisual = visualMedia.length > 0

    // Solo requerir OpenAI key si la campaña necesita generar texto (sin audios y sin template)
    const isTemplateMode = !!(campaign.templateName)
    if (!openaiKey && !hasAudio && !isTemplateMode) {
        await (prisma as any).broadcastCampaign.update({ where: { id: campaignId }, data: { status: 'FAILED' } })
        console.error(`[BROADCAST] No hay OpenAI API Key para campaña ${campaignId}`)
        return
    }

    // WA Cloud: verificar que el bot tenga token y phoneNumberId configurados
    if (isWaCloud) {
        if (!campaign.bot?.secret?.metaPageTokenEnc || !campaign.bot?.secret?.metaPhoneNumberId) {
            await (prisma as any).broadcastCampaign.update({ where: { id: campaignId }, data: { status: 'FAILED' } })
            console.error(`[BROADCAST] Bot WHATSAPP_CLOUD sin token o phoneNumberId. Campaña ${campaignId} marcada como FAILED.`)
            return
        }
    } else {
        // Baileys: Auto-reconnect si hay sesión en disco pero no en memoria
        const currentStatus = BaileysManager.getStatus(campaign.botId)
        if (currentStatus.status !== 'connected') {
            await BaileysManager.connect(campaign.botId, campaign.name, openaiKey, '')
            // Esperar hasta 20s para conectar
            for (let i = 0; i < 20; i++) {
                await new Promise(r => setTimeout(r, 1000))
                if (BaileysManager.getStatus(campaign.botId).status === 'connected') break
            }
        }
        // Si sigue desconectado, fallar campaña
        if (BaileysManager.getStatus(campaign.botId).status !== 'connected') {
            await (prisma as any).broadcastCampaign.update({
                where: { id: campaignId },
                data: { status: 'FAILED' },
            })
            console.error(`[BROADCAST] Bot ${campaign.botId} no conectado. Campaña ${campaignId} marcada como FAILED.`)
            return
        }
    }
    let mediaIndex: number = campaign.imageIndex || 0
    const delayBetween = delayMs(campaign.delayValue, campaign.delayUnit)

    for (const contact of campaign.contacts) {
        // Re-fetch campaign to check if paused/cancelled
        const fresh = await (prisma as any).broadcastCampaign.findUnique({
            where: { id: campaignId },
            select: { status: true },
        })
        if (fresh?.status === 'PAUSED' || fresh?.status === 'FAILED') break

        // Verificar que el contacto aún existe en DB (puede haber sido eliminado mientras corría)
        const stillExists = await (prisma as any).broadcastContact.findUnique({
            where: { id: contact.id },
            select: { id: true, status: true },
        })
        if (!stillExists || stillExists.status !== 'PENDING') continue

        try {
            let sent = false
            let logMessage = ''
            let logImageUrl: string | null = null
            const nextIndex = allMedia.length > 0 ? (mediaIndex + 1) % Math.max(audioFiles.length, visualMedia.length, 1) : 0

            if (isWaCloud) {
                // ── WhatsApp Cloud API ──────────────────────────────────────────
                const waToken = decrypt(campaign.bot.secret.metaPageTokenEnc)
                const waPhoneId = campaign.bot.secret.metaPhoneNumberId
                const to = contact.phone.replace(/\D/g, '')

                if (campaign.templateName) {
                    // ── Template mode — envía template aprobado por Meta ──────────
                    let templateLanguage = 'es'
                    try {
                        if (campaign.templateVars) {
                            const vars = JSON.parse(campaign.templateVars as string)
                            if (vars?.language) templateLanguage = vars.language
                        }
                    } catch {}
                    await sendWaTemplate(to, campaign.templateName, templateLanguage, waPhoneId, waToken)
                    sent = true
                    logMessage = `📋 Template: ${campaign.templateName}`
                } else if (hasAudio) {
                    if (hasVisual) {
                        const visual = visualMedia[mediaIndex % visualMedia.length]
                        logImageUrl = visual.url
                        if (visual.type === 'VIDEO') {
                            await sendWaVideo(to, visual.url, waPhoneId, waToken).catch(() => {})
                        } else {
                            await sendWaImage(to, visual.url, waPhoneId, waToken).catch(() => {})
                        }
                        await new Promise(r => setTimeout(r, 1500))
                    }
                    const audio = audioFiles[mediaIndex % audioFiles.length]
                    await sendWaAudio(to, audio.url, waPhoneId, waToken)
                    sent = true
                    logMessage = '🎙️ Audio'
                } else {
                    const generated = await generateUniqueMessage(campaign.prompt, openaiKey, campaign.bot?.systemPromptTemplate, campaign.messageExample)
                    logMessage = generated.message
                    if (isGlobalKey) {
                        logAiUsage({ userId: campaign.userId, service: 'broadcast', model: 'gpt-4o', promptTokens: generated.promptTokens, completionTokens: generated.completionTokens }).catch(() => {})
                    }
                    if (hasVisual) {
                        const visual = visualMedia[mediaIndex % visualMedia.length]
                        logImageUrl = visual.url
                        if (visual.type === 'VIDEO') {
                            await sendWaVideo(to, visual.url, waPhoneId, waToken).catch(() => {})
                        } else {
                            await sendWaImage(to, visual.url, waPhoneId, waToken).catch(() => {})
                        }
                        await new Promise(r => setTimeout(r, 1500))
                    }
                    await sendWaText(to, generated.message, waPhoneId, waToken)
                    sent = true
                }
            } else {
                // ── Baileys ────────────────────────────────────────────────────
                const conn = BaileysManager.getStatus(campaign.botId)
                if (conn.status !== 'connected') {
                    await (prisma as any).broadcastContact.update({
                        where: { id: contact.id },
                        data: { status: 'FAILED', error: 'Bot desconectado', sentAt: new Date() },
                    })
                    await (prisma as any).broadcastCampaign.update({
                        where: { id: campaignId },
                        data: { failedCount: { increment: 1 } },
                    })
                    continue
                }

                if (hasAudio) {
                    // Modo audio: enviar imagen primero si existe, luego audio PTT. Sin texto.
                    if (hasVisual) {
                        const visual = visualMedia[mediaIndex % visualMedia.length]
                        logImageUrl = visual.url
                        if (visual.type === 'VIDEO') {
                            await BaileysManager.sendVideo(campaign.botId, contact.phone, visual.url).catch(() => {})
                        } else {
                            await BaileysManager.sendImage(campaign.botId, contact.phone, visual.url).catch(() => {})
                        }
                        await new Promise(r => setTimeout(r, 1500))
                    }
                    const audio = audioFiles[mediaIndex % audioFiles.length]
                    sent = await BaileysManager.sendAudio(campaign.botId, contact.phone, audio.url)
                    logMessage = '🎙️ Audio'
                } else {
                    // Modo texto: generar mensaje de IA, enviar visual opcional + texto
                    const generated = await generateUniqueMessage(campaign.prompt, openaiKey, campaign.bot?.systemPromptTemplate, campaign.messageExample)
                    logMessage = generated.message
                    if (isGlobalKey) {
                        logAiUsage({ userId: campaign.userId, service: 'broadcast', model: 'gpt-4o', promptTokens: generated.promptTokens, completionTokens: generated.completionTokens }).catch(() => {})
                    }

                    if (hasVisual) {
                        const visual = visualMedia[mediaIndex % visualMedia.length]
                        logImageUrl = visual.url
                        if (visual.type === 'VIDEO') {
                            await BaileysManager.sendVideo(campaign.botId, contact.phone, visual.url).catch(() => {})
                        } else {
                            await BaileysManager.sendImage(campaign.botId, contact.phone, visual.url).catch(() => {})
                        }
                        await new Promise(r => setTimeout(r, 1500))
                    }

                    sent = await BaileysManager.sendText(campaign.botId, contact.phone, generated.message)
                    if (!sent) throw new Error('sendText retornó false')
                }
            }

            if (sent) {
                await (prisma as any).broadcastContact.update({
                    where: { id: contact.id },
                    data: { status: 'SENT', sentAt: new Date() },
                })
                await (prisma as any).broadcastLog.create({
                    data: {
                        campaignId,
                        phone: contact.phone,
                        name: contact.name || null,
                        message: logMessage,
                        imageUrl: logImageUrl,
                        status: 'SENT',
                    },
                })
                await (prisma as any).broadcastCampaign.update({
                    where: { id: campaignId },
                    data: { sentCount: { increment: 1 }, imageIndex: nextIndex },
                })
                mediaIndex = nextIndex
            } else {
                throw new Error('envío retornó false')
            }
        } catch (err: any) {
            await (prisma as any).broadcastContact.update({
                where: { id: contact.id },
                data: { status: 'FAILED', error: err.message || 'Error desconocido', sentAt: new Date() },
            })
            await (prisma as any).broadcastLog.create({
                data: {
                    campaignId,
                    phone: contact.phone,
                    name: contact.name || null,
                    message: '',
                    status: 'FAILED',
                    error: err.message || 'Error desconocido',
                },
            })
            await (prisma as any).broadcastCampaign.update({
                where: { id: campaignId },
                data: { failedCount: { increment: 1 } },
            })
        }

        // Wait delay before next contact
        await new Promise(r => setTimeout(r, delayBetween))
    }

    // Mark as completed
    const finalCampaign = await (prisma as any).broadcastCampaign.findUnique({
        where: { id: campaignId },
        select: { status: true },
    })
    if (finalCampaign?.status === 'RUNNING') {
        await (prisma as any).broadcastCampaign.update({
            where: { id: campaignId },
            data: { status: 'COMPLETED', completedAt: new Date() },
        })
    }
}

// Scheduler — checks every minute for campaigns due to run
let schedulerStarted = false
declare global { var __broadcast_scheduler_started: boolean | undefined }

export function startBroadcastScheduler() {
    if (global.__broadcast_scheduler_started) return
    global.__broadcast_scheduler_started = true

    setInterval(async () => {
        try {
            const due = await (prisma as any).broadcastCampaign.findMany({
                where: {
                    status: 'SCHEDULED',
                    scheduledAt: { lte: new Date() },
                },
                select: { id: true },
            })
            for (const c of due) {
                executeBroadcast(c.id).catch(err =>
                    console.error(`[BROADCAST] Error ejecutando campaña ${c.id}:`, err)
                )
            }
        } catch (err) {
            console.error('[BROADCAST] Scheduler error:', err)
        }
    }, 60 * 1000)
}
