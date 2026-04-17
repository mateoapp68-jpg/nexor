export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateSecureToken } from '@/lib/crypto'

/** POST /api/crm/campaigns/[id]/duplicate — clona la campaña con imágenes y contactos */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const original = await (prisma as any).broadcastCampaign.findFirst({
        where: { id: params.id, userId: user.id },
        include: {
            bot: { select: { type: true } },
            images: { orderBy: { order: 'asc' } },
            contacts: { orderBy: { createdAt: 'asc' } },
        },
    })
    if (!original) return NextResponse.json({ error: 'Campaña no encontrada' }, { status: 404 })

    const newName = `${original.name} (copia)`
    const isWaCloud = original.bot?.type === 'WHATSAPP_CLOUD'

    let newCampaign: any

    if (isWaCloud) {
        // WA Cloud: reutilizar el mismo bot (no crear uno nuevo)
        newCampaign = await (prisma as any).broadcastCampaign.create({
            data: {
                userId: user.id,
                botId: original.botId,
                name: newName,
                prompt: original.prompt,
                messageExample: original.messageExample ?? null,
                templateName: original.templateName ?? null,
                templateVars: original.templateVars ?? null,
                delayValue: original.delayValue,
                delayUnit: original.delayUnit,
                status: 'DRAFT',
                totalContacts: original.contacts.length,
            },
        })
    } else {
        // Baileys: crear bot dedicado + campaña en transacción
        const [, camp] = await prisma.$transaction(async (tx: any) => {
            const bot = await tx.bot.create({
                data: {
                    userId: user.id,
                    name: `__crm__${newName}`,
                    type: 'BAILEYS',
                    webhookToken: generateSecureToken(32),
                    systemPromptTemplate: '',
                },
            })

            const c = await tx.broadcastCampaign.create({
                data: {
                    userId: user.id,
                    botId: bot.id,
                    name: newName,
                    prompt: original.prompt,
                    messageExample: original.messageExample ?? null,
                    delayValue: original.delayValue,
                    delayUnit: original.delayUnit,
                    status: 'DRAFT',
                    totalContacts: original.contacts.length,
                },
            })

            return [bot, c]
        })
        newCampaign = camp
    }

    // Copiar imágenes/audios (mismas URLs, sin re-subir)
    if (original.images.length > 0) {
        await (prisma as any).broadcastImage.createMany({
            data: original.images.map((img: any) => ({
                campaignId: newCampaign.id,
                url: img.url,
                type: img.type,
                order: img.order,
            })),
        })
    }

    // Copiar contactos — todos reseteados a PENDING
    if (original.contacts.length > 0) {
        const CHUNK = 500
        for (let i = 0; i < original.contacts.length; i += CHUNK) {
            await (prisma as any).broadcastContact.createMany({
                data: original.contacts.slice(i, i + CHUNK).map((c: any) => ({
                    campaignId: newCampaign.id,
                    phone: c.phone,
                    name: c.name,
                    status: 'PENDING',
                })),
                skipDuplicates: true,
            })
        }
    }

    return NextResponse.json({ campaign: newCampaign }, { status: 201 })
}
