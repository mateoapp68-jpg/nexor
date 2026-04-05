export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { listLabels, getSession } from '@/lib/waweb-extractor'

/** GET /api/crm/waweb/labels — list labels from WhatsApp Web session */
export async function GET() {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const session = getSession(user.id)
    if (!session || session.status !== 'ready') {
        return NextResponse.json({ error: 'Sesión no lista. Escaneá el QR primero.' }, { status: 400 })
    }

    const labels = await listLabels(user.id)
    return NextResponse.json({ labels })
}
