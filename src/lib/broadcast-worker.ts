/**
 * Broadcast Worker — envía mensajes masivos de WhatsApp por Baileys
 * con delay configurable entre contactos, imágenes rotativas y mensaje único por contacto generado por AI.
 */

import { prisma } from '@/lib/prisma'
import { BaileysManager } from '@/lib/baileys-manager'
import { decrypt } from '@/lib/crypto'
import { getGlobalOpenAIKey } from '@/lib/ai-credits'

const OPENAI_BASE = 'https://api.openai.com/v1'

async function generateUniqueMessage(prompt: string, _unused: string, apiKey: string): Promise<string> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    try {
        const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            signal: controller.signal,
            body: JSON.stringify({
                model: 'gpt-4o',
                messages: [
                    {
                        role: 'system',
                        content: `Eres un experto en ventas por WhatsApp Bolivia. Genera mensajes cortos, cálidos y únicos.
REGLAS:
- Máximo 3 oraciones
- NUNCA uses el nombre del contacto, NO personalices con nombres
- Tono boliviano, cercano y directo
- Incluir emojis estratégicamente
- NUNCA generar el mismo mensaje dos veces
- El mensaje debe ser completamente único y diferente cada vez
- El mensaje debe ser genérico, sin dirigirse a nadie por nombre`,
                    },
                    {
                        role: 'user',
                        content: `Genera un mensaje de WhatsApp único basado en este tema: "${prompt}".
No uses nombres propios. El mensaje debe ser genérico.
Genera solo el mensaje, sin comillas, sin explicaciones.`,
                    },
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
        return data.choices?.[0]?.message?.content?.trim() || prompt
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
        },
    })

    if (!campaign || campaign.status === 'COMPLETED' || campaign.status === 'FAILED') return

    // Mark as running
    await (prisma as any).broadcastCampaign.update({
        where: { id: campaignId },
        data: { status: 'RUNNING', startedAt: new Date() },
    })

    // OpenAI key: config del usuario → key global del admin
    let openaiKey = ''
    const oaiConfig = await (prisma as any).openAIConfig.findUnique({ where: { userId: campaign.userId } })
    if (oaiConfig?.isValid && oaiConfig.apiKeyEnc) {
        try { openaiKey = decrypt(oaiConfig.apiKeyEnc) } catch {}
    }
    if (!openaiKey) {
        openaiKey = (await getGlobalOpenAIKey()) ?? ''
    }
    const allMedia: any[] = campaign.images || []
    const audioFiles = allMedia.filter((m: any) => m.type === 'AUDIO')
    const visualMedia = allMedia.filter((m: any) => m.type !== 'AUDIO')
    const hasAudio = audioFiles.length > 0
    const hasVisual = visualMedia.length > 0

    // Solo requerir OpenAI key si la campaña necesita generar texto (sin audios)
    if (!openaiKey && !hasAudio) {
        await (prisma as any).broadcastCampaign.update({ where: { id: campaignId }, data: { status: 'FAILED' } })
        console.error(`[BROADCAST] No hay OpenAI API Key para campaña ${campaignId}`)
        return
    }

    // Auto-reconnect si hay sesión en disco pero no en memoria
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
    let mediaIndex: number = campaign.imageIndex || 0
    const delayBetween = delayMs(campaign.delayValue, campaign.delayUnit)

    for (const contact of campaign.contacts) {
        // Re-fetch campaign to check if paused/cancelled
        const fresh = await (prisma as any).broadcastCampaign.findUnique({
            where: { id: campaignId },
            select: { status: true },
        })
        if (fresh?.status === 'PAUSED' || fresh?.status === 'FAILED') break

        try {
            // Send via Baileys
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

            let sent = false
            let logMessage = ''
            let logImageUrl: string | null = null
            const nextIndex = allMedia.length > 0 ? (mediaIndex + 1) % Math.max(audioFiles.length, visualMedia.length, 1) : 0

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
                const message = await generateUniqueMessage(campaign.prompt, '', openaiKey)
                logMessage = message

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

                sent = await BaileysManager.sendText(campaign.botId, contact.phone, message)
                if (!sent) throw new Error('sendText retornó false')
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
