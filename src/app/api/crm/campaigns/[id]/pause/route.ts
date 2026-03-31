export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const campaign = await (prisma as any).broadcastCampaign.findFirst({
        where: { id: params.id, userId: user.id },
    })
    if (!campaign) return NextResponse.json({ error: 'Campaña no encontrada' }, { status: 404 })
    if (campaign.status !== 'RUNNING') {
        return NextResponse.json({ error: 'Solo se puede pausar una campaña en ejecución' }, { status: 400 })
    }

    await (prisma as any).broadcastCampaign.update({
        where: { id: params.id },
        data: { status: 'PAUSED' },
    })

    return NextResponse.json({ ok: true })
}
