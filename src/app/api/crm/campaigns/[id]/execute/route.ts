export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { executeBroadcast, startBroadcastScheduler } from '@/lib/broadcast-worker'

startBroadcastScheduler()

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const campaign = await (prisma as any).broadcastCampaign.findFirst({
        where: { id: params.id, userId: user.id },
        include: {
            _count: { select: { contacts: true } },
            images: true,
        },
    })

    if (!campaign) return NextResponse.json({ error: 'Campaña no encontrada' }, { status: 404 })
    if (campaign.status === 'RUNNING') return NextResponse.json({ error: 'La campaña ya está en ejecución' }, { status: 400 })
    if (campaign.status === 'COMPLETED') return NextResponse.json({ error: 'La campaña ya fue completada' }, { status: 400 })
    if (campaign._count.contacts === 0) return NextResponse.json({ error: 'Carga contactos antes de ejecutar' }, { status: 400 })
    if (campaign.images.length === 0) return NextResponse.json({ error: 'Agrega al menos 1 imagen antes de ejecutar' }, { status: 400 })

    // Reset pending contacts if restarting
    if (campaign.status === 'PAUSED') {
        await (prisma as any).broadcastContact.updateMany({
            where: { campaignId: params.id, status: 'PENDING' },
            data: { status: 'PENDING' },
        })
    }

    // Fire and forget — runs in background
    executeBroadcast(params.id).catch(err =>
        console.error(`[BROADCAST] Error en campaña ${params.id}:`, err)
    )

    return NextResponse.json({ ok: true, message: 'Campaña iniciada' })
}
