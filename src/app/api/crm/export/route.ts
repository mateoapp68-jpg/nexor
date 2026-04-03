export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { BaileysManager } from '@/lib/baileys-manager'
import * as XLSX from 'xlsx'

export async function GET(req: NextRequest) {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type') // all_chats | sales | label | campaign
    const botId = searchParams.get('botId')
    const labelId = searchParams.get('labelId')
    const campaignId = searchParams.get('campaignId')

    if (!type) return NextResponse.json({ error: 'Tipo de exportación requerido' }, { status: 400 })

    let rows: { telefono: string; nombre: string; estado: string; fecha: string }[] = []
    let filename = 'contactos'

    // ── All chats from a bot ──
    if (type === 'all_chats') {
        if (!botId) return NextResponse.json({ error: 'botId requerido' }, { status: 400 })
        const bot = await prisma.bot.findFirst({ where: { id: botId, userId: user.id } })
        if (!bot) return NextResponse.json({ error: 'Bot no encontrado' }, { status: 404 })

        const conversations = await prisma.conversation.findMany({
            where: { botId },
            orderBy: { updatedAt: 'desc' },
        })
        rows = conversations.map(c => ({
            telefono: c.userPhone,
            nombre: c.userName || '',
            estado: c.sold ? 'Venta' : c.botDisabled ? 'Bot pausado' : 'Activo',
            fecha: c.updatedAt.toISOString().split('T')[0],
        }))
        filename = `todos_los_chats_${bot.name.replace(/\s+/g, '_')}`
    }

    // ── Sales only ──
    else if (type === 'sales') {
        if (!botId) return NextResponse.json({ error: 'botId requerido' }, { status: 400 })
        const bot = await prisma.bot.findFirst({ where: { id: botId, userId: user.id } })
        if (!bot) return NextResponse.json({ error: 'Bot no encontrado' }, { status: 404 })

        const conversations = await prisma.conversation.findMany({
            where: { botId, sold: true },
            orderBy: { soldAt: 'desc' },
        })
        rows = conversations.map(c => ({
            telefono: c.userPhone,
            nombre: c.userName || '',
            estado: 'Venta',
            fecha: c.soldAt?.toISOString().split('T')[0] || '',
        }))
        filename = `ventas_${bot.name.replace(/\s+/g, '_')}`
    }

    // ── By WhatsApp label ──
    else if (type === 'label') {
        if (!botId || !labelId) return NextResponse.json({ error: 'botId y labelId requeridos' }, { status: 400 })
        const bot = await prisma.bot.findFirst({ where: { id: botId, userId: user.id } })
        if (!bot) return NextResponse.json({ error: 'Bot no encontrado' }, { status: 404 })

        const labels = BaileysManager.getLabels(botId)
        const label = labels.find(l => l.id === labelId)
        const phones = BaileysManager.getLabelContacts(botId, labelId)

        // Try to match with existing conversations for names
        const conversations = await prisma.conversation.findMany({
            where: { botId, userPhone: { in: phones } },
            select: { userPhone: true, userName: true, sold: true, updatedAt: true },
        })
        const convMap = new Map(conversations.map(c => [c.userPhone, c]))

        rows = phones.map(phone => {
            const conv = convMap.get(phone)
            return {
                telefono: phone,
                nombre: conv?.userName || '',
                estado: conv?.sold ? 'Venta' : 'Contacto',
                fecha: conv?.updatedAt?.toISOString().split('T')[0] || '',
            }
        })
        filename = `etiqueta_${(label?.name || labelId).replace(/\s+/g, '_')}`
    }

    // ── Campaign contacts ──
    else if (type === 'campaign') {
        if (!campaignId) return NextResponse.json({ error: 'campaignId requerido' }, { status: 400 })
        const campaign = await (prisma as any).broadcastCampaign.findFirst({
            where: { id: campaignId, userId: user.id },
            include: { contacts: { orderBy: { createdAt: 'asc' } } },
        })
        if (!campaign) return NextResponse.json({ error: 'Campaña no encontrada' }, { status: 404 })

        rows = campaign.contacts.map((c: any) => ({
            telefono: c.phone,
            nombre: c.name || '',
            estado: c.status === 'SENT' ? 'Enviado' : c.status === 'FAILED' ? 'Fallido' : 'Pendiente',
            fecha: c.sentAt?.toISOString().split('T')[0] || '',
        }))
        filename = `campaña_${campaign.name.replace(/\s+/g, '_')}`
    }

    else {
        return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 })
    }

    // Generate Excel
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(rows.map(r => ({
        'Teléfono': r.telefono,
        'Nombre': r.nombre,
        'Estado': r.estado,
        'Fecha': r.fecha,
    })))

    // Column widths
    ws['!cols'] = [{ wch: 18 }, { wch: 25 }, { wch: 15 }, { wch: 12 }]
    XLSX.utils.book_append_sheet(wb, ws, 'Contactos')

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    return new NextResponse(buffer, {
        headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="${filename}.xlsx"`,
        },
    })
}
