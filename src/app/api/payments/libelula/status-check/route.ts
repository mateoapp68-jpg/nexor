export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/payments/libelula/status-check?transaction_id=UUID
 * Polled by the checkout page to check if payment was confirmed.
 */
export async function GET(req: NextRequest) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const transactionId = req.nextUrl.searchParams.get('transaction_id')
  if (!transactionId) return NextResponse.json({ paid: false })

  const packRequest = await prisma.packPurchaseRequest.findFirst({
    where: {
      userId: user.id,
      notes: { startsWith: `LIBELULA:${transactionId}` },
    },
    select: { status: true },
  })

  return NextResponse.json({ paid: packRequest?.status === 'APPROVED' })
}
