export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'

const LIBELULA_API_PROD = 'https://api.todotix.com/rest/deuda/registrar'
const LIBELULA_API_TEST = 'http://www.todotix.com:10888/rest/deuda/registrar'

const PRICE_DEFAULTS: Record<string, number> = {
  BASIC: 49,
  PRO: 99,
  ELITE: 199,
  RENEWAL: 19,
}

const PLAN_LABELS: Record<string, string> = {
  BASIC: 'Pack Básico',
  PRO: 'Pack Pro',
  ELITE: 'Pack Elite',
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { plan, isRenewal } = await req.json()

  // Validate plan
  const validPlans = ['BASIC', 'PRO', 'ELITE']
  if (!validPlans.includes(plan)) {
    return NextResponse.json({ error: 'Plan inválido' }, { status: 400 })
  }

  // Check Libélula is configured AND enabled by admin
  const [appkeySetting, enabledSetting, testModeSetting] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: 'LIBELULA_APPKEY' } }),
    prisma.appSetting.findUnique({ where: { key: 'LIBELULA_ENABLED' } }),
    prisma.appSetting.findUnique({ where: { key: 'LIBELULA_TEST_MODE' } }),
  ])
  const appkey = appkeySetting?.value?.trim()
  if (!appkey || enabledSetting?.value !== 'true') {
    return NextResponse.json({ error: 'Pasarela de pago no disponible.' }, { status: 503 })
  }

  // ── Fetch real price from DB (never trust frontend) ──────────────────────────
  const priceKey = isRenewal ? 'PRICE_RENEWAL' : `PRICE_${plan}`
  const [priceSetting, rateSetting] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: priceKey } }),
    prisma.appSetting.findUnique({ where: { key: 'USD_TO_BOB_RATE' } }),
  ])
  const priceUsd = priceSetting?.value ? parseFloat(priceSetting.value) : PRICE_DEFAULTS[isRenewal ? 'RENEWAL' : plan]
  if (!priceUsd || priceUsd <= 0) {
    return NextResponse.json({ error: 'Precio no configurado. Contacta al administrador.' }, { status: 503 })
  }

  // Convert USD → BOB for Libélula (admin sets the market rate, default 6.96 official)
  const usdToBobRaw = rateSetting?.value ? parseFloat(rateSetting.value) : NaN
  const usdToBob = isNaN(usdToBobRaw) || usdToBobRaw <= 0 ? 6.96 : usdToBobRaw
  const priceBob = Math.round(priceUsd * usdToBob * 100) / 100

  // Validate renewal — user must have this plan active
  if (isRenewal) {
    if (user.plan !== plan) {
      return NextResponse.json({ error: 'Solo puedes renovar tu plan actual.' }, { status: 400 })
    }
  }

  // Check for existing pending request (only block manual PENDING, not Libélula awaiting payment)
  const existing = await prisma.packPurchaseRequest.findFirst({
    where: { userId: user.id, status: 'PENDING' },
  })
  if (existing) {
    return NextResponse.json({ error: 'Ya tienes una solicitud manual pendiente. Espera a que sea procesada.' }, { status: 409 })
  }

  // Derive callback URL from the incoming request so it always matches the actual host
  const reqUrl = new URL(req.url)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || `${reqUrl.protocol}//${reqUrl.host}`
  const callbackUrl = `${appUrl}/api/payments/libelula/callback`
  console.log(`[Libélula] callback_url: ${callbackUrl}`)
  const identificadorDeuda = randomUUID()

  const descripcion = `${isRenewal ? 'Renovación' : PLAN_LABELS[plan]} — Nexor`
  const [firstName, ...rest] = (user.fullName || user.username || 'Cliente').split(' ')
  const lastName = rest.join(' ') || firstName

  // Expiry: 5 minutes from now — Libélula expects Bolivia local time (UTC-4)
  const boliviaOffsetMs = -4 * 60 * 60 * 1000
  const expiryDate = new Date(Date.now() + 5 * 60 * 1000 + boliviaOffsetMs)
  const pad = (n: number) => String(n).padStart(2, '0')
  // Use UTC getters since we already offset manually
  const fechaLimitePago = `${expiryDate.getUTCFullYear()}-${pad(expiryDate.getUTCMonth() + 1)}-${pad(expiryDate.getUTCDate())} ${pad(expiryDate.getUTCHours())}:${pad(expiryDate.getUTCMinutes())}:${pad(expiryDate.getUTCSeconds())}`

  const body = {
    appkey,
    descripcion,
    email_cliente: user.email,
    nombre_cliente: firstName,
    apellido_cliente: lastName,
    identificador_deuda: identificadorDeuda,
    callback_url: callbackUrl,
    fecha_limite_pago: fechaLimitePago,
    lineas_detalle_deuda: [
      {
        concepto: descripcion,
        cantidad: 1,
        costo_unitario: priceBob,
        descuento_unitario: 0,
      },
    ],
  }

  let libelulaData: {
    id_transaccion?: string
    url_pasarela_pagos?: string
    qr_simple_url?: string
    url_tarjeta?: string
    error?: string
    message?: string
  }

  const libelulaApi = testModeSetting?.value === 'true' ? LIBELULA_API_TEST : LIBELULA_API_PROD
  console.log(`[Libélula] usando ${testModeSetting?.value === 'true' ? 'TEST' : 'PRODUCCIÓN'}: ${libelulaApi}`)
  console.log(`[Libélula] request body:`, JSON.stringify({ ...body, appkey: '***' }))

  try {
    const libelulaRes = await fetch(libelulaApi, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    libelulaData = await libelulaRes.json()

    if (!libelulaRes.ok || !libelulaData.id_transaccion) {
      const rawBody = JSON.stringify(libelulaData)
      console.error(`[Libélula create] HTTP ${libelulaRes.status} | Response: ${rawBody}`)
      return NextResponse.json({
        error: `Error Libélula — respuesta del servidor: ${rawBody}`,
        debug: { httpStatus: libelulaRes.status, response: libelulaData }
      }, { status: 502 })
    }
  } catch (err) {
    console.error('[Libélula create] fetch error', err)
    return NextResponse.json({ error: 'No se pudo conectar con la pasarela de pago' }, { status: 502 })
  }

  // Store identificadorDeuda (our UUID) — this is what Libélula sends back as transaction_id in the callback
  const notes = `LIBELULA:${identificadorDeuda}${isRenewal ? ':RENEWAL' : ''}`

  // Use PENDING_VERIFICATION for Libélula — won't block user if they don't pay
  await prisma.packPurchaseRequest.create({
    data: {
      userId: user.id,
      plan: plan as 'BASIC' | 'PRO' | 'ELITE',
      price: priceUsd,
      status: 'PENDING_VERIFICATION',
      notes,
    },
  })

  return NextResponse.json({
    transactionId: identificadorDeuda,
    paymentUrl: libelulaData.url_pasarela_pagos,
    qrUrl: libelulaData.qr_simple_url,
    cardUrl: libelulaData.url_tarjeta ?? libelulaData.url_pasarela_pagos,
    price: priceUsd,
    priceBob,
    usdToBob,
  })
}
