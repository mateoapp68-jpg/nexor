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
            bot: { select: { id: true, name: true, baileysPhone: true, type: true } },
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
    const { name, prompt, messageExample, templateName, templateLanguage, delayValue, delayUnit, scheduledAt, channelType, botId } = body

    if (!name?.trim()) return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 })

    const campaignName = name.trim()
    const isWaCloud = channelType === 'WHATSAPP_CLOUD'

    let campaign: any

    if (isWaCloud) {
        // WA Cloud: reutilizar el bot WHATSAPP_CLOUD existente del usuario
        if (!botId) return NextResponse.json({ error: 'Seleccioná un bot de WhatsApp Cloud' }, { status: 400 })

        const bot = await prisma.bot.findFirst({
            where: { id: botId, userId: user.id, type: 'WHATSAPP_CLOUD' },
        })
        if (!bot) return NextResponse.json({ error: 'Bot no encontrado o no es de tipo WhatsApp Cloud' }, { status: 404 })

        campaign = await (prisma as any).broadcastCampaign.create({
            data: {
                userId: user.id,
                botId: bot.id,
                name: campaignName,
                prompt: prompt?.trim() || '',
                messageExample: messageExample?.trim() || null,
                templateName: templateName?.trim() || null,
                templateVars: templateName?.trim() && templateLanguage?.trim()
                    ? JSON.stringify({ language: templateLanguage.trim() })
                    : null,
                delayValue: parseInt(delayValue) || 30,
                delayUnit: delayUnit || 'seconds',
                scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
                status: scheduledAt ? 'SCHEDULED' : 'DRAFT',
            },
            include: {
                bot: { select: { id: true, name: true, type: true } },
                images: true,
            },
        })
    } else {
        // Baileys: auto-crear bot dedicado + campaña en una transacción atómica
        const webhookToken = generateSecureToken(32)

        const [, camp] = await prisma.$transaction(async (tx: any) => {
            const bot = await tx.bot.create({
                data: {
                    userId: user.id,
                    name: `__crm__${campaignName}`,
                    type: 'BAILEYS',
                    webhookToken,
                    systemPromptTemplate: '',
                },
            })

            const c = await tx.broadcastCampaign.create({
                data: {
                    userId: user.id,
                    botId: bot.id,
                    name: campaignName,
                    prompt: prompt?.trim() || '',
                    messageExample: messageExample?.trim() || null,
                    delayValue: parseInt(delayValue) || 30,
                    delayUnit: delayUnit || 'seconds',
                    scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
                    status: scheduledAt ? 'SCHEDULED' : 'DRAFT',
                },
                include: {
                    bot: { select: { id: true, name: true, type: true } },
                    images: true,
                },
            })

            return [bot, c]
        })

        campaign = camp
    }

    return NextResponse.json({ campaign }, { status: 201 })
}
