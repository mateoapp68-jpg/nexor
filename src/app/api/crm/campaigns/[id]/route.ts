export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const campaign = await (prisma as any).broadcastCampaign.findFirst({
        where: { id: params.id, userId: user.id },
        include: {
            bot: { select: { id: true, name: true, baileysPhone: true } },
            images: { orderBy: { order: 'asc' } },
            contacts: { orderBy: { createdAt: 'asc' } },
            logs: { orderBy: { sentAt: 'desc' }, take: 100 },
        },
    })

    if (!campaign) return NextResponse.json({ error: 'Campaña no encontrada' }, { status: 404 })
    return NextResponse.json({ campaign })
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const campaign = await (prisma as any).broadcastCampaign.findFirst({
        where: { id: params.id, userId: user.id },
    })
    if (!campaign) return NextResponse.json({ error: 'Campaña no encontrada' }, { status: 404 })
    if (!['DRAFT', 'SCHEDULED'].includes(campaign.status)) {
        return NextResponse.json({ error: 'Solo se puede editar campañas en borrador o programadas' }, { status: 400 })
    }

    const body = await req.json()
    const { name, prompt, delayValue, delayUnit, scheduledAt } = body

    const updated = await (prisma as any).broadcastCampaign.update({
        where: { id: params.id },
        data: {
            ...(name && { name: name.trim() }),
            ...(prompt && { prompt: prompt.trim() }),
            ...(delayValue !== undefined && { delayValue: parseInt(delayValue) }),
            ...(delayUnit && { delayUnit }),
            scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
            status: scheduledAt ? 'SCHEDULED' : 'DRAFT',
        },
    })

    return NextResponse.json({ campaign: updated })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const campaign = await (prisma as any).broadcastCampaign.findFirst({
        where: { id: params.id, userId: user.id },
    })
    if (!campaign) return NextResponse.json({ error: 'Campaña no encontrada' }, { status: 404 })
    if (campaign.status === 'RUNNING') {
        return NextResponse.json({ error: 'No se puede eliminar una campaña en ejecución' }, { status: 400 })
    }

    await (prisma as any).broadcastCampaign.delete({ where: { id: params.id } })
    return NextResponse.json({ ok: true })
}
