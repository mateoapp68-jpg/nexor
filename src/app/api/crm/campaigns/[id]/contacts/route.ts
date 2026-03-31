export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import * as XLSX from 'xlsx'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const campaign = await (prisma as any).broadcastCampaign.findFirst({
        where: { id: params.id, userId: user.id },
    })
    if (!campaign) return NextResponse.json({ error: 'Campaña no encontrada' }, { status: 404 })
    if (!['DRAFT', 'SCHEDULED'].includes(campaign.status)) {
        return NextResponse.json({ error: 'Solo se pueden agregar contactos en campañas en borrador' }, { status: 400 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'Archivo Excel requerido' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' })

    if (rows.length === 0) {
        return NextResponse.json({ error: 'El archivo Excel está vacío' }, { status: 400 })
    }

    // Auto-detect columns (case-insensitive, flexible naming)
    const firstRow = rows[0]
    const keys = Object.keys(firstRow)

    const phoneKey = keys.find(k =>
        /tel[eé]?fono|phone|cel|celular|whatsapp|número|numero|nro|contact/i.test(k)
    ) || keys[0]

    const nameKey = keys.find(k =>
        /nombre|name|cliente|contact/i.test(k) && k !== phoneKey
    )

    // Parse and validate contacts
    const contacts: { phone: string; name: string | null }[] = []
    const errors: string[] = []

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        let phone = String(row[phoneKey] || '').trim().replace(/[\s\-\(\)]/g, '')

        if (!phone) { errors.push(`Fila ${i + 2}: teléfono vacío`); continue }

        // Normalize: ensure starts with country code
        if (!phone.startsWith('+')) {
            // Bolivia default (+591) if starts with 6 or 7 (8 digits)
            if (/^[67]\d{7}$/.test(phone)) phone = `+591${phone}`
            else if (!phone.startsWith('591')) phone = `+${phone}`
            else phone = `+${phone}`
        }

        // Basic validation: must have at least 8 digits after +
        if (!/^\+\d{8,15}$/.test(phone)) {
            errors.push(`Fila ${i + 2}: teléfono inválido (${phone})`)
            continue
        }

        const name = nameKey ? String(row[nameKey] || '').trim() || null : null
        contacts.push({ phone, name })
    }

    if (contacts.length === 0) {
        return NextResponse.json({
            error: 'No se encontraron contactos válidos',
            details: errors.slice(0, 10),
        }, { status: 400 })
    }

    // Delete existing pending contacts and re-upload
    await (prisma as any).broadcastContact.deleteMany({
        where: { campaignId: params.id, status: 'PENDING' },
    })

    // Batch insert
    await (prisma as any).broadcastContact.createMany({
        data: contacts.map(c => ({
            campaignId: params.id,
            phone: c.phone,
            name: c.name,
            status: 'PENDING',
        })),
    })

    // Update total count
    const total = await (prisma as any).broadcastContact.count({ where: { campaignId: params.id } })
    await (prisma as any).broadcastCampaign.update({
        where: { id: params.id },
        data: { totalContacts: total },
    })

    return NextResponse.json({
        imported: contacts.length,
        errors: errors.length,
        errorDetails: errors.slice(0, 5),
        total,
    })
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const contacts = await (prisma as any).broadcastContact.findMany({
        where: { campaign: { id: params.id, userId: user.id } },
        orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json({ contacts })
}
