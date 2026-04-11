export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { BaileysManager } from '@/lib/baileys-manager'
import { getGlobalOpenAIKey } from '@/lib/ai-credits'
import { decrypt } from '@/lib/crypto'

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
