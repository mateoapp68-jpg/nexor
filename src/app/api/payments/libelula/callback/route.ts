export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/payments/libelula/callback?transaction_id=UUID
 * Called by Libélula when a payment is confirmed.
 */
export async function GET(req: NextRequest) {
  const transactionId = req.nextUrl.searchParams.get('transaction_id')

  if (!transactionId) {
    return NextResponse.json({ error: 'transaction_id requerido' }, { status: 400 })
  }

  // Find pending pack request — notes starts with LIBELULA:{transactionId}
  const packRequest = await prisma.packPurchaseRequest.findFirst({
    where: {
      notes: { startsWith: `LIBELULA:${transactionId}` },
      status: 'PENDING',
    },
  })

  if (!packRequest) {
    // Already processed or not found — return 200 so Libélula doesn't retry
    console.log(`[Libélula callback] Transaction ${transactionId} not found or already processed`)
    return NextResponse.json({ ok: true, msg: 'already_processed' })
  }

  const isRenewal = packRequest.notes?.includes(':RENEWAL') ?? false
  const now = new Date()

  try {
    // For renewal: extend from current expiry (if not expired) or from now
    // For new plan: 30 days from now
    let expiresAt: Date

    if (isRenewal) {
      const userRows = await prisma.$queryRaw<Array<{ plan_expires_at: Date | null }>>`
        SELECT plan_expires_at FROM users WHERE id = ${packRequest.userId}::uuid LIMIT 1
      `
      const currentExpiry = userRows[0]?.plan_expires_at
      const base = currentExpiry && currentExpiry > now ? currentExpiry : now
      expiresAt = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000)
    } else {
      expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    }

    await prisma.$transaction(async (tx) => {
      await tx.packPurchaseRequest.update({
        where: { id: packRequest.id },
        data: {
          status: 'APPROVED',
          notes: `${packRequest.notes}:PAID`,
          reviewedAt: now,
        },
      })

      await tx.$executeRaw`
        UPDATE users
        SET plan = CAST(${packRequest.plan} AS "UserPlan"),
            plan_expires_at = ${expiresAt}
        WHERE id = ${packRequest.userId}::uuid
      `
    })

    console.log(`[Libélula callback] Plan ${packRequest.plan} ${isRenewal ? 'renewed' : 'activated'} for user ${packRequest.userId} until ${expiresAt.toISOString()}`)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[Libélula callback] Error activating plan:', err)
    return NextResponse.json({ error: 'Error al activar el plan' }, { status: 500 })
  }
}
