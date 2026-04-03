export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { BaileysManager } from '@/lib/baileys-manager'

function getAuth() {
    const token = cookies().get('auth_token')?.value
    if (!token) return null
    return verifyToken(token)
}

/** GET /api/bots/[botId]/baileys/labels — devuelve etiquetas del bot */
export async function GET(
    _req: NextRequest,
    { params }: { params: { botId: string } },
) {
    const auth = getAuth()
    if (!auth) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const bot = await prisma.bot.findFirst({
        where: { id: params.botId, userId: auth.userId },
        select: { id: true },
    })
    if (!bot) return NextResponse.json({ error: 'Bot no encontrado' }, { status: 404 })

    const status = BaileysManager.getStatus(params.botId)
    if (status.status !== 'connected') {
        return NextResponse.json({ labels: [], error: 'Bot no conectado' })
    }

    // If no labels yet, try to force a resync
    let labels = BaileysManager.getLabels(params.botId)
    if (labels.length === 0) {
        await BaileysManager.resyncLabels(params.botId)
        await new Promise(r => setTimeout(r, 3000))
        labels = BaileysManager.getLabels(params.botId)
    }

    // Resolve contacts for each label (async because of LID resolution)
    const labelsWithCount = await Promise.all(labels.map(async label => {
        const contacts = await BaileysManager.getLabelContacts(params.botId, label.id)
        return {
            ...label,
            contacts,
            contactCount: contacts.length,
        }
    }))

    return NextResponse.json({
        labels: labelsWithCount,
        note: labels.length === 0 ? 'No se encontraron etiquetas. Asegurate de que sea una cuenta WhatsApp Business.' : undefined,
    })
}

/** POST /api/bots/[botId]/baileys/labels — forzar resync de etiquetas */
export async function POST(
    _req: NextRequest,
    { params }: { params: { botId: string } },
) {
    const auth = getAuth()
    if (!auth) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const bot = await prisma.bot.findFirst({
        where: { id: params.botId, userId: auth.userId },
        select: { id: true },
    })
    if (!bot) return NextResponse.json({ error: 'Bot no encontrado' }, { status: 404 })

    const status = BaileysManager.getStatus(params.botId)
    if (status.status !== 'connected') {
        return NextResponse.json({ error: 'Bot no conectado' }, { status: 400 })
    }

    const ok = await BaileysManager.resyncLabels(params.botId)
    if (!ok) {
        return NextResponse.json({ error: 'No se pudo sincronizar. Puede que no sea cuenta Business.' }, { status: 400 })
    }

    await new Promise(r => setTimeout(r, 3000))
    const labels = BaileysManager.getLabels(params.botId)

    const labelsWithCount = await Promise.all(labels.map(async label => {
        const contacts = await BaileysManager.getLabelContacts(params.botId, label.id)
        return {
            ...label,
            contacts,
            contactCount: contacts.length,
        }
    }))

    return NextResponse.json({ labels: labelsWithCount, resynced: true })
}
