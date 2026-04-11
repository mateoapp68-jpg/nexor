export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateSecureToken } from '@/lib/crypto'

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
    const { name, prompt, delayValue, delayUnit, scheduledAt } = body

    if (!name?.trim()) return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 })
    if (!prompt?.trim()) return NextResponse.json({ error: 'El prompt es requerido' }, { status: 400 })

    // Auto-crear bot Baileys dedicado + campaña en una transacción atómica
    const webhookToken = generateSecureToken(32)
    const campaignName = name.trim()

    const [, campaign] = await prisma.$transaction(async (tx: any) => {
        const bot = await tx.bot.create({
            data: {
                userId: user.id,
                name: `__crm__${campaignName}`,
                type: 'BAILEYS',
                webhookToken,
                systemPromptTemplate: '',
            },
        })

        const camp = await tx.broadcastCampaign.create({
            data: {
                userId: user.id,
                botId: bot.id,
                name: campaignName,
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

        return [bot, camp]
    })

    return NextResponse.json({ campaign }, { status: 201 })
}
