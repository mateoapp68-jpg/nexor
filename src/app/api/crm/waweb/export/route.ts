export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { getSession, getGroupContacts, getLabelContacts, getAllChats } from '@/lib/waweb-extractor'
import * as XLSX from 'xlsx'

/** POST /api/crm/waweb/export — export contacts to Excel */
export async function POST(req: NextRequest) {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const session = getSession(user.id)
    if (!session || session.status !== 'ready') {
        return NextResponse.json({ error: 'Sesión no lista' }, { status: 400 })
    }

    const body = await req.json()
    const { type, selectedIds, mode } = body

    let contacts: { phone: string; name: string; source: string }[] = []

    if (type === 'groups') {
        if (!Array.isArray(selectedIds) || selectedIds.length === 0) {
            return NextResponse.json({ error: 'Seleccioná al menos un grupo' }, { status: 400 })
        }
        contacts = await getGroupContacts(user.id, selectedIds)
    } else if (type === 'labels') {
        if (!Array.isArray(selectedIds) || selectedIds.length === 0) {
            return NextResponse.json({ error: 'Seleccioná al menos una etiqueta' }, { status: 400 })
        }
        contacts = await getLabelContacts(user.id, selectedIds)
    } else if (type === 'all') {
        contacts = await getAllChats(user.id)
    } else {
        return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 })
    }

    if (contacts.length === 0) {
        return NextResponse.json({ error: 'No se encontraron contactos' }, { status: 404 })
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

    const filename = type === 'groups' ? 'nexor_grupos.xlsx'
        : type === 'labels' ? 'nexor_etiquetas.xlsx'
        : 'nexor_chats.xlsx'

    return new NextResponse(buffer, {
        headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'X-Contact-Count': String(contacts.length),
        },
    })
}
