'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, Clock, ShieldCheck, QrCode, ExternalLink, Loader2, AlertCircle } from 'lucide-react'
import { PaymentGateway } from '@/components/PaymentGateway'

const PLAN_LABELS: Record<string, string> = {
  BASIC: 'Pack Básico',
  PRO: 'Pack Pro',
  ELITE: 'Pack Elite',
}

const PRICE_DEFAULTS: Record<string, number> = {
  BASIC: 49,
  PRO: 99,
  ELITE: 199,
  RENEWAL: 19,
}

function CheckoutContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const planId = (searchParams.get('plan') ?? '').toUpperCase()
  const isRenewal = searchParams.get('renewal') === 'true'

  const [price, setPrice] = useState<number | null>(null)
  const [done, setDone] = useState(false)
  const [libelulaAvailable, setLibelulaAvailable] = useState(false)
  const [manualAvailable, setManualAvailable] = useState(true)
  const [payMethod, setPayMethod] = useState<'libelula' | 'manual'>('libelula')

  // Libélula state
  const [libelulaLoading, setLibelulaLoading] = useState(false)
  const [libelulaData, setLibelulaData] = useState<{
    qrUrl?: string
    paymentUrl: string
    cardUrl?: string
    transactionId: string
    priceBob?: number
    usdToBob?: number
  } | null>(null)
  const [libelulaError, setLibelulaError] = useState('')
  const [libelulaPolling, setLibelulaPolling] = useState(false)

  useEffect(() => {
    if (!['BASIC', 'PRO', 'ELITE'].includes(planId)) {
      router.replace('/dashboard/planes')
      return
    }

    fetch('/api/settings')
      .then(r => r.json())
      .then(d => {
        const map = d.settings ?? {}
        const key = isRenewal ? 'PRICE_RENEWAL' : `PRICE_${planId}`
        const val = parseFloat(map[key])
        setPrice(val > 0 ? val : isRenewal ? PRICE_DEFAULTS.RENEWAL : PRICE_DEFAULTS[planId])
        const hasLibelula = map['LIBELULA_AVAILABLE'] === 'true'
        const hasManual = map['STORE_PAYMENT_MANUAL'] !== 'false'
        setLibelulaAvailable(hasLibelula)
        setManualAvailable(hasManual)
        if (!hasLibelula) setPayMethod('manual')
      })
      .catch(() => {
        setPrice(isRenewal ? PRICE_DEFAULTS.RENEWAL : PRICE_DEFAULTS[planId])
        setPayMethod('manual')
      })
  }, [planId, isRenewal, router])

  // Poll for payment confirmation
  useEffect(() => {
    if (!libelulaData || done) return
    setLibelulaPolling(true)

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/payments/libelula/status-check?transaction_id=${libelulaData.transactionId}`)
        const data = await res.json()
        if (data.paid) {
          clearInterval(interval)
          setLibelulaPolling(false)
          setDone(true)
        }
      } catch {
        // ignore polling errors
      }
    }, 5000)

    return () => {
      clearInterval(interval)
      setLibelulaPolling(false)
    }
  }, [libelulaData, done])

  const handleLibelulaCreate = async (openCard = false) => {
    if (!price) return
    setLibelulaLoading(true)
    setLibelulaError('')
    try {
      const res = await fetch('/api/payments/libelula/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planId, isRenewal }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al crear el pago')
      if (data.price && data.price > 0) setPrice(data.price)
      setLibelulaData(data)
      if (openCard && (data.cardUrl || data.paymentUrl)) {
        window.open(data.cardUrl || data.paymentUrl, '_blank')
      }
    } catch (err: unknown) {
      setLibelulaError(err instanceof Error ? err.message : 'Error al conectar con la pasarela de pago')
    } finally {
      setLibelulaLoading(false)
    }
  }

  const handleSubmitPayment = async (proofUrl: string): Promise<'approved' | 'pending_verification'> => {
    const res = await fetch('/api/pack-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // No enviamos price — el backend lo busca en DB para evitar manipulación
      body: JSON.stringify({ plan: planId, isRenewal, paymentProofUrl: proofUrl }),
    })
    const data = await res.json()
    if (!res.ok) {
      throw new Error(data.error ?? 'Error al enviar la solicitud')
    }
    return 'pending_verification'
  }

  const handleSuccess = () => {
    setDone(true)
  }

  if (!['BASIC', 'PRO', 'ELITE'].includes(planId)) return null

  return (
    <div className="min-h-screen px-4 py-8" style={{ background: '#0B0B12' }}>
      <div className="max-w-md mx-auto">

        {/* Back */}
        <Link
          href="/dashboard/planes"
          className="inline-flex items-center gap-2 text-xs text-white/30 hover:text-white/60 transition-colors mb-8"
        >
          <ArrowLeft size={13} /> Volver a Planes
        </Link>

        {/* Header */}
        <div className="mb-6">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/25 mb-1">
            {isRenewal ? 'Renovación' : 'Adquirir plan'}
          </p>
          <h1 className="text-2xl font-black text-white uppercase tracking-tighter">
            {PLAN_LABELS[planId] ?? planId}
          </h1>
        </div>

        {/* Card */}
        <div className="rounded-3xl overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,215,0,0.15)' }}>
          <div className="h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,215,0,0.5), transparent)' }} />

          <div className="p-6">
            {done ? (
              /* Success screen */
              <div className="flex flex-col items-center gap-5 py-6 text-center">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                  style={{ background: 'rgba(255,215,0,0.08)', border: '1px solid rgba(255,215,0,0.25)' }}>
                  <CheckCircle2 size={30} style={{ color: '#FFD700' }} />
                </div>
                <div>
                  <p className="text-base font-black text-white mb-1">
                    {libelulaData ? '¡Pago confirmado!' : '¡Solicitud enviada!'}
                  </p>
                  <p className="text-xs text-white/40 leading-relaxed max-w-xs">
                    {libelulaData
                      ? 'Tu pago fue verificado. Tu plan ya está activo.'
                      : 'Tu comprobante fue recibido. El equipo lo revisará y activará tu plan en menos de 24 horas.'}
                  </p>
                </div>

                {!libelulaData && (
                  <div className="w-full rounded-2xl p-4 flex items-start gap-3"
                    style={{ background: 'rgba(255,215,0,0.04)', border: '1px solid rgba(255,215,0,0.1)' }}>
                    <Clock size={14} style={{ color: '#FFD700' }} className="shrink-0 mt-0.5" />
                    <p className="text-xs text-white/40 leading-relaxed">
                      Recibirás una notificación cuando tu plan esté activo. También puedes revisar el estado en la sección <strong className="text-white/60">Planes</strong>.
                    </p>
                  </div>
                )}

                <Link
                  href="/dashboard"
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-black text-black transition-all active:scale-[0.98] hover:brightness-110"
                  style={{ background: 'linear-gradient(135deg, #B45309, #D97706, #FFD700)' }}
                >
                  Ir al Dashboard
                </Link>
              </div>
            ) : price === null ? (
              /* Loading */
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-2 border-white/10 border-t-amber-400 rounded-full animate-spin" />
              </div>
            ) : (
              <>
                {/* Plan summary */}
                <div className="flex items-center justify-between px-4 py-3 rounded-2xl mb-5"
                  style={{ background: 'rgba(255,215,0,0.04)', border: '1px solid rgba(255,215,0,0.15)' }}>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/30">Plan seleccionado</p>
                    <p className="text-sm font-black text-white">{PLAN_LABELS[planId] ?? planId}</p>
                    {libelulaData?.priceBob && (
                      <p className="text-[10px] text-white/35 mt-0.5">
                        ≈ Bs. {libelulaData.priceBob.toFixed(2)} · tasa {libelulaData.usdToBob}
                      </p>
                    )}
                  </div>
                  <p className="text-2xl font-black text-white">
                    ${price} <span className="text-xs text-white/40">USD</span>
                  </p>
                </div>

                {/* Method tabs — only show if both methods are active */}
                {libelulaAvailable && manualAvailable && (
                  <div className="flex rounded-xl overflow-hidden border border-white/10 mb-5">
                    <button
                      onClick={() => setPayMethod('libelula')}
                      className={`flex-1 py-2.5 text-xs font-black uppercase tracking-wider transition-all ${payMethod === 'libelula' ? 'text-black' : 'text-white/40 hover:text-white/60'}`}
                      style={payMethod === 'libelula' ? { background: 'linear-gradient(135deg, #D97706, #FFD700)' } : { background: 'transparent' }}
                    >
                      QR Libélula
                    </button>
                    <button
                      onClick={() => setPayMethod('manual')}
                      className={`flex-1 py-2.5 text-xs font-black uppercase tracking-wider transition-all ${payMethod === 'manual' ? 'text-white bg-white/10' : 'text-white/40 hover:text-white/60'}`}
                    >
                      Comprobante
                    </button>
                  </div>
                )}

                {/* Libélula flow */}
                {payMethod === 'libelula' && (
                  <div className="space-y-4">
                    {libelulaError && (
                      <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3.5 py-2.5">
                        <AlertCircle size={13} className="text-red-400 shrink-0" />
                        <p className="text-[11px] text-red-400">{libelulaError}</p>
                      </div>
                    )}

                    {!libelulaData ? (
                      <div className="space-y-3">
                        <button
                          onClick={() => handleLibelulaCreate(false)}
                          disabled={libelulaLoading}
                          className="w-full py-3.5 rounded-2xl text-sm font-black flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-60 text-black"
                          style={{ background: 'linear-gradient(135deg, #B45309, #D97706, #FFD700)', boxShadow: '0 4px 24px rgba(255,215,0,0.25)' }}
                        >
                          {libelulaLoading ? (
                            <><Loader2 size={15} className="animate-spin" /> Generando...</>
                          ) : (
                            <><QrCode size={15} /> Pagar con QR</>
                          )}
                        </button>
                        <button
                          onClick={() => handleLibelulaCreate(true)}
                          disabled={libelulaLoading}
                          className="w-full py-3.5 rounded-2xl text-sm font-black flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-60"
                          style={{ background: 'rgba(255,215,0,0.08)', border: '1px solid rgba(255,215,0,0.25)', color: '#FFD700' }}
                        >
                          {libelulaLoading ? (
                            <><Loader2 size={15} className="animate-spin" /> Generando...</>
                          ) : (
                            <><ExternalLink size={15} /> Pagar con Tarjeta</>
                          )}
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <p className="text-[10px] font-black uppercase tracking-widest text-white/30 text-center">
                          Elige cómo pagar <span style={{ color: '#FFD700' }}>${price} USD</span>
                        </p>

                        {/* Opción 1: QR */}
                        <div className="rounded-2xl border border-white/10 p-4 space-y-3">
                          <p className="text-xs font-black text-white/50 flex items-center gap-2">
                            <QrCode size={13} /> Escanear QR
                          </p>
                          <div className="flex justify-center">
                            {libelulaData.qrUrl ? (
                              <div className="w-44 h-44 rounded-xl overflow-hidden bg-white p-2">
                                <img src={libelulaData.qrUrl} alt="QR Libélula" className="w-full h-full object-contain" />
                              </div>
                            ) : (
                              <div className="w-44 h-44 rounded-xl flex flex-col items-center justify-center gap-2 border border-white/10">
                                <QrCode size={28} className="text-white/20" />
                                <p className="text-[10px] text-white/30 text-center px-4">Usa el botón de abajo para pagar</p>
                              </div>
                            )}
                          </div>
                          <p className="text-[10px] text-center text-white/25">QR boliviano · Tigo Money, BNB, etc.</p>
                        </div>

                        {/* Opción 2: Tarjeta */}
                        <a
                          href={libelulaData.cardUrl || libelulaData.paymentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-black transition-all active:scale-[0.98] text-black"
                          style={{ background: 'linear-gradient(135deg, #B45309, #D97706, #FFD700)' }}
                        >
                          <ExternalLink size={14} /> Pagar con Tarjeta
                        </a>

                        {/* Polling */}
                        <div className="flex items-center justify-center gap-2">
                          {libelulaPolling && (
                            <>
                              <Loader2 size={12} className="animate-spin text-white/30" />
                              <p className="text-[11px] text-white/30">Esperando confirmación de pago...</p>
                            </>
                          )}
                        </div>

                        <p className="text-[10px] text-center text-white/20">
                          Tu plan se activa automáticamente al confirmar el pago
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Manual QR / proof upload flow */}
                {payMethod === 'manual' && manualAvailable && (
                  <PaymentGateway
                    plan={PLAN_LABELS[planId] ?? planId}
                    price={price}
                    onSubmitPayment={handleSubmitPayment}
                    onSuccess={handleSuccess}
                    onCancel={() => router.push('/dashboard/planes')}
                  />
                )}
              </>
            )}
          </div>
        </div>

        {/* Trust badge */}
        {!done && (
          <div className="mt-4 flex items-center justify-center gap-2 text-[10px] text-white/20">
            <ShieldCheck size={11} />
            {libelulaAvailable && payMethod === 'libelula'
              ? 'Pago procesado por Libélula · Banco Mercantil Santa Cruz'
              : 'Proceso verificado manualmente por el equipo Nexor'}
          </div>
        )}

      </div>
    </div>
  )
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0B0B12' }}>
        <div className="w-8 h-8 border-2 border-white/10 border-t-amber-400 rounded-full animate-spin" />
      </div>
    }>
      <CheckoutContent />
    </Suspense>
  )
}
