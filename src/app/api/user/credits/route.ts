export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { getUserCredits, getUserUsageSummary, getUserUsageLogs } from '@/lib/ai-credits'

/** GET — saldo y resumen de uso del usuario autenticado */
export async function GET() {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const [credits, summary, logs] = await Promise.all([
    getUserCredits(user.id),
    getUserUsageSummary(user.id),
    getUserUsageLogs(user.id, 10),
  ])

  return NextResponse.json({ credits, summary, logs })
}
