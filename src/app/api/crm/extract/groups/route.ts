export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { listGroups } from '@/lib/whatsapp-extractor'

/** GET /api/crm/extract/groups?botId=X — lists groups of a bot with resolved/total counts */
export async function GET(req: NextRequest) {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const botId = searchParams.get('botId')
    if (!botId) return NextResponse.json({ error: 'botId requerido' }, { status: 400 })

    const bot = await prisma.bot.findFirst({ where: { id: botId, userId: user.id } })
    if (!bot) return NextResponse.json({ error: 'Bot no encontrado' }, { status: 404 })

    const result = await listGroups(botId)
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 })

    return NextResponse.json({ groups: result.groups })
}
