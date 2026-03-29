export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getAdminUser, unauthorizedAdmin } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'
import webpush from 'web-push'

/**
 * POST /api/admin/send-push
 * Body: { title, body, link?, userId? }
 * userId = undefined → broadcast to ALL users
 */
export async function POST(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return unauthorizedAdmin()

  const { title, body, link, userId } = await req.json()

  if (!title?.trim() || !body?.trim()) {
    return NextResponse.json({ error: 'title y body son requeridos' }, { status: 400 })
  }

  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return NextResponse.json({ error: 'VAPID keys no configuradas' }, { status: 500 })
  }

  webpush.setVapidDetails(
    'mailto:mateoapp68@gmail.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  )

  // Get subscriptions
  const subscriptions = await prisma.pushSubscription.findMany({
    where: userId ? { userId } : undefined,
    select: { id: true, userId: true, endpoint: true, p256dh: true, auth: true },
  })

  if (subscriptions.length === 0) {
    return NextResponse.json({ sent: 0, failed: 0, message: 'No hay suscriptores' })
  }

  // Create Notification records in DB
  const targetUserIds = [...new Set(subscriptions.map(s => s.userId))]
  await prisma.notification.createMany({
    data: targetUserIds.map(uid => ({
      userId: uid,
      title,
      body,
      link: link ?? null,
    })),
  })

  // Send push to all subscriptions
  const payload = JSON.stringify({ title, body, link: link ?? '/dashboard' })
  let sent = 0
  let failed = 0
  const staleIds: string[] = []

  await Promise.allSettled(
    subscriptions.map(async sub => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        )
        sent++
      } catch (err: unknown) {
        failed++
        // 410 Gone = subscription expired, remove it
        const status = (err as { statusCode?: number }).statusCode
        if (status === 410 || status === 404) {
          staleIds.push(sub.id)
        }
      }
    }),
  )

  // Clean up stale subscriptions
  if (staleIds.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: staleIds } } })
  }

  return NextResponse.json({ sent, failed, total: subscriptions.length })
}
