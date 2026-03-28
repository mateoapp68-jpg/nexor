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
  const priceSetting = await prisma.appSetting.findUnique({ where: { key: priceKey } })
  const price = priceSetting?.value ? parseFloat(priceSetting.value) : PRICE_DEFAULTS[isRenewal ? 'RENEWAL' : plan]
  if (!price || price <= 0) {
    return NextResponse.json({ error: 'Precio no configurado. Contacta al administrador.' }, { status: 503 })
  }

  // Validate renewal — user must have this plan active
  if (isRenewal) {
    if (user.plan !== plan) {
      return NextResponse.json({ error: 'Solo puedes renovar tu plan actual.' }, { status: 400 })
    }
  }

  // Check for existing pending request
  const existing = await prisma.packPurchaseRequest.findFirst({
    where: { userId: user.id, status: 'PENDING' },
  })
  if (existing) {
    return NextResponse.json({ error: 'Ya tienes un pago pendiente. Espera a que sea procesado.' }, { status: 409 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const callbackUrl = `${appUrl}/api/payments/libelula/callback`
  const identificadorDeuda = randomUUID()

  const descripcion = `${isRenewal ? 'Renovación' : PLAN_LABELS[plan]} — Nexor`

  const body = {
    appkey,
    descripcion_deuda: descripcion,
    descripcion: descripcion,
    nombre_deuda: descripcion,
    email_cliente: user.email,
    identificador_deuda: identificadorDeuda,
    callback_url: callbackUrl,
    lineas_detalle_deuda: [
      {
        desc_linea: descripcion,
        descripcion: descripcion,
        importe_linea: price,
      },
    ],
  }

  let libelulaData: {
    id_transaccion?: string
    url_pasarela_pagos?: string
    qr_simple_url?: string
    error?: string
    message?: string
  }

  const libelulaApi = testModeSetting?.value === 'true' ? LIBELULA_API_TEST : LIBELULA_API_PROD
  console.log(`[Libélula] usando ${testModeSetting?.value === 'true' ? 'TEST' : 'PRODUCCIÓN'}: ${libelulaApi}`)

  try {
    const libelulaRes = await fetch(libelulaApi, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    libelulaData = await libelulaRes.json()

    if (!libelulaRes.ok || !libelulaData.id_transaccion) {
      const rawBody = JSON.stringify(libelulaData)
      console.error(`[Libélula create] HTTP ${libelulaRes.status} | Request appkey: ${appkey} | Response: ${rawBody}`)
      return NextResponse.json({
        error: `Error Libélula — respuesta del servidor: ${rawBody}`,
        debug: { httpStatus: libelulaRes.status, response: libelulaData }
      }, { status: 502 })
    }
  } catch (err) {
    console.error('[Libélula create] fetch error', err)
    return NextResponse.json({ error: 'No se pudo conectar con la pasarela de pago' }, { status: 502 })
  }

  // Store: LIBELULA:{id_transaccion}:RENEWAL or LIBELULA:{id_transaccion}
  const notes = `LIBELULA:${libelulaData.id_transaccion}${isRenewal ? ':RENEWAL' : ''}`

  await prisma.packPurchaseRequest.create({
    data: {
      userId: user.id,
      plan: plan as 'BASIC' | 'PRO' | 'ELITE',
      price,
      status: 'PENDING',
      notes,
    },
  })

  return NextResponse.json({
    transactionId: libelulaData.id_transaccion,
    paymentUrl: libelulaData.url_pasarela_pagos,
    qrUrl: libelulaData.qr_simple_url,
    price, // return real price so UI can display correctly
  })
}
