import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Never cache — QR and prices must always be fresh
export const dynamic = 'force-dynamic'
export const revalidate = 0

// Public endpoint — returns only non-sensitive settings users need
const PUBLIC_KEYS = ['PAYMENT_QR_URL', 'PRICE_BASIC', 'PRICE_PRO', 'PRICE_ELITE', 'PRICE_RENEWAL', 'STORE_PAYMENT_CRYPTO', 'STORE_PAYMENT_MANUAL']

export async function GET() {
  try {
    const settings = await prisma.appSetting.findMany({
      where: { key: { in: PUBLIC_KEYS } },
    })

    const map: Record<string, string> = {}
    settings.forEach(s => { map[s.key] = s.value })

    // Expose derived Libélula availability — never expose the raw appkey publicly
    const libelulaSetting = await prisma.appSetting.findUnique({ where: { key: 'LIBELULA_APPKEY' } })
    const libelulaEnabledSetting = await prisma.appSetting.findUnique({ where: { key: 'LIBELULA_ENABLED' } })
    const hasKey = !!(libelulaSetting?.value?.trim())
    const isEnabled = libelulaEnabledSetting?.value === 'true'
    map['LIBELULA_AVAILABLE'] = (hasKey && isEnabled) ? 'true' : 'false'

    return NextResponse.json({ settings: map }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    })
  } catch (err) {
    console.error('[GET /api/settings]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
