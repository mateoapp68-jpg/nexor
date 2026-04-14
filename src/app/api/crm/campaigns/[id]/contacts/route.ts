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

    const contentType = req.headers.get('content-type') || ''

    // ── JSON mode ──
    if (contentType.includes('application/json')) {
        const body = await req.json()

        // Modo agregar contacto individual — permite DRAFT/SCHEDULED/PAUSED/FAILED
        if (body.phone) {
            if (campaign.status === 'RUNNING' || campaign.status === 'COMPLETED') {
                return NextResponse.json({ error: 'No se pueden agregar contactos mientras la campaña está en ejecución o completada' }, { status: 400 })
            }
            let phone = String(body.phone).trim().replace(/[\s\-\(\)\.]/g, '')
            if (/^[67]\d{7}$/.test(phone)) phone = '+591' + phone
            if (!/^\+/.test(phone)) phone = '+' + phone
            if (!/^\+\d{8,15}$/.test(phone)) {
                return NextResponse.json({ error: 'Teléfono inválido' }, { status: 400 })
            }
            const contact = await (prisma as any).broadcastContact.create({
                data: {
                    campaignId: params.id,
                    phone,
                    name: body.name?.trim() || null,
                    status: 'PENDING',
                },
            })
            const total = await (prisma as any).broadcastContact.count({ where: { campaignId: params.id } })
            await (prisma as any).broadcastCampaign.update({ where: { id: params.id }, data: { totalContacts: total } })
            return NextResponse.json({ contact, total }, { status: 201 })
        }

        // Modo bulk: reemplaza todos los contactos pendientes — solo DRAFT/SCHEDULED
        if (!['DRAFT', 'SCHEDULED'].includes(campaign.status)) {
            return NextResponse.json({ error: 'Solo se puede reemplazar contactos en campañas en borrador o programadas' }, { status: 400 })
        }
        const phones: string[] = body.phones || []
        if (phones.length === 0) {
            return NextResponse.json({ error: 'No se recibieron contactos' }, { status: 400 })
        }

        const contacts = phones.map(p => ({
            phone: p.startsWith('+') ? p : `+${p}`,
            name: null as string | null,
        }))

        const seen = new Set<string>()
        const unique = contacts.filter(c => {
            if (seen.has(c.phone)) return false
            seen.add(c.phone)
            return true
        })

        await (prisma as any).broadcastContact.deleteMany({
            where: { campaignId: params.id, status: 'PENDING' },
        })

        const CHUNK = 500
        for (let i = 0; i < unique.length; i += CHUNK) {
            await (prisma as any).broadcastContact.createMany({
                data: unique.slice(i, i + CHUNK).map(c => ({
                    campaignId: params.id,
                    phone: c.phone,
                    name: c.name,
                    status: 'PENDING',
                })),
                skipDuplicates: true,
            })
        }

        const total = await (prisma as any).broadcastContact.count({ where: { campaignId: params.id } })
        await (prisma as any).broadcastCampaign.update({
            where: { id: params.id },
            data: { totalContacts: total },
        })

        return NextResponse.json({ imported: unique.length, errors: 0, duplicates: contacts.length - unique.length, total })
    }

    // ── FormData mode: Excel file upload — solo DRAFT/SCHEDULED ──
    if (!['DRAFT', 'SCHEDULED'].includes(campaign.status)) {
        return NextResponse.json({ error: 'Solo se puede cargar Excel en campañas en borrador o programadas' }, { status: 400 })
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

    // Prioritize exact matches first, then partial
    const phoneKey = keys.find(k => /^(tel[eé]?fono|phone|cel|celular|whatsapp|n[uú]mero|nro)$/i.test(k))
        || keys.find(k => /tel[eé]?fono|phone|celular|whatsapp|n[uú]mero/i.test(k))
        || keys[0]

    const nameKey = keys.find(k =>
        /^(nombre|name|cliente)$/i.test(k) && k !== phoneKey
    ) || keys.find(k =>
        /nombre|name|cliente/i.test(k) && k !== phoneKey
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

    // Deduplicate by phone
    const seen = new Set<string>()
    const uniqueContacts = contacts.filter(c => {
        if (seen.has(c.phone)) return false
        seen.add(c.phone)
        return true
    })

    // Delete existing pending contacts and re-upload
    await (prisma as any).broadcastContact.deleteMany({
        where: { campaignId: params.id, status: 'PENDING' },
    })

    // Batch insert in chunks of 500 to avoid query size limits
    const CHUNK = 500
    for (let i = 0; i < uniqueContacts.length; i += CHUNK) {
        await (prisma as any).broadcastContact.createMany({
            data: uniqueContacts.slice(i, i + CHUNK).map(c => ({
                campaignId: params.id,
                phone: c.phone,
                name: c.name,
                status: 'PENDING',
            })),
            skipDuplicates: true,
        })
    }

    // Update total count
    const total = await (prisma as any).broadcastContact.count({ where: { campaignId: params.id } })
    await (prisma as any).broadcastCampaign.update({
        where: { id: params.id },
        data: { totalContacts: total },
    })

    const duplicates = contacts.length - uniqueContacts.length
    return NextResponse.json({
        imported: uniqueContacts.length,
        errors: errors.length,
        duplicates,
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
