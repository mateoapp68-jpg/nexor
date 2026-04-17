export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { executeBroadcast, startBroadcastScheduler } from '@/lib/broadcast-worker'

startBroadcastScheduler()

export async function POST(_req: Request, { params }: { params: { id: string } }) {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const campaign = await (prisma as any).broadcastCampaign.findFirst({
        where: { id: params.id, userId: user.id },
        include: {
            _count: { select: { contacts: true } },
            images: true,
            bot: {
                select: {
                    type: true,
                    secret: { select: { metaPageTokenEnc: true, metaPhoneNumberId: true } },
                },
            },
        },
    })

    if (!campaign) return NextResponse.json({ error: 'Campaña no encontrada' }, { status: 404 })
    if (campaign.status === 'RUNNING') return NextResponse.json({ error: 'La campaña ya está en ejecución' }, { status: 400 })
    if (campaign.status === 'COMPLETED') return NextResponse.json({ error: 'La campaña ya fue completada' }, { status: 400 })
    if (!['DRAFT', 'SCHEDULED', 'PAUSED', 'FAILED'].includes(campaign.status)) {
        return NextResponse.json({ error: 'No se puede iniciar esta campaña' }, { status: 400 })
    }
    if (campaign._count.contacts === 0) return NextResponse.json({ error: 'Carga contactos antes de ejecutar' }, { status: 400 })

    // WA Cloud: validar credenciales antes de arrancar
    if (campaign.bot?.type === 'WHATSAPP_CLOUD') {
        if (!campaign.bot?.secret?.metaPageTokenEnc || !campaign.bot?.secret?.metaPhoneNumberId) {
            return NextResponse.json({ error: 'El bot de WhatsApp Cloud no tiene token o Phone Number ID configurados. Configuralos en Servicios → WhatsApp.' }, { status: 400 })
        }
    }
    // Media is optional — text-only campaigns (AI-generated text, no media) are valid

    // If FAILED, reset status to allow re-execution
    if (campaign.status === 'FAILED') {
        await (prisma as any).broadcastCampaign.update({
            where: { id: params.id },
            data: { status: 'DRAFT', failedCount: 0 },
        })
        // Reset failed contacts to PENDING so they get retried
        await (prisma as any).broadcastContact.updateMany({
            where: { campaignId: params.id, status: 'FAILED' },
            data: { status: 'PENDING', error: null, sentAt: null },
        })
    }

    // Fire and forget — runs in background
    executeBroadcast(params.id).catch(err =>
        console.error(`[BROADCAST] Error en campaña ${params.id}:`, err)
    )

    return NextResponse.json({ ok: true, message: 'Campaña iniciada' })
}
