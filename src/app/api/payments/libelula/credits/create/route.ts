export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'

const LIBELULA_API_PROD = 'https://api.todotix.com/rest/deuda/registrar'
const LIBELULA_API_TEST = 'http://www.todotix.com:10888/rest/deuda/registrar'

export async function POST(req: NextRequest) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const amountUsd = parseFloat(body.amount)

  if (!amountUsd || amountUsd <= 0 || amountUsd > 500) {
    return NextResponse.json({ error: 'Monto inválido (entre $1 y $500)' }, { status: 400 })
  }

  // Check Libélula is configured and enabled
  const [appkeySetting, enabledSetting, testModeSetting, rateSetting] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: 'LIBELULA_APPKEY' } }),
    prisma.appSetting.findUnique({ where: { key: 'LIBELULA_ENABLED' } }),
    prisma.appSetting.findUnique({ where: { key: 'LIBELULA_TEST_MODE' } }),
    prisma.appSetting.findUnique({ where: { key: 'USD_TO_BOB_RATE' } }),
  ])

  const appkey = appkeySetting?.value?.trim()
  if (!appkey || enabledSetting?.value !== 'true') {
    return NextResponse.json({ error: 'Pasarela de pago no disponible.' }, { status: 503 })
  }

  const usdToBobRaw = rateSetting?.value ? parseFloat(rateSetting.value) : NaN
  const usdToBob = isNaN(usdToBobRaw) || usdToBobRaw <= 0 ? 6.96 : usdToBobRaw
  const priceBob = Math.round(amountUsd * usdToBob * 100) / 100

  // Derive callback URL
  const reqUrl = new URL(req.url)
  const forwardedHost = req.headers.get('x-forwarded-host')
  const forwardedProto = req.headers.get('x-forwarded-proto') || 'https'
  const derivedBase = forwardedHost ? `${forwardedProto}://${forwardedHost}` : `${reqUrl.protocol}//${reqUrl.host}`
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || derivedBase
  const callbackUrl = `${appUrl}/api/payments/libelula/credits/callback`

  const identificadorDeuda = randomUUID()
  const descripcion = `Recarga API $${amountUsd} USD — Nexor`
  const [firstName, ...rest] = (user.fullName || user.username || 'Cliente').split(' ')
  const lastName = rest.join(' ') || firstName

  const pad = (n: number) => String(n).padStart(2, '0')
  const boliviaOffsetMs = -4 * 60 * 60 * 1000
  const tomorrowBolivia = new Date(Date.now() + boliviaOffsetMs + 24 * 60 * 60 * 1000)
  const fechaVencimiento = `${tomorrowBolivia.getUTCFullYear()}-${pad(tomorrowBolivia.getUTCMonth() + 1)}-${pad(tomorrowBolivia.getUTCDate())}`

  const libelulaBody = {
    appkey,
    descripcion,
    email_cliente: user.email,
    nombre_cliente: firstName,
    apellido_cliente: lastName,
    identificador_deuda: identificadorDeuda,
    callback_url: callbackUrl,
    fecha_vencimiento: fechaVencimiento,
    lineas_detalle_deuda: [
      { concepto: descripcion, cantidad: 1, costo_unitario: priceBob, descuento_unitario: 0 },
    ],
  }

  const libelulaApi = testModeSetting?.value === 'true' ? LIBELULA_API_TEST : LIBELULA_API_PROD

  let libelulaData: { id_transaccion?: string; url_pasarela_pagos?: string; qr_simple_url?: string; url_tarjeta?: string }

  try {
    const libelulaRes = await fetch(libelulaApi, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(libelulaBody),
    })
    libelulaData = await libelulaRes.json()
    if (!libelulaRes.ok || !libelulaData.id_transaccion) {
      return NextResponse.json({ error: `Error Libélula: ${JSON.stringify(libelulaData)}` }, { status: 502 })
    }
  } catch (err) {
    console.error('[credits/create] fetch error', err)
    return NextResponse.json({ error: 'No se pudo conectar con la pasarela de pago' }, { status: 502 })
  }

  // Store with NONE plan + CREDITS marker in notes
  await (prisma.packPurchaseRequest as any).create({
    data: {
      userId: user.id,
      plan: 'NONE',
      price: amountUsd,
      status: 'PENDING_VERIFICATION',
      notes: `LIBELULA:${identificadorDeuda}:CREDITS:${amountUsd}`,
    },
  })

  return NextResponse.json({
    transactionId: identificadorDeuda,
    paymentUrl: libelulaData.url_pasarela_pagos,
    qrUrl: libelulaData.qr_simple_url,
    cardUrl: libelulaData.url_tarjeta ?? libelulaData.url_pasarela_pagos,
    amountUsd,
    priceBob,
    usdToBob,
  })
}
