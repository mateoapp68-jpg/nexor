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

    const labels = BaileysManager.getLabels(params.botId)

    // For each label, get the contact count
    const labelsWithCount = labels.map(label => ({
        ...label,
        contacts: BaileysManager.getLabelContacts(params.botId, label.id),
        contactCount: BaileysManager.getLabelContacts(params.botId, label.id).length,
    }))

    return NextResponse.json({ labels: labelsWithCount })
}
