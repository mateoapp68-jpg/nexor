export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/** GET — checks if Libélula payment gateway is configured AND enabled by admin */
export async function GET() {
  const [keySetting, enabledSetting] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: 'LIBELULA_APPKEY' } }),
    prisma.appSetting.findUnique({ where: { key: 'LIBELULA_ENABLED' } }),
  ])
  const available = !!(keySetting?.value?.trim()) && enabledSetting?.value === 'true'
  return NextResponse.json({ available })
}
