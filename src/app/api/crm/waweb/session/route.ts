export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { createSession, getSession, destroySession } from '@/lib/waweb-extractor'

/** POST /api/crm/waweb/session — start or get existing session (returns QR or status) */
export async function POST() {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    // Check if session already exists
    let session = getSession(user.id)
    if (!session) {
        session = await createSession(user.id)
    }

    return NextResponse.json({
        status: session.status,
        qr: session.qrBase64 || null,
        phone: session.phone || null,
    })
}

/** GET /api/crm/waweb/session — poll status */
export async function GET() {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const session = getSession(user.id)
    if (!session) {
        return NextResponse.json({ status: 'none' })
    }

    return NextResponse.json({
        status: session.status,
        qr: session.qrBase64 || null,
        phone: session.phone || null,
    })
}

/** DELETE /api/crm/waweb/session — destroy session */
export async function DELETE() {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    await destroySession(user.id)
    return NextResponse.json({ ok: true })
}
