export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const campaigns = await (prisma as any).broadcastCampaign.findMany({
        where: { userId: user.id },
        include: {
            bot: { select: { id: true, name: true, baileysPhone: true } },
            images: { orderBy: { order: 'asc' } },
            _count: { select: { contacts: true, logs: true } },
        },
        orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ campaigns })
}

export async function POST(req: NextRequest) {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await req.json()
    const { name, botId, prompt, delayValue, delayUnit, scheduledAt } = body

    if (!name?.trim()) return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 })
    if (!botId) return NextResponse.json({ error: 'Selecciona un bot de WhatsApp' }, { status: 400 })
    if (!prompt?.trim()) return NextResponse.json({ error: 'El prompt es requerido' }, { status: 400 })

    // Verify bot belongs to user and is Baileys type
    const bot = await prisma.bot.findFirst({ where: { id: botId, userId: user.id, type: 'BAILEYS' } })
    if (!bot) return NextResponse.json({ error: 'Bot no encontrado o no compatible (solo Baileys)' }, { status: 404 })

    const campaign = await (prisma as any).broadcastCampaign.create({
        data: {
            userId: user.id,
            botId,
            name: name.trim(),
            prompt: prompt.trim(),
            delayValue: parseInt(delayValue) || 30,
            delayUnit: delayUnit || 'seconds',
            scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
            status: scheduledAt ? 'SCHEDULED' : 'DRAFT',
        },
        include: {
            bot: { select: { id: true, name: true } },
            images: true,
        },
    })

    return NextResponse.json({ campaign }, { status: 201 })
}
