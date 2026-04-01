'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Zap, QrCode, ExternalLink, Loader2,
  AlertCircle, CheckCircle2, RefreshCw, ChevronRight,
} from 'lucide-react'

const PRESETS = [5, 10, 20, 50]

function CreditsContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const [balance, setBalance] = useState<number | null>(null)
  const [loadingBalance, setLoadingBalance] = useState(true)
  const [libelulaAvailable, setLibelulaAvailable] = useState(false)

  const [amount, setAmount] = useState<string>('10')
  const [customAmount, setCustomAmount] = useState('')
  const [useCustom, setUseCustom] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [payData, setPayData] = useState<{
    transactionId: string
    paymentUrl: string
    qrUrl?: string
    cardUrl?: string
    priceBob: number
    amountUsd: number
  } | null>(null)
  const [qrSecondsLeft, setQrSecondsLeft] = useState<number | null>(null)
  const [done, setDone] = useState(false)
  const [paidAmount, setPaidAmount] = useState<number | null>(null)

  // Handle redirect params from callback
  useEffect(() => {
    const payment = searchParams.get('payment')
    const amt = searchParams.get('amount')
    if (payment === 'success' && amt) {
      setPaidAmount(parseFloat(amt))
      setDone(true)
      fetchBalance()
    }
  }, [searchParams])

  async function fetchBalance() {
    setLoadingBalance(true)
    try {
      const res = await fetch('/api/credits/balance')
      const data = await res.json()
      setBalance(data.balance ?? 0)
    } catch {
      setBalance(0)
    } finally {
      setLoadingBalance(false)
    }
  }

  useEffect(() => {
    fetchBalance()
    fetch('/api/settings')
      .then(r => r.json())
      .then(d => {
        const map = d.settings ?? {}
        setLibelulaAvailable(map['LIBELULA_AVAILABLE'] === 'true')
      })
      .catch(() => {})
  }, [])

  // QR countdown — 5 minutes
  useEffect(() => {
    if (!payData || done) return
    setQrSecondsLeft(5 * 60)
    const tick = setInterval(() => {
      setQrSecondsLeft(prev => {
        if (prev === null || prev <= 1) { clearInterval(tick); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(tick)
  }, [payData, done])

  useEffect(() => {
    if (qrSecondsLeft === 0 && !done) {
      setPayData(null)
      setQrSecondsLeft(null)
    }
  }, [qrSecondsLeft, done])

  // Poll for payment confirmation
  useEffect(() => {
    if (!payData || done) return
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/payments/libelula/status-check?transaction_id=${payData.transactionId}`)
        const data = await res.json()
        if (data.paid) {
          clearInterval(interval)
          setPaidAmount(payData.amountUsd)
          setDone(true)
          fetchBalance()
        }
      } catch { /* ignore */ }
    }, 5000)
    return () => clearInterval(interval)
  }, [payData, done])

  const finalAmount = useCallback(() => {
    if (useCustom) return parseFloat(customAmount) || 0
    return parseFloat(amount) || 0
  }, [useCustom, customAmount, amount])

  async function handleGenerate() {
    const usd = finalAmount()
    if (!usd || usd <= 0) { setError('Selecciona o ingresa un monto válido'); return }
    if (usd > 500) { setError('Monto máximo: $500 USD'); return }
    setLoading(true)
    setError('')
    setPayData(null)
    try {
      const res = await fetch('/api/payments/libelula/credits/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: usd }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al crear el pago')
      setPayData(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al conectar con la pasarela')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen px-4 py-8" style={{ background: '#0B0B12' }}>
      <div className="max-w-md mx-auto">

        <Link href="/dashboard/settings" className="inline-flex items-center gap-2 text-xs text-white/30 hover:text-white/60 transition-colors mb-8">
          <ArrowLeft size={13} /> Volver
        </Link>

        <div className="mb-6">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/25 mb-1">Créditos AI</p>
          <h1 className="text-2xl font-black text-white uppercase tracking-tighter">Recargar saldo</h1>
        </div>

        {/* Balance card */}
        <div className="rounded-2xl p-5 mb-6 flex items-center justify-between"
          style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-1">Saldo actual</p>
            {loadingBalance ? (
              <div className="w-20 h-7 bg-white/5 rounded animate-pulse" />
            ) : (
              <p className="text-3xl font-black text-white">
                ${(balance ?? 0).toFixed(4)}
                <span className="text-sm font-normal text-white/30 ml-1">USD</span>
              </p>
            )}
          </div>
          <button onClick={fetchBalance} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors">
            <RefreshCw size={14} className="text-white/40" />
          </button>
        </div>

        {done ? (
          /* Success state */
          <div className="rounded-3xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(34,197,94,0.2)' }}>
            <div className="h-px" style={{ background: 'linear-gradient(90deg,transparent,rgba(34,197,94,0.5),transparent)' }} />
            <div className="p-6 flex flex-col items-center gap-5 py-10 text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)' }}>
                <CheckCircle2 size={30} className="text-green-400" />
              </div>
              <div>
                <p className="text-lg font-black text-white mb-1">¡Recarga exitosa!</p>
                {paidAmount && (
                  <p className="text-3xl font-black text-green-400 mb-2">+${paidAmount.toFixed(2)} USD</p>
                )}
                <p className="text-xs text-white/40 leading-relaxed max-w-xs">
                  Los créditos ya fueron agregados a tu saldo y puedes usarlos de inmediato en tus agentes AI.
                </p>
              </div>
              <button
                onClick={() => { setDone(false); setPayData(null); setPaidAmount(null); router.replace('/dashboard/credits') }}
                className="w-full py-3 rounded-2xl text-sm font-black text-white/70 bg-white/5 hover:bg-white/10 transition-all"
              >
                Recargar más
              </button>
              <Link
                href="/dashboard/services/whatsapp"
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-black text-black transition-all active:scale-[0.98]"
                style={{ background: 'linear-gradient(135deg, #6366f1, #818cf8)' }}
              >
                <Zap size={14} /> Ir a Agentes AI
              </Link>
            </div>
          </div>
        ) : !libelulaAvailable ? (
          /* Libélula not available */
          <div className="rounded-2xl p-6 flex flex-col items-center gap-3 text-center"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <AlertCircle size={28} className="text-white/20" />
            <p className="text-sm font-bold text-white/40">Recarga no disponible</p>
            <p className="text-xs text-white/25 leading-relaxed">
              La pasarela de pago Libélula no está habilitada. Contacta al administrador para activarla.
            </p>
          </div>
        ) : (
          /* Recharge form */
          <div className="rounded-3xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(99,102,241,0.15)' }}>
            <div className="h-px" style={{ background: 'linear-gradient(90deg,transparent,rgba(99,102,241,0.5),transparent)' }} />
            <div className="p-6 space-y-5">

              {!payData ? (
                <>
                  {/* Preset amounts */}
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-3">Selecciona monto</p>
                    <div className="grid grid-cols-4 gap-2 mb-3">
                      {PRESETS.map(p => (
                        <button
                          key={p}
                          onClick={() => { setUseCustom(false); setAmount(String(p)) }}
                          className="py-3 rounded-xl text-sm font-black transition-all"
                          style={!useCustom && amount === String(p)
                            ? { background: 'linear-gradient(135deg,#4f46e5,#6366f1)', color: '#fff', boxShadow: '0 4px 16px rgba(99,102,241,0.3)' }
                            : { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.08)' }}
                        >
                          ${p}
                        </button>
                      ))}
                    </div>

                    {/* Custom amount */}
                    <div
                      onClick={() => setUseCustom(true)}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-text transition-all"
                      style={useCustom
                        ? { background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.4)' }
                        : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
                    >
                      <span className="text-sm text-white/40 font-bold shrink-0">$ </span>
                      <input
                        type="number"
                        min="1"
                        max="500"
                        step="1"
                        placeholder="Otro monto..."
                        value={customAmount}
                        onChange={e => { setCustomAmount(e.target.value); setUseCustom(true) }}
                        className="flex-1 bg-transparent text-sm text-white placeholder-white/20 outline-none"
                      />
                      <span className="text-xs text-white/25 shrink-0">USD</span>
                    </div>
                  </div>

                  {/* Summary */}
                  {finalAmount() > 0 && (
                    <div className="rounded-xl px-4 py-3 flex items-center justify-between"
                      style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)' }}>
                      <div className="flex items-center gap-2">
                        <Zap size={13} className="text-indigo-400" />
                        <span className="text-xs text-white/50">Créditos que recibirás</span>
                      </div>
                      <span className="text-sm font-black text-indigo-400">+${finalAmount().toFixed(2)} USD</span>
                    </div>
                  )}

                  {error && (
                    <div className="flex items-center gap-2 rounded-xl px-3.5 py-2.5"
                      style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                      <AlertCircle size={13} className="text-red-400 shrink-0" />
                      <p className="text-[11px] text-red-400">{error}</p>
                    </div>
                  )}

                  <button
                    onClick={handleGenerate}
                    disabled={loading || finalAmount() <= 0}
                    className="w-full py-3.5 rounded-2xl text-sm font-black flex items-center justify-center gap-2 transition-all active:scale-[0.98] text-white disabled:opacity-40"
                    style={{ background: 'linear-gradient(135deg,#4f46e5,#6366f1)', boxShadow: '0 4px 24px rgba(99,102,241,0.25)' }}
                  >
                    {loading ? <Loader2 size={15} className="animate-spin" /> : <QrCode size={15} />}
                    {loading ? 'Generando QR...' : `Generar QR · $${finalAmount() > 0 ? finalAmount().toFixed(2) : '0'} USD`}
                  </button>
                </>
              ) : (
                /* QR displayed */
                <div className="space-y-4">
                  <div className="text-center">
                    <p className="text-xs font-black text-white/50 mb-0.5">Recarga de créditos AI</p>
                    <p className="text-2xl font-black text-indigo-400">${payData.amountUsd.toFixed(2)} USD</p>
                    <p className="text-xs text-white/30">Bs. {payData.priceBob.toFixed(2)}</p>
                  </div>

                  {/* QR */}
                  <div className="rounded-2xl border border-white/10 p-5 flex flex-col items-center gap-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/30">
                      Escaneá con tu app bancaria
                    </p>
                    {payData.qrUrl ? (
                      <div className="w-52 h-52 rounded-2xl overflow-hidden bg-white p-2.5">
                        <img src={payData.qrUrl} alt="QR pago" className="w-full h-full object-contain" />
                      </div>
                    ) : (
                      <div className="w-52 h-52 rounded-2xl flex flex-col items-center justify-center gap-2 border border-white/10">
                        <QrCode size={32} className="text-white/20" />
                        <p className="text-[10px] text-white/30 text-center px-4">QR no disponible</p>
                      </div>
                    )}
                    <p className="text-[10px] text-white/25">Tigo Money · BNB · Banco Unión y más</p>
                  </div>

                  {/* Card payment */}
                  <a
                    href={payData.cardUrl || payData.paymentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-xs font-black transition-all active:scale-[0.98]"
                    style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', color: '#818cf8' }}
                  >
                    <ExternalLink size={13} /> Pagar con Tarjeta
                  </a>

                  {/* Countdown + polling indicator */}
                  {qrSecondsLeft !== null && qrSecondsLeft > 0 && (
                    <div className="flex flex-col items-center gap-1">
                      <div className="flex items-center gap-2">
                        <Loader2 size={11} className="animate-spin text-indigo-400" />
                        <p className="text-[11px] text-white/40">Esperando pago...</p>
                        <p className="text-[11px] font-black tabular-nums text-indigo-400">
                          {Math.floor(qrSecondsLeft / 60)}:{String(qrSecondsLeft % 60).padStart(2, '0')}
                        </p>
                      </div>
                      <p className="text-[10px] text-white/20">Los créditos se agregan automáticamente al confirmar</p>
                    </div>
                  )}

                  {/* Cancel / back */}
                  <button
                    onClick={() => { setPayData(null); setQrSecondsLeft(null) }}
                    className="w-full py-2.5 rounded-xl text-xs font-bold text-white/30 hover:text-white/60 transition-colors"
                  >
                    Cancelar y elegir otro monto
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Info footer */}
        {!done && libelulaAvailable && (
          <div className="mt-5 rounded-2xl p-4 space-y-2"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <p className="text-[10px] font-black uppercase tracking-widest text-white/20 mb-2">¿Cómo funciona?</p>
            {[
              ['1', 'Elige el monto en USD que quieres recargar'],
              ['2', 'Escanea el QR o paga con tarjeta vía Libélula'],
              ['3', 'Los créditos se agregan automáticamente a tu saldo'],
              ['4', 'Úsalos en tus agentes AI, publisher y más'],
            ].map(([n, txt]) => (
              <div key={n} className="flex items-start gap-2.5">
                <span className="w-4 h-4 rounded-full bg-indigo-500/20 text-indigo-400 text-[9px] font-black flex items-center justify-center shrink-0 mt-0.5">{n}</span>
                <p className="text-[11px] text-white/30 leading-relaxed">{txt}</p>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}

export default function CreditsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0B0B12' }}>
        <div className="w-8 h-8 border-2 border-white/10 border-t-indigo-400 rounded-full animate-spin" />
      </div>
    }>
      <CreditsContent />
    </Suspense>
  )
}
