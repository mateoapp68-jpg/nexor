export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getAdminUser, unauthorizedAdmin } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'
import { addCredits, setGlobalOpenAIKey, getGlobalOpenAIKey, getUserUsageSummary } from '@/lib/ai-credits'

/** GET — lista usuarios con sus créditos y uso */
export async function GET(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return unauthorizedAdmin()

  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId')

  // Detalle de un usuario específico
  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, fullName: true, email: true, aiCreditsUsd: true },
    })
    if (!user) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    const summary = await getUserUsageSummary(userId)
    const logs = await (prisma as any).aiUsageLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 30,
    })
    return NextResponse.json({ user, summary, logs })
  }

  // Lista todos los usuarios con créditos
  const users = await prisma.user.findMany({
    select: { id: true, username: true, fullName: true, email: true, aiCreditsUsd: true, plan: true },
    orderBy: { createdAt: 'desc' },
  })

  const globalKeySet = !!(await getGlobalOpenAIKey())

  return NextResponse.json({ users, globalKeySet })
}

/** POST — asignar créditos a usuario o guardar API key global */
export async function POST(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return unauthorizedAdmin()

  const body = await req.json()

  // Guardar global OpenAI key
  if (body.action === 'set_global_key') {
    const { apiKey } = body
    if (!apiKey?.startsWith('sk-')) return NextResponse.json({ error: 'API key inválida' }, { status: 400 })
    await setGlobalOpenAIKey(apiKey)
    return NextResponse.json({ ok: true })
  }

  // Asignar créditos
  if (body.action === 'add_credits') {
    const { userId, amount } = body
    if (!userId || typeof amount !== 'number' || amount === 0) {
      return NextResponse.json({ error: 'userId y amount requeridos' }, { status: 400 })
    }
    const newBalance = await addCredits(userId, amount)
    return NextResponse.json({ ok: true, newBalance })
  }

  // Establecer créditos exactos
  if (body.action === 'set_credits') {
    const { userId, amount } = body
    if (!userId || typeof amount !== 'number' || amount < 0) {
      return NextResponse.json({ error: 'userId y amount >= 0 requeridos' }, { status: 400 })
    }
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { aiCreditsUsd: amount },
      select: { aiCreditsUsd: true },
    })
    return NextResponse.json({ ok: true, newBalance: updated.aiCreditsUsd })
  }

  return NextResponse.json({ error: 'Acción no reconocida' }, { status: 400 })
}
