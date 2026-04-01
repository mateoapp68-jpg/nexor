export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { getUserCredits } from '@/lib/ai-credits'

/** GET /api/credits/balance — returns the authenticated user's current AI credits balance */
export async function GET() {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const balance = await getUserCredits(user.id)
  return NextResponse.json({ balance })
}
