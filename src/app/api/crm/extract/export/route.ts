export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getGroupContacts, getLabelContacts, getAllChats } from '@/lib/whatsapp-extractor'
import * as XLSX from 'xlsx'

/** POST /api/crm/extract/export — exports contacts to Excel with REAL phone numbers only */
export async function POST(req: NextRequest) {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await req.json()
    const { botId, type, selectedIds, mode } = body

    if (!botId) return NextResponse.json({ error: 'botId requerido' }, { status: 400 })
    if (!['groups', 'labels', 'all'].includes(type)) {
        return NextResponse.json({ error: 'type inválido' }, { status: 400 })
    }

    const bot = await prisma.bot.findFirst({ where: { id: botId, userId: user.id } })
    if (!bot) return NextResponse.json({ error: 'Bot no encontrado' }, { status: 404 })

    // Extract contacts based on type
    let result
    if (type === 'groups') {
        if (!Array.isArray(selectedIds) || selectedIds.length === 0) {
            return NextResponse.json({ error: 'Seleccioná al menos un grupo' }, { status: 400 })
        }
        result = await getGroupContacts(botId, selectedIds)
    } else if (type === 'labels') {
        if (!Array.isArray(selectedIds) || selectedIds.length === 0) {
            return NextResponse.json({ error: 'Seleccioná al menos una etiqueta' }, { status: 400 })
        }
        result = await getLabelContacts(botId, selectedIds)
    } else {
        result = await getAllChats(botId)
    }

    if (!result.success || !result.contacts) {
        return NextResponse.json({ error: result.error || 'Error al extraer' }, { status: 500 })
    }

    const contacts = result.contacts
    if (contacts.length === 0) {
        return NextResponse.json({ error: 'No se encontraron contactos con teléfono real' }, { status: 404 })
    }

    // Generate Excel
    const includeName = mode === 'phone_name'
    const rows = contacts.map(c => {
        const row: Record<string, string> = { 'Teléfono': c.phone }
        if (includeName) row['Nombre'] = c.name || ''
        return row
    })

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = includeName ? [{ wch: 18 }, { wch: 28 }] : [{ wch: 18 }]
    XLSX.utils.book_append_sheet(wb, ws, 'Contactos')

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    const filename = type === 'groups'
        ? 'nexor_grupos.xlsx'
        : type === 'labels'
        ? 'nexor_etiquetas.xlsx'
        : 'nexor_chats.xlsx'

    return new NextResponse(buffer, {
        headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'X-Contact-Count': String(contacts.length),
        },
    })
}
