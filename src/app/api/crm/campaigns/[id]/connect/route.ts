export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { BaileysManager } from '@/lib/baileys-manager'
import { getGlobalOpenAIKey } from '@/lib/ai-credits'
import { decrypt } from '@/lib/crypto'

/** PATCH — asigna un bot BAILEYS existente a la campaña */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { botId } = await req.json()
    if (!botId) return NextResponse.json({ error: 'botId requerido' }, { status: 400 })

    // Validar que el bot pertenece al usuario y es BAILEYS
    const bot = await (prisma as any).bot.findFirst({
        where: { id: botId, userId: user.id, type: 'BAILEYS' },
        select: { id: true, name: true },
    })
    if (!bot) return NextResponse.json({ error: 'Bot no encontrado' }, { status: 404 })

    // Obtener la campaña y su bot actual
    const campaign = await (prisma as any).broadcastCampaign.findFirst({
        where: { id: params.id, userId: user.id },
        select: { botId: true },
    })
    if (!campaign) return NextResponse.json({ error: 'Campaña no encontrada' }, { status: 404 })

    const oldBotId = campaign.botId

    // Actualizar la campaña con el nuevo bot
    await (prisma as any).broadcastCampaign.update({
        where: { id: params.id },
        data: { botId },
    })

    // Eliminar el bot __crm__ anterior si era interno
    if (oldBotId && oldBotId !== botId) {
        const oldBot = await (prisma as any).bot.findFirst({
            where: { id: oldBotId, name: { startsWith: '__crm__' } },
        })
        if (oldBot) {
            await (prisma as any).bot.delete({ where: { id: oldBotId } }).catch(() => {})
        }
    }

    const status = BaileysManager.getStatus(botId)
    return NextResponse.json({ ok: true, ...status })
}

/** GET — devuelve el estado de conexión WhatsApp + QR de la campaña */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const campaign = await (prisma as any).broadcastCampaign.findFirst({
        where: { id: params.id, userId: user.id },
        select: { botId: true },
    })
    if (!campaign) return NextResponse.json({ error: 'Campaña no encontrada' }, { status: 404 })

    const status = BaileysManager.getStatus(campaign.botId)
    return NextResponse.json(status)
}

/** POST — inicia la conexión WhatsApp (genera QR) para la campaña */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const campaign = await (prisma as any).broadcastCampaign.findFirst({
        where: { id: params.id, userId: user.id },
        select: { botId: true, name: true },
    })
    if (!campaign) return NextResponse.json({ error: 'Campaña no encontrada' }, { status: 404 })

    // OpenAI key: config del usuario → key global del admin
    let openaiKey = ''
    const oaiConfig = await (prisma as any).openAIConfig.findUnique({ where: { userId: user.id } })
    if (oaiConfig?.isValid && oaiConfig.apiKeyEnc) {
        try { openaiKey = decrypt(oaiConfig.apiKeyEnc) } catch {}
    }
    if (!openaiKey) {
        openaiKey = (await getGlobalOpenAIKey()) ?? ''
    }

    // Iniciar conexión en background usando nombre de la campaña
    BaileysManager.connect(campaign.botId, campaign.name, openaiKey, '').catch(
        err => console.error('[CRM CONNECT]', err)
    )

    return NextResponse.json({ ok: true })
}
