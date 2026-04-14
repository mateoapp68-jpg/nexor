export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/** PATCH — editar teléfono/nombre de un contacto */
export async function PATCH(req: NextRequest, { params }: { params: { id: string; contactId: string } }) {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const contact = await (prisma as any).broadcastContact.findFirst({
        where: { id: params.contactId, campaign: { id: params.id, userId: user.id } },
    })
    if (!contact) return NextResponse.json({ error: 'Contacto no encontrado' }, { status: 404 })

    const { phone, name } = await req.json()
    if (!phone?.trim()) return NextResponse.json({ error: 'Teléfono requerido' }, { status: 400 })

    let normalized = phone.trim().replace(/[\s\-\(\)\.]/g, '')
    if (/^[67]\d{7}$/.test(normalized)) normalized = '+591' + normalized
    if (!/^\+/.test(normalized)) normalized = '+' + normalized

    const updated = await (prisma as any).broadcastContact.update({
        where: { id: params.contactId },
        data: { phone: normalized, name: name?.trim() || null },
    })

    return NextResponse.json({ contact: updated })
}

/** DELETE — eliminar un contacto */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string; contactId: string } }) {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const contact = await (prisma as any).broadcastContact.findFirst({
        where: { id: params.contactId, campaign: { id: params.id, userId: user.id } },
    })
    if (!contact) return NextResponse.json({ error: 'Contacto no encontrado' }, { status: 404 })

    await (prisma as any).broadcastContact.delete({ where: { id: params.contactId } })

    // Actualizar total
    const total = await (prisma as any).broadcastContact.count({ where: { campaignId: params.id } })
    await (prisma as any).broadcastCampaign.update({
        where: { id: params.id },
        data: { totalContacts: total },
    })

    return NextResponse.json({ ok: true })
}
