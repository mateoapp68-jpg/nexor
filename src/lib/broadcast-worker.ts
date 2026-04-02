/**
 * Broadcast Worker — envía mensajes masivos de WhatsApp por Baileys
 * con delay configurable entre contactos, imágenes rotativas y mensaje único por contacto generado por AI.
 */

import { prisma } from '@/lib/prisma'
import { BaileysManager } from '@/lib/baileys-manager'
import { decrypt } from '@/lib/crypto'

const OPENAI_BASE = 'https://api.openai.com/v1'

async function generateUniqueMessage(prompt: string, contactName: string, apiKey: string): Promise<string> {
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
- Si hay nombre de contacto úsalo al inicio
- Tono boliviano, cercano y directo
- Incluir emojis estratégicamente
- NUNCA generar el mismo mensaje dos veces
- El mensaje debe ser completamente único y diferente cada vez`,
                    },
                    {
                        role: 'user',
                        content: `Genera un mensaje de WhatsApp único y personalizado basado en este tema: "${prompt}".
${contactName ? `El contacto se llama: ${contactName}.` : ''}
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

    // Get bot + secret
    const bot = await prisma.bot.findUnique({
        where: { id: campaign.botId },
        include: { secret: true },
    })
    const botSecret = bot?.secret
    if (!botSecret?.openaiApiKeyEnc) {
        await (prisma as any).broadcastCampaign.update({ where: { id: campaignId }, data: { status: 'FAILED' } })
        return
    }
    const openaiKey = decrypt(botSecret.openaiApiKeyEnc)

    // Auto-reconnect if session exists on disk but not in memory
    const currentStatus = BaileysManager.getStatus(campaign.botId)
    if (currentStatus.status !== 'connected' && bot && botSecret.reportPhone) {
        await BaileysManager.connect(campaign.botId, bot.name, openaiKey, botSecret.reportPhone)
        // Wait up to 20s for connection
        for (let i = 0; i < 20; i++) {
            await new Promise(r => setTimeout(r, 1000))
            if (BaileysManager.getStatus(campaign.botId).status === 'connected') break
        }
    }
    // If still not connected after reconnect attempt, fail the campaign
    if (BaileysManager.getStatus(campaign.botId).status !== 'connected') {
        await (prisma as any).broadcastCampaign.update({
            where: { id: campaignId },
            data: { status: 'FAILED' },
        })
        console.error(`[BROADCAST] Bot ${campaign.botId} no conectado. Campaña ${campaignId} marcada como FAILED.`)
        return
    }

    const images: any[] = campaign.images || []
    let imageIndex: number = campaign.imageIndex || 0
    const delayBetween = delayMs(campaign.delayValue, campaign.delayUnit)

    for (const contact of campaign.contacts) {
        // Re-fetch campaign to check if paused/cancelled
        const fresh = await (prisma as any).broadcastCampaign.findUnique({
            where: { id: campaignId },
            select: { status: true },
        })
        if (fresh?.status === 'PAUSED' || fresh?.status === 'FAILED') break

        try {
            // Generate unique AI message
            const message = await generateUniqueMessage(campaign.prompt, contact.name || '', openaiKey)

            // Get rotating image
            const imageUrl = images.length > 0 ? images[imageIndex % images.length]?.url : null
            const nextImageIndex = images.length > 0 ? (imageIndex + 1) % images.length : 0

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

            // Send media first if available (image or video)
            if (imageUrl) {
                const mediaType = images[imageIndex % images.length]?.type || 'IMAGE'
                if (mediaType === 'VIDEO') {
                    await BaileysManager.sendVideo(campaign.botId, contact.phone, imageUrl).catch(() => {})
                } else {
                    await BaileysManager.sendImage(campaign.botId, contact.phone, imageUrl).catch(() => {})
                }
                await new Promise(r => setTimeout(r, 1500))
            }

            // Send text message
            const sent = await BaileysManager.sendText(campaign.botId, contact.phone, message)

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
                        message,
                        imageUrl: imageUrl || null,
                        status: 'SENT',
                    },
                })
                await (prisma as any).broadcastCampaign.update({
                    where: { id: campaignId },
                    data: { sentCount: { increment: 1 }, imageIndex: nextImageIndex },
                })
                imageIndex = nextImageIndex
            } else {
                throw new Error('sendText retornó false')
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
