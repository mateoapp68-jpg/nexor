'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { UploadField } from '@/components/UploadField'
import GlobalAiKeyToggle from '@/components/GlobalAiKeyToggle'
import {
  ArrowLeft,
  Plus,
  Bot,
  Copy,
  Check,
  Eye,
  EyeOff,
  Trash2,
  ChevronRight,
  Package,
  Settings,
  Zap,
  Bell,
  ToggleLeft,
  ToggleRight,
  AlertCircle,
  Loader2,
  CheckCircle2,
  MessageCircle,
  Key,
  FileText,
  ShoppingBag,
  Webhook,
  X,
  Edit2,
  Save,
  Smartphone,
  QrCode,
  Wifi,
  WifiOff,
  RefreshCw,
  MessageSquare,
  Share2,
  UserCheck,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Bot {
  id: string
  name: string
  type: 'YCLOUD' | 'BAILEYS' | 'META'
  status: 'ACTIVE' | 'PAUSED'
  webhookToken: string
  systemPromptTemplate: string | null
  maxCharsMensaje1: number | null
  maxCharsMensaje2: number | null
  maxCharsMensaje3: number | null
  baileysPhone: string | null
  followUp1Delay: number
  followUp2Delay: number
  aiModel: string
  createdAt: string
  secret?: { whatsappInstanceNumber: string; reportPhone: string } | null
  _count?: { assignedProducts: number; conversations: number }
  salesCount?: number
}

interface Product {
  id: string
  userId?: string
  name: string
  category: string | null
  benefits: string | null
  usage: string | null
  warnings: string | null
  priceUnit: string | null
  pricePromo2: string | null
  priceSuper6: string | null
  currency: string
  welcomeMessage: string | null
  firstMessage: string | null
  hooks: string[]
  imageMainUrls: string[]
  imagePriceUnitUrl: string | null
  imagePricePromoUrl: string | null
  imagePriceSuperUrl: string | null
  // testimonialsVideoUrls may be string[] (legacy) or {url,label}[] (new)
  testimonialsVideoUrls: Array<string | { url: string; label: string }>
  shippingInfo: string | null
  coverage: string | null
  tags: string[]
  active: boolean
  sharedByUsername?: string | null
  clonedFromId?: string | null
}

type Tab = 'webhook' | 'credentials' | 'prompt' | 'products' | 'qr' | 'followup' | 'chats'

// ─── Small reusable components ────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
      className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/35 hover:text-white"
      title="Copiar"
    >
      {copied ? <Check className="w-4 h-4 text-amber-400" /> : <Copy className="w-4 h-4" />}
    </button>
  )
}

function Alert({ type, msg }: { type: 'error' | 'success'; msg: string }) {
  if (!msg) return null
  return (
    <div
      className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm fade-in ${type === 'error'
        ? 'bg-red-500/10 border border-red-500/20 text-red-400'
        : 'bg-amber-400/10 border border-amber-400/20 text-amber-400'
        }`}
    >
      {type === 'error' ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
      {msg}
    </div>
  )
}

function Spinner({ color }: { color?: string }) {
  return <Loader2 className={`w-4 h-4 animate-spin ${color ?? 'text-amber-400'}`} />
}

// ─── Create Bot Form ──────────────────────────────────────────────────────────

function CreateBotForm({ onCreated }: { onCreated: (bot: Bot, webhookUrl: string) => void }) {
  const [name, setName] = useState('')
  const [type, setType] = useState<'YCLOUD' | 'BAILEYS' | 'META'>('YCLOUD')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/bots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error creando bot')
      onCreated(data.bot, data.webhookUrl)
      setName('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white/5 border border-amber-400/20 p-6 rounded-2xl">
      <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
        <Plus className="w-4 h-4 text-amber-400" />
        Crear nuevo bot
      </h3>

      {/* Tipo de bot */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <button
          type="button"
          onClick={() => setType('YCLOUD')}
          className={`p-3 rounded-xl border text-left transition-all ${type === 'YCLOUD'
            ? 'border-indigo-400/50 bg-indigo-400/10 text-white'
            : 'border-white/10 text-white/35 hover:border-white/20'
            }`}
        >
          <Webhook className="w-4 h-4 mb-1.5" />
          <div className="text-xs font-bold">YCloud</div>
          <div className="text-[10px] text-white/25 mt-0.5">WhatsApp API</div>
        </button>
        <button
          type="button"
          onClick={() => setType('BAILEYS')}
          className={`p-3 rounded-xl border text-left transition-all ${type === 'BAILEYS'
            ? 'border-amber-400/50 bg-amber-400/10 text-white'
            : 'border-white/10 text-white/35 hover:border-white/20'
            }`}
        >
          <Smartphone className="w-4 h-4 mb-1.5" />
          <div className="text-xs font-bold">WA Web</div>
          <div className="text-[10px] text-white/25 mt-0.5">Escanear QR</div>
        </button>
        <button
          type="button"
          onClick={() => setType('META')}
          className={`p-3 rounded-xl border text-left transition-all ${type === 'META'
            ? 'border-amber-400/50 bg-amber-400/10 text-white'
            : 'border-white/10 text-white/35 hover:border-white/20'
            }`}
        >
          <MessageSquare className="w-4 h-4 mb-1.5" />
          <div className="text-xs font-bold">Messenger</div>
          <div className="text-[10px] text-white/25 mt-0.5">Facebook/Instagram</div>
        </button>
      </div>

      {error && <Alert type="error" msg={error} />}
      <div className="flex flex-col sm:flex-row gap-3 mt-4">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Nombre del agente (ej: Agente Ventas Bolivia)"
          className="flex-1 bg-[#0B0B12]/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/35 focus:outline-none focus:border-amber-400/40"
          required
        />
        <button
          type="submit"
          disabled={loading || !name.trim()}
          className="w-full sm:w-auto px-5 py-2.5 bg-amber-400 text-[#0B0B12] font-bold rounded-xl text-sm hover:bg-amber-400/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
        >
          {loading ? <Spinner /> : <Plus className="w-4 h-4" />}
          Crear Bot
        </button>
      </div>
    </form>
  )
}

// ─── Global Analytics Chart ───────────────────────────────────────────────────

type ChartDay = { date: string; conversations: number; sales: number }

const CHART_MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
function fmtChartDate(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  return `${d.getDate()} ${CHART_MONTHS[d.getMonth()]}`
}

function smoothCurvePath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return ''
  const t = 0.25
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(pts.length - 1, i + 2)]
    const cp1x = p1.x + (p2.x - p0.x) * t
    const cp1y = p1.y + (p2.y - p0.y) * t
    const cp2x = p2.x - (p3.x - p1.x) * t
    const cp2y = p2.y - (p3.y - p1.y) * t
    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)} ${cp2x.toFixed(1)} ${cp2y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`
  }
  return d
}

type RecentSale = { userName: string | null; userPhone: string; soldAt: string | null; reporte: string }

function GlobalBotChart({ bots }: { bots: Bot[] }) {
  const [days, setDays] = useState<ChartDay[]>([])
  const [loadingChart, setLoadingChart] = useState(false)
  const [selectedBotId, setSelectedBotId] = useState<string>('')
  const [recentSales, setRecentSales] = useState<RecentSale[]>([])
  const [showSalesModal, setShowSalesModal] = useState(false)
  const [salesSeen, setSalesSeen] = useState(false)
  const [deletingHistory, setDeletingHistory] = useState(false)
  const [windowEnd, setWindowEnd] = useState(0)
  const [WINDOW, setWINDOW] = useState(7)
  const windowRef = useRef(7)
  const dragStartX = useRef<number | null>(null)

  useEffect(() => {
    const update = () => {
      const val = window.innerWidth >= 1024 ? 15 : 7
      setWINDOW(val)
      windowRef.current = val
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  useEffect(() => {
    if (bots.length > 0 && !selectedBotId) setSelectedBotId(bots[0].id)
  }, [bots, selectedBotId])

  useEffect(() => {
    setSalesSeen(false)
    setWindowEnd(0)
  }, [selectedBotId])

  useEffect(() => {
    if (!selectedBotId) return
    setLoadingChart(true)
    fetch(`/api/bots/${selectedBotId}/analytics`)
      .then(r => r.json())
      .then(d => {
        if (d.days) {
          setDays(d.days)
          setRecentSales(d.recentSales ?? [])
        }
        setLoadingChart(false)
      })
      .catch(() => setLoadingChart(false))
  }, [selectedBotId])

  if (bots.length === 0) return null

  // Ventana de días según pantalla
  const endIdx = days.length - windowEnd
  const startIdx = Math.max(0, endIdx - WINDOW)
  const visibleDays = days.slice(startIdx, endIdx)
  const W = 620, H = 180, padL = 36, padR = 16, padT = 28, padB = 36
  const maxVal = Math.max(...visibleDays.map(d => d.conversations), ...visibleDays.map(d => d.sales), 1)

  const xOf = (i: number) => padL + (visibleDays.length > 1 ? i / (visibleDays.length - 1) : 0.5) * (W - padL - padR)
  const yOf = (v: number) => padT + (1 - v / maxVal) * (H - padT - padB)

  const convPoints  = visibleDays.map((d, i) => ({ x: xOf(i), y: yOf(d.conversations), val: d.conversations, date: d.date }))
  const salesPoints = visibleDays.map((d, i) => ({ x: xOf(i), y: yOf(d.sales),          val: d.sales,          date: d.date }))

  const convLine   = smoothCurvePath(convPoints)
  const salesLine  = smoothCurvePath(salesPoints)
  const convArea   = convLine  ? `${convLine}  L ${convPoints[convPoints.length-1].x.toFixed(1)}  ${(H-padB).toFixed(1)} L ${convPoints[0].x.toFixed(1)}  ${(H-padB).toFixed(1)} Z`  : ''
  const salesArea  = salesLine ? `${salesLine} L ${salesPoints[salesPoints.length-1].x.toFixed(1)} ${(H-padB).toFixed(1)} L ${salesPoints[0].x.toFixed(1)} ${(H-padB).toFixed(1)} Z` : ''

  const yVals = [0, Math.round(maxVal / 2), maxVal]

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl" style={{ padding: '20px 20px 16px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#fff', margin: 0, letterSpacing: '0.02em' }}>
            {visibleDays.length > 0
              ? `${fmtChartDate(visibleDays[0].date)} — ${fmtChartDate(visibleDays[visibleDays.length - 1].date)}`
              : 'Últimos 7 días'}
          </p>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', margin: '4px 0 0' }}>
            <span style={{ color: '#818CF8', fontWeight: 700 }}>{visibleDays.reduce((s, d) => s + d.conversations, 0)}</span> personas ·{' '}
            <span style={{ color: '#F59E0B', fontWeight: 700 }}>{visibleDays.reduce((s, d) => s + d.sales, 0)}</span> ventas
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
            <span style={{ display: 'inline-block', width: 10, height: 3, borderRadius: 99, background: '#818CF8' }} />
            ● Personas
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
            <span style={{ display: 'inline-block', width: 10, height: 3, borderRadius: 99, background: '#F59E0B' }} />
            ✦ Ventas
          </span>
        </div>
      </div>

      {/* Bot selector */}
      {bots.length > 1 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {bots.map(b => (
            <button key={b.id} onClick={() => setSelectedBotId(b.id)}
              style={{ padding: '4px 12px', borderRadius: 99, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: '1px solid', transition: 'all 0.15s',
                background: selectedBotId === b.id ? 'rgba(245,158,11,0.12)' : 'transparent',
                borderColor: selectedBotId === b.id ? 'rgba(245,158,11,0.4)' : 'rgba(255,255,255,0.08)',
                color: selectedBotId === b.id ? '#F59E0B' : 'rgba(255,255,255,0.35)',
              }}>
              🤖 {b.name}
              {(b.salesCount ?? 0) > 0 && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  minWidth: 16, height: 16, borderRadius: 99,
                  background: '#F59E0B', color: '#000',
                  fontSize: 9, fontWeight: 800, padding: '0 4px', marginLeft: 4,
                }}>
                  {b.salesCount}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Chart */}
      {loadingChart ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 140 }}>
          <Loader2 className="w-5 h-5 animate-spin text-white/35" />
        </div>
      ) : (
        <div
          style={{ touchAction: 'pan-y', cursor: 'grab', userSelect: 'none' }}
          onPointerDown={e => { dragStartX.current = e.clientX }}
          onPointerUp={e => {
            if (dragStartX.current === null) return
            const delta = dragStartX.current - e.clientX
            const PX_PER_DAY = 28
            const daysMoved = Math.round(Math.abs(delta) / PX_PER_DAY)
            if (daysMoved === 0) { dragStartX.current = null; return }
            if (delta > 0) setWindowEnd(w => Math.min(w + daysMoved, Math.max(0, days.length - windowRef.current)))
            else setWindowEnd(w => Math.max(0, w - daysMoved))
            dragStartX.current = null
          }}
          onPointerLeave={() => { dragStartX.current = null }}
        >
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible', pointerEvents: 'none' }}>
          <defs>
            {/* Conversations — cyan */}
            <linearGradient id="gc-conv-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#818CF8" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#818CF8" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="gc-conv-line" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%"   stopColor="#7DD3FC" />
              <stop offset="100%" stopColor="#818CF8" />
            </linearGradient>
            {/* Sales — green */}
            <linearGradient id="gc-sales-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#F59E0B" stopOpacity="0.20" />
              <stop offset="100%" stopColor="#F59E0B" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="gc-sales-line" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%"   stopColor="#6EE7B7" />
              <stop offset="100%" stopColor="#F59E0B" />
            </linearGradient>
            <filter id="gc-glow-conv" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="2" result="blur"/>
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            <filter id="gc-glow-sales" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="2.5" result="blur"/>
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            <filter id="gc-dot-glow" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="3" result="blur"/>
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>

          {/* Grid */}
          {yVals.map((v, i) => {
            const y = yOf(v)
            return (
              <g key={i}>
                <line x1={padL} y1={y} x2={W - padR} y2={y}
                  stroke="rgba(255,255,255,0.05)" strokeWidth="1"
                  strokeDasharray={i === 0 ? undefined : '3 7'} />
                <text x={padL - 6} y={y + 4} textAnchor="end"
                  fontSize="8" fill="rgba(255,255,255,0.18)" fontFamily="monospace">{v}</text>
              </g>
            )
          })}
          <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB}
            stroke="rgba(255,255,255,0.07)" strokeWidth="1" />

          {/* ── Conversaciones (cyan) ── */}
          {convArea  && <path d={convArea}  fill="url(#gc-conv-area)" />}
          {convLine  && <path d={convLine}  fill="none" stroke="url(#gc-conv-line)"  strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" filter="url(#gc-glow-conv)" />}
          {convPoints.map((p, i) => p.val === 0 ? null : (
            <circle key={i} cx={p.x} cy={p.y} r="2.5" fill="#818CF8" stroke="rgba(0,0,0,0.7)" strokeWidth="1.5" />
          ))}

          {/* ── Ventas (green) con badges ── */}
          {salesArea && <path d={salesArea} fill="url(#gc-sales-area)" />}
          {salesLine && <path d={salesLine} fill="none" stroke="url(#gc-sales-line)" strokeWidth="2"   strokeLinejoin="round" strokeLinecap="round" filter="url(#gc-glow-sales)" />}
          {salesPoints.map((p, i) => {
            if (p.val === 0) return null
            return (
              <g key={i} filter="url(#gc-dot-glow)">
                <circle cx={p.x} cy={p.y} r="10" fill="#F59E0B" opacity="0.07" />
                <rect x={p.x - 11} y={p.y - 30} width="22" height="15" rx="5" fill="#F59E0B" opacity="0.92" />
                <text x={p.x} y={p.y - 19} textAnchor="middle" fontSize="8" fontWeight="800" fill="#000">{p.val}</text>
                <line x1={p.x} y1={p.y - 15} x2={p.x} y2={p.y - 5} stroke="#F59E0B" strokeWidth="1" opacity="0.4" />
                <circle cx={p.x} cy={p.y} r="4" fill="#F59E0B" stroke="rgba(0,0,0,0.7)" strokeWidth="1.5" />
                <circle cx={p.x} cy={p.y} r="2" fill="#fff" opacity="0.5" />
              </g>
            )
          })}

          {/* Fechas */}
          {convPoints.map((p, i) => (
            <text key={i} x={p.x} y={H - 8} textAnchor="middle"
              fontSize="8.5" fill="rgba(255,255,255,0.22)" fontFamily="system-ui">
              {fmtChartDate(p.date)}
            </text>
          ))}
        </svg>
        </div>
      )}

      {/* Footer: open modal */}
      {selectedBotId && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
          <button
            onClick={() => { setShowSalesModal(true); setSalesSeen(true) }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12,
              fontWeight: 700, color: '#818CF8',
              background: 'rgba(129,140,248,0.08)',
              border: '1px solid rgba(129,140,248,0.25)',
              borderRadius: 10, padding: '7px 16px',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            📋 Ver ventas recientes
            {recentSales.length > 0 && !salesSeen && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                minWidth: 18, height: 18, borderRadius: 99,
                background: '#818CF8', color: '#000',
                fontSize: 10, fontWeight: 800, padding: '0 5px',
              }}>
                {recentSales.length}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Modal ventas recientes — portal para escapar del stacking context */}
      {showSalesModal && typeof document !== 'undefined' && createPortal(
        <div
          onClick={() => setShowSalesModal(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 999,
            background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#0B0B12', border: '1px solid rgba(129,140,248,0.2)',
              borderRadius: 18, padding: 24, width: '100%', maxWidth: 520,
              maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 0 40px rgba(129,140,248,0.1)',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#818CF8' }}>📋 Ventas recientes</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {recentSales.length > 0 && (
                  <button
                    onClick={() => {
                      if (!confirm('¿Eliminar todo el historial de conversaciones de este bot? Esta acción no se puede deshacer.')) return
                      setDeletingHistory(true)
                      fetch(`/api/bots/${selectedBotId}/analytics`, { method: 'DELETE' })
                        .then(() => {
                          setRecentSales([])
                          setDays(days.map(d => ({ ...d, conversations: 0, sales: 0 })))
                          setSalesSeen(true)
                        })
                        .catch(() => {})
                        .finally(() => setDeletingHistory(false))
                    }}
                    disabled={deletingHistory}
                    style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '3px 10px', color: 'rgba(239,68,68,0.7)', cursor: deletingHistory ? 'default' : 'pointer', fontSize: 10, fontWeight: 600 }}
                  >
                    {deletingHistory ? '...' : '🗑 Eliminar historial'}
                  </button>
                )}
                <button
                  onClick={() => setShowSalesModal(false)}
                  style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 8, padding: '3px 8px', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 11 }}
                >✕</button>
              </div>
            </div>

            {recentSales.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 11, padding: '28px 0' }}>
                No hay ventas registradas aún
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {recentSales.map((s, i) => (
                  <div key={i} style={{
                    background: 'rgba(245,158,11,0.03)', border: '1px solid rgba(245,158,11,0.08)',
                    borderRadius: 12, padding: '10px 12px',
                  }}>
                    {/* Nombre + fecha */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', wordBreak: 'break-word' }}>
                        {s.userName || 'Sin nombre'}
                      </span>
                      <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', flexShrink: 0 }}>
                        {s.soldAt ? new Date(s.soldAt).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                      </span>
                    </div>
                    {/* Teléfono — línea propia para que no desborde */}
                    <div style={{
                      display: 'inline-block', marginBottom: s.reporte ? 8 : 0,
                      fontSize: 10, fontWeight: 600, color: '#818CF8',
                      background: 'rgba(129,140,248,0.08)', border: '1px solid rgba(129,140,248,0.2)',
                      borderRadius: 5, padding: '2px 7px',
                      wordBreak: 'break-all',
                    }}>
                      📞 {s.userPhone}
                    </div>
                    {/* Reporte — ancho completo */}
                    {s.reporte && (
                      <div style={{
                        fontSize: 11, color: 'rgba(255,255,255,0.6)',
                        background: 'rgba(0,0,0,0.25)', borderRadius: 8,
                        padding: '7px 10px', lineHeight: 1.6,
                        borderLeft: '2px solid rgba(245,158,11,0.3)',
                        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                      }}>
                        {s.reporte}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

// ─── Bot List ─────────────────────────────────────────────────────────────────

function BotCard({ bot, onSelect }: { bot: Bot; onSelect: (bot: Bot) => void }) {
  const isActive = bot.status === 'ACTIVE'
  return (
    <div className={`bg-white/5 p-3 sm:p-5 rounded-2xl border relative overflow-hidden transition-all ${isActive ? 'border-amber-400/20 hover:border-amber-400/35' : 'border-white/8 opacity-80 hover:border-white/15'}`}>
      {/* Active left border glow */}
      {isActive && (
        <div className="absolute left-0 top-3 bottom-3 w-0.5 bg-amber-400/70 rounded-full" />
      )}
      <div className={`absolute inset-0 bg-gradient-to-br to-transparent opacity-0 hover:opacity-100 transition-opacity ${isActive ? 'from-amber-400/5' : 'from-white/3'}`} />
      <button
        onClick={() => onSelect(bot)}
        className="relative z-10 w-full text-left group"
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${isActive ? 'bg-amber-400/10 border-amber-400/20' : 'bg-white/5 border-white/10'}`}>
              <Bot className={`w-5 h-5 ${isActive ? 'text-amber-400' : 'text-white/35'}`} />
            </div>
            <div>
              <div className="font-bold text-white text-sm">{bot.name}</div>
              <div className="text-xs text-white/35 mt-0.5">
                <span className="inline-flex items-center gap-1">
                  <ShoppingBag className="w-3 h-3" /> {bot._count?.assignedProducts ?? 0}
                </span>
                <span className="mx-1.5 text-white/15">·</span>
                <span className="inline-flex items-center gap-1">
                  <MessageCircle className="w-3 h-3" /> {bot._count?.conversations ?? 0}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-full border ${isActive ? 'bg-amber-400/10 text-amber-400 border-amber-400/20' : 'bg-white/5/50 text-white/35 border-white/10'}`}>
              {isActive && (
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-400" />
                </span>
              )}
              {isActive ? 'ACTIVO' : 'PAUSADO'}
            </span>
            <ChevronRight className="w-4 h-4 text-white/25 group-hover:text-white transition-colors" />
          </div>
        </div>
        {bot.secret?.whatsappInstanceNumber && (
          <div className="text-xs text-white/35 flex items-center gap-1">
            <Smartphone className="w-3 h-3" />
            {bot.secret.whatsappInstanceNumber}
          </div>
        )}
      </button>
    </div>
  )
}

// ─── Webhook Tab ──────────────────────────────────────────────────────────────

function WebhookTab({ bot }: { bot: Bot }) {
  const appUrl = typeof window !== 'undefined' ? window.location.origin : 'https://tu-dominio.com'
  const isMeta = bot.type === 'META'
  const webhookUrl = isMeta
    ? `${appUrl}/api/webhooks/meta/${bot.id}`
    : `${appUrl}/api/webhooks/ycloud/whatsapp/${bot.id}?token=${bot.webhookToken}`
  const [clearing, setClearing] = useState(false)
  const [clearMsg, setClearMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null)

  async function handleClearMemory() {
    if (!confirm('⚠️ Esto eliminará TODAS las conversaciones y mensajes de este bot.\n\n¿Estás seguro? Esta acción no se puede deshacer.')) return
    setClearing(true)
    setClearMsg(null)
    try {
      const res = await fetch(`/api/bots/${bot.id}/clear-memory`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al limpiar')
      setClearMsg({ type: 'success', text: `Memoria limpiada correctamente (${data.conversationsDeleted} conversaciones eliminadas)` })
    } catch (err: unknown) {
      setClearMsg({ type: 'error', text: err instanceof Error ? err.message : 'Error desconocido' })
    } finally {
      setClearing(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white/5 border border-indigo-400/20 p-6 rounded-2xl">
        <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
          <Webhook className="w-4 h-4 text-indigo-400" />
          URL del Webhook
        </h3>
        <p className="text-xs text-white/35 mb-4">
          {isMeta
            ? 'Configura esta URL en developers.facebook.com → tu App → Messenger → Webhooks. El Verify Token es el de abajo.'
            : 'Configura esta URL en tu panel de YCloud como Webhook URL para mensajes entrantes.'}
        </p>
        <div className="bg-[#0B0B12]/70 border border-white/5 rounded-xl p-3 flex items-center gap-2">
          <code className="flex-1 text-xs text-indigo-400 break-all font-mono">{webhookUrl}</code>
          <CopyButton text={webhookUrl} />
        </div>
        {isMeta && (
          <div className="mt-3">
            <p className="text-xs text-white/35 mb-2">Verify Token (pégalo en Meta al configurar el webhook):</p>
            <div className="bg-[#0B0B12]/70 border border-white/5 rounded-xl p-3 flex items-center gap-2">
              <code className="flex-1 text-xs text-amber-400 break-all font-mono">{bot.webhookToken}</code>
              <CopyButton text={bot.webhookToken} />
            </div>
          </div>
        )}
      </div>

      {!isMeta && (
        <div className="bg-white/5 border border-white/10 p-6 rounded-2xl">
          <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
            <Key className="w-4 h-4 text-violet-400" />
            Webhook Token (secreto)
          </h3>
          <p className="text-xs text-white/35 mb-4">
            Este token valida que el webhook viene de YCloud. Ya está incluido en la URL anterior como{' '}
            <code className="text-violet-400">?token=...</code>
          </p>
          <div className="bg-[#0B0B12]/70 border border-white/5 rounded-xl p-3 flex items-center gap-2">
            <code className="flex-1 text-xs text-white/50 font-mono truncate">
              {bot.webhookToken.slice(0, 8)}{'*'.repeat(20)}{bot.webhookToken.slice(-4)}
            </code>
            <CopyButton text={bot.webhookToken} />
          </div>
        </div>
      )}

      <div className="bg-white/5 border border-white/10 p-6 rounded-2xl">
        {isMeta ? (
          <>
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <span className="text-base">💬</span> Pasos de configuración en Meta (Facebook Messenger)
            </h3>
            <ol className="space-y-3">
              {[
                'Ve a developers.facebook.com e inicia sesión con tu cuenta de Facebook',
                'Crea o selecciona tu App → en el panel izquierdo ve a Messenger → Configuración',
                'En la sección "Webhooks" haz clic en "Agregar URL de devolución de llamada"',
                'Pega la URL del webhook de arriba en el campo "URL de devolución de llamada"',
                'Pega el Verify Token de arriba en el campo "Token de verificación"',
                'Haz clic en "Verificar y guardar" — Meta enviará el challenge y el bot responderá',
                'En "Suscripciones de campos" activa: messages, messaging_postbacks',
                'En "Tokens de acceso" genera el token para tu Página y guárdalo en Credenciales',
                'Envía un mensaje de prueba a tu Página de Facebook',
              ].map((step, i) => (
                <li key={i} className="flex gap-3 text-sm text-white/50">
                  <span className="w-5 h-5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </>
        ) : (
          <>
            <h3 className="text-sm font-bold text-white mb-3">Pasos de configuración en YCloud</h3>
            <ol className="space-y-3">
              {[
                'Inicia sesión en https://app.ycloud.com',
                'Ve a WhatsApp → Webhooks',
                'Agrega la URL del webhook copiada arriba',
                'Selecciona el evento: inbound_message.received',
                'Guarda la configuración',
                'Envía un mensaje de prueba al número configurado',
              ].map((step, i) => (
                <li key={i} className="flex gap-3 text-sm text-white/50">
                  <span className="w-5 h-5 rounded-full bg-indigo-400/10 border border-indigo-400/20 text-indigo-400 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </>
        )}
      </div>

      {/* ── Zona de riesgo ── */}
      <div className="bg-white/5 border border-red-500/20 p-6 rounded-2xl">
        <h3 className="text-sm font-bold text-red-400 flex items-center gap-2 mb-1">
          <Trash2 className="w-4 h-4" />
          Zona de riesgo
        </h3>
        <p className="text-xs text-white/35 mb-4">
          Elimina permanentemente todo el historial de conversaciones y mensajes de este bot.
          Los productos y la configuración no se verán afectados.
        </p>

        {clearMsg && <div className="mb-4"><Alert type={clearMsg.type} msg={clearMsg.text} /></div>}

        <button
          type="button"
          onClick={handleClearMemory}
          disabled={clearing}
          className="flex items-center gap-2 px-4 py-2.5 bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 hover:border-red-500/50 font-medium rounded-xl text-sm transition-colors disabled:opacity-50"
        >
          {clearing ? <Spinner /> : <Trash2 className="w-4 h-4" />}
          {clearing ? 'Limpiando...' : 'Limpiar memoria del bot'}
        </button>
      </div>
    </div>
  )
}


// ─── Credentials Tab ──────────────────────────────────────────────────────────

function CredentialsTab({ bot, onStatusChange }: { bot: Bot; onStatusChange: (status: 'ACTIVE' | 'PAUSED') => void }) {
  const isBaileys = bot.type === 'BAILEYS'
  const isMeta    = bot.type === 'META'
  const [form, setForm] = useState({
    ycloudApiKey: '',
    openaiApiKey: '',
    whatsappInstanceNumber: '',
    reportPhone: '',
    metaPageToken: '',
  })
  const [selectedModel, setSelectedModel] = useState(bot.aiModel || 'gpt-5.1')
  const [savingModel, setSavingModel] = useState(false)
  const [showYcloud, setShowYcloud] = useState(false)
  const [showOpenai, setShowOpenai] = useState(false)
  const [showMeta, setShowMeta] = useState(false)
  const [creds, setCreds] = useState<{ hasYcloudKey: boolean; hasOpenAIKey: boolean; hasMetaToken: boolean; metaPageTokenHint: string; whatsappInstanceNumber: string; reportPhone: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [savingStatus, setSavingStatus] = useState(false)
  const [msg, setMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null)

  const loadCreds = useCallback(async () => {
    const res = await fetch(`/api/bots/${bot.id}/credentials`)
    if (res.ok) {
      const data = await res.json()
      setCreds(data)
      setForm(f => ({
        ...f,
        whatsappInstanceNumber: data.whatsappInstanceNumber,
        reportPhone: data.reportPhone,
      }))
    }
  }, [bot.id])

  useEffect(() => { loadCreds() }, [loadCreds])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMsg(null)
    try {
      const res = await fetch(`/api/bots/${bot.id}/credentials`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setMsg({ type: 'success', text: 'Credenciales guardadas correctamente' })
      loadCreds()
    } catch (err: unknown) {
      setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Error guardando' })
    } finally {
      setLoading(false)
    }
  }

  async function toggleStatus() {
    setSavingStatus(true)
    const newStatus = bot.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE'
    try {
      const res = await fetch(`/api/bots/${bot.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (res.ok) onStatusChange(newStatus)
    } finally {
      setSavingStatus(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Status toggle */}
      <div className="bg-white/5 border border-white/10 p-5 rounded-2xl flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-bold text-white">Estado del Agente</div>
          <div className="text-xs text-white/35 mt-0.5 truncate">
            {bot.status === 'ACTIVE' ? 'El bot está respondiendo mensajes' : 'El bot está pausado'}
          </div>
        </div>
        <button
          onClick={toggleStatus}
          disabled={savingStatus}
          className="flex items-center gap-1.5 text-sm font-medium transition-colors disabled:opacity-50 shrink-0"
        >
          {savingStatus ? (
            <Spinner />
          ) : bot.status === 'ACTIVE' ? (
            <ToggleRight className="w-8 h-8 text-amber-400" />
          ) : (
            <ToggleLeft className="w-8 h-8 text-white/25" />
          )}
          <span className={bot.status === 'ACTIVE' ? 'text-amber-400' : 'text-white/35'}>
            {bot.status === 'ACTIVE' ? 'Activo' : 'Pausado'}
          </span>
        </button>
      </div>

      {/* Credentials form */}
      <form onSubmit={handleSave} className="bg-white/5 border border-white/10 p-6 rounded-2xl space-y-5">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Key className="w-4 h-4 text-violet-400" />
          Claves de API
        </h3>

        {msg && <Alert type={msg.type} msg={msg.text} />}

        {/* YCloud API Key — solo para bots YCloud */}
        {!isBaileys && !isMeta && (
          <div>
            <label className="block text-xs font-medium text-white/50 mb-1.5">
              YCloud API Key{' '}
              {creds?.hasYcloudKey && (
                <span className="text-amber-400 ml-1">✓ configurada</span>
              )}
            </label>
            <div className="relative">
              <input
                type={showYcloud ? 'text' : 'password'}
                value={form.ycloudApiKey}
                onChange={e => setForm(f => ({ ...f, ycloudApiKey: e.target.value }))}
                placeholder={creds?.hasYcloudKey ? '(dejar vacío para mantener)' : 'yk_live_...'}
                className="w-full bg-[#0B0B12]/50 border border-white/10 rounded-xl px-4 py-2.5 pr-10 text-sm text-white placeholder-white/25 focus:outline-none focus:border-violet-400/40"
              />
              <button
                type="button"
                onClick={() => setShowYcloud(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/35 hover:text-white"
              >
                {showYcloud ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}

        {/* Meta Page Access Token — solo para bots META */}
        {isMeta && (
          <div>
            <label className="block text-xs font-medium text-white/50 mb-1.5">
              Meta Page Access Token{' '}
              {creds?.hasMetaToken && (
                <span className="text-amber-400 ml-1">✓ configurado ({creds.metaPageTokenHint})</span>
              )}
            </label>
            <div className="relative">
              <input
                type={showMeta ? 'text' : 'password'}
                value={form.metaPageToken}
                onChange={e => setForm(f => ({ ...f, metaPageToken: e.target.value }))}
                placeholder={creds?.hasMetaToken ? '(dejar vacío para mantener)' : 'EAAxxxxxxx...'}
                className="w-full bg-[#0B0B12]/50 border border-white/10 rounded-xl px-4 py-2.5 pr-10 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-400/40"
              />
              <button
                type="button"
                onClick={() => setShowMeta(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/35 hover:text-white"
              >
                {showMeta ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-white/25 mt-1">Obtén el token permanente desde developers.facebook.com → tu App → Messenger → Tokens de acceso.</p>
          </div>
        )}

        {/* API key de la app */}
        <GlobalAiKeyToggle />

        {/* OpenAI API Key */}
        <div>
          <label className="block text-xs font-medium text-white/50 mb-1.5">
            OpenAI API Key (propia){' '}
            {creds?.hasOpenAIKey && (
              <span className="text-amber-400 ml-1">✓ configurada</span>
            )}
          </label>
          <div className="relative">
            <input
              type={showOpenai ? 'text' : 'password'}
              value={form.openaiApiKey}
              onChange={e => setForm(f => ({ ...f, openaiApiKey: e.target.value }))}
              placeholder={creds?.hasOpenAIKey ? '(dejar vacío para mantener)' : 'sk-proj-...'}
              className="w-full bg-[#0B0B12]/50 border border-white/10 rounded-xl px-4 py-2.5 pr-10 text-sm text-white placeholder-white/25 focus:outline-none focus:border-violet-400/40"
            />
            <button
              type="button"
              onClick={() => setShowOpenai(s => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/35 hover:text-white"
            >
              {showOpenai ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* WhatsApp number — solo para bots YCloud */}
        {!isBaileys && !isMeta && (
          <div>
            <label className="block text-xs font-medium text-white/50 mb-1.5">
              Número WhatsApp Business (from)
            </label>
            <input
              value={form.whatsappInstanceNumber}
              onChange={e => setForm(f => ({ ...f, whatsappInstanceNumber: e.target.value }))}
              placeholder="15551234567 (sin + ni espacios)"
              className="w-full bg-[#0B0B12]/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-violet-400/40"
            />
          </div>
        )}

        {/* Report phone — solo para bots WhatsApp (YCLOUD y BAILEYS) */}
        {!isMeta && (
          <div>
            <label className="block text-xs font-medium text-white/50 mb-1.5">
              Número interno para reportes
            </label>
            <input
              value={form.reportPhone}
              onChange={e => setForm(f => ({ ...f, reportPhone: e.target.value }))}
              placeholder="15559876543"
              className="w-full bg-[#0B0B12]/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-violet-400/40"
              required
            />
            <p className="text-xs text-white/25 mt-1">
              Cuando un cliente confirme su pedido, el agente enviará un reporte a este número por WhatsApp.
            </p>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-violet-400 text-white font-bold rounded-xl hover:bg-violet-400/90 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
        >
          {loading ? <Spinner /> : <Save className="w-4 h-4" />}
          Guardar credenciales
        </button>
      </form>

      {/* Model selector */}
      <div className="bg-white/5 border border-white/10 p-6 rounded-2xl space-y-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-400" />
          Modelo de IA
          <span className="text-xs font-normal text-white/35 ml-1">— para respuestas al cliente</span>
        </h3>
        <p className="text-xs text-white/25">Los seguimientos automáticos siempre usan GPT-4o Mini (más económico).</p>

        <div className="space-y-2">
          {[
            { id: 'gpt-5.2',     label: 'GPT-5.2',     desc: 'Último modelo · Máxima capacidad', color: 'text-violet-400' },
            { id: 'gpt-5.1',     label: 'GPT-5.1',     desc: 'Más inteligente · Mayor costo',    color: 'text-violet-400' },
            { id: 'gpt-4o',      label: 'GPT-4o',       desc: 'Equilibrado · Costo moderado',     color: 'text-indigo-400' },
            { id: 'gpt-4o-mini', label: 'GPT-4o Mini',  desc: 'Más económico · Muy capaz',        color: 'text-amber-400' },
          ].map(m => (
            <button
              key={m.id}
              type="button"
              onClick={() => setSelectedModel(m.id)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all text-left ${
                selectedModel === m.id
                  ? 'border-violet-400/60 bg-violet-400/10'
                  : 'border-white/10 bg-[#0B0B12]/30 hover:border-white/20'
              }`}
            >
              <div>
                <span className={`text-sm font-semibold ${selectedModel === m.id ? m.color : 'text-white'}`}>{m.label}</span>
                <p className="text-xs text-white/35 mt-0.5">{m.desc}</p>
              </div>
              {selectedModel === m.id && <CheckCircle2 className="w-4 h-4 text-violet-400 shrink-0" />}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={savingModel}
          onClick={async () => {
            setSavingModel(true)
            try {
              await fetch(`/api/bots/${bot.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ aiModel: selectedModel }),
              })
            } finally {
              setSavingModel(false)
            }
          }}
          className="w-full py-2.5 bg-white/4 border border-white/10 text-white text-sm font-semibold rounded-xl hover:border-amber-400/40 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
        >
          {savingModel ? <Spinner /> : <Save className="w-4 h-4" />}
          Guardar modelo
        </button>
      </div>
    </div>
  )
}

// ─── Prompt Tab ───────────────────────────────────────────────────────────────

// ─── Plantilla de prompt de ejemplo ─────────────────────────────────────────

const EXAMPLE_PROMPT = `# 🎯 IDENTIDAD

Eres RUBEN, vendedor de WhatsApp. Hablas de forma cálida, directa, humana y natural. Nunca suenas robótico.

Trato:
- Mujeres: señorita / casera / [nombre]
- Hombres: estimado / amigo / [nombre]

Solo usas información del catálogo. Nunca inventas productos, precios, beneficios ni promociones.

# 🧠 FLUJO

**1. Bienvenida**
Saluda de forma cálida.
Si el cliente no dice qué producto quiere, pregunta cuál le interesa.
No avances hasta identificar el producto.

**2. Producto identificado**
Si el estado dice **AÚN NO enviado**:
- envía exactamente el texto de “Primer mensaje del producto”
- adjunta 1 video de “Videos del producto” o foto de “Imágenes principales”
- no envíes precios
- cierra con una pregunta sobre su necesidad

Si el estado dice **YA FUE ENVIADO**, pasa al siguiente paso.

**3. Necesidad y prueba social**
Pregunta qué problema o necesidad tiene.
Luego envía de 1 a 3 testimonios relacionados.
Prioriza video; si no hay, usa foto.
Acompaña con una frase corta de prueba social.

**4. Intención**
Detecta la intención principal del cliente:
Compra > Precio > Entrega > Duda > Comparación > Interés

Responde solo a la intención principal.
Máximo 2 mensajes por turno.

**5. Precio**
Solo dar precios si el cliente los pide.
- 1 unidad = precio unitario
- 2 o más = promo correspondiente del catálogo

Usa gatillos de ahorro, urgencia y beneficio real.

**6. Extras**
Solo si el cliente lo pide:
- Fotos → “Más fotos”
- Videos → “Videos producto”

**7. Cierre**
Guía con suavidad hacia la compra.
- Resaltar beneficios del producto.
- Mostrar resultados potenciales o transformación (sin inventar).
- Los mensajes deben avanzar hacia:
    - Confirmación de compra
    - Datos de entrega
    - Selección de variante

Siempre con amabilidad y claridad.

# 📦 ENVÍO

BOLIVIA
Ciudades donde hacemos entregas a domicilio (la paz, cochabamba, sucre, potosi, tarija, santa cruz, beni, pando, oruro y a provincias hacemos envios.)

Usa tiempos aproximados, no prometas de más.
Ejemplo:
- Ciudades principales: 8 a 24 horas aprox.
- Provincias: envío por línea de transporte según destino

# 📍 DATOS DE ENTREGA

Pedir siempre:
- nombre completo
- teléfono

Dirección válida:
Ciudad + Zona + Calle + Nº
o ubicación GPS / link de Google Maps

Si falta algo, pide solo lo que falta.
Si es provincia, pregunta qué línea de transporte prefiere.

# 🏢 OFICINA

Solo dar dirección de oficina si el cliente quiere recoger, visitar o insiste en ubicación física.

(Cochabamba av. santa cruz entre calle juan capriles y c.p dalence)

# ✅ CONFIRMACIÓN

Solo confirmar si ya hay dirección completa o coordenadas válidas.

Mensaje:

¡Gracias por tu confianza, [nombre]! 🚚💚

Recibí tu dirección:
📍 [dirección o coordenadas]

[Tiempo estimado de entrega]

Un encargado te llamará para coordinar ⭐

# 📝 REPORTE

Solo si hubo confirmación completa:

Hola [Ruben], nuevo pedido de [nombre].
📞 Contacto: [teléfono]
📍 Dirección: [dirección]
🛍️ Descripción: [producto y cantidad]

Si no hubo confirmación:
“reporte”: “”

# 📏 REGLAS DE MENSAJES

- Mensaje 1: máx. 150 caracteres; Mensaje 2: máx. 100; Mensaje 3: máx. 60; solo el primer mensaje del producto identificado puede ser más largo.
- Usa *negritas* en palabras clave o frases o nombre.
- Usar 2 saltos de línea para separar frases o bloques de texto.
- Poner emojis para que se vea elegante y profesional.

Debes respetar estas reglas.

# 🧩 REGLAS FINALES

- Mensajes cortos, claros y humanos
- No repitas preguntas ni datos ya dados
- No inventes nada
- Si el producto no está claro, pide aclaración
- Si hay objeción, responde con empatía + beneficio real + prueba social
- Si el input llega vacío, responde con el historial`.trim()

function PromptTab({ bot, onSaved }: { bot: Bot; onSaved: (updated: Partial<Bot>) => void }) {
  const [form, setForm] = useState({
    systemPromptTemplate: bot.systemPromptTemplate ?? '',
    maxCharsMensaje1: bot.maxCharsMensaje1?.toString() ?? '',
    maxCharsMensaje2: bot.maxCharsMensaje2?.toString() ?? '',
    maxCharsMensaje3: bot.maxCharsMensaje3?.toString() ?? '',
  })
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMsg(null)
    try {
      const res = await fetch(`/api/bots/${bot.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemPromptTemplate: form.systemPromptTemplate,
          maxCharsMensaje1: form.maxCharsMensaje1 ? parseInt(form.maxCharsMensaje1) : null,
          maxCharsMensaje2: form.maxCharsMensaje2 ? parseInt(form.maxCharsMensaje2) : null,
          maxCharsMensaje3: form.maxCharsMensaje3 ? parseInt(form.maxCharsMensaje3) : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setMsg({ type: 'success', text: 'Plantilla guardada correctamente' })
      onSaved(data.bot)
    } catch (err: unknown) {
      setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Error guardando' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="bg-white/5 border border-white/10 p-6 rounded-2xl space-y-5">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <FileText className="w-4 h-4 text-indigo-400" />
          Prompt del vendedor
        </h3>

        {msg && <Alert type={msg.type} msg={msg.text} />}

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-medium text-white/50">
              Instrucciones del vendedor (system prompt)
            </label>
            <button
              type="button"
              onClick={() => {
                if (!form.systemPromptTemplate.trim()) {
                  setForm(f => ({ ...f, systemPromptTemplate: EXAMPLE_PROMPT }))
                } else if (confirm('Esto reemplazará tu prompt actual. ¿Continuar?')) {
                  setForm(f => ({ ...f, systemPromptTemplate: EXAMPLE_PROMPT }))
                }
              }}
              className="text-[10px] px-2.5 py-1 rounded-lg bg-indigo-400/10 border border-indigo-400/20 text-indigo-400 hover:bg-indigo-400/20 transition-colors font-medium"
            >
              Cargar plantilla de ejemplo
            </button>
          </div>
          <textarea
            value={form.systemPromptTemplate}
            onChange={e => setForm(f => ({ ...f, systemPromptTemplate: e.target.value }))}
            rows={12}
            placeholder={`Escribe aquí las instrucciones de tu vendedor.\n\nEjemplo:\n- Su nombre, estilo de comunicación y tono\n- Cómo identificar el problema del cliente\n- Cómo presentar y cerrar la venta\n- Reglas de negocio especiales\n\nUsa el botón "Cargar plantilla de ejemplo" para ver una plantilla lista.`}
            className="w-full bg-[#0B0B12]/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/25 focus:outline-none focus:border-indigo-400/40 font-mono resize-y min-h-[200px]"
          />
          <p className="text-xs text-white/25 mt-1">
            Estas instrucciones se combinan con las reglas del bot y la base de conocimiento de productos.
          </p>
        </div>

        {/* Char limits */}
        <div>
          <label className="block text-xs font-medium text-white/50 mb-3">
            Límite de caracteres por mensaje (opcional)
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(['maxCharsMensaje1', 'maxCharsMensaje2', 'maxCharsMensaje3'] as const).map((field, i) => (
              <div key={field}>
                <label className="block text-[10px] text-white/35 mb-1">Mensaje {i + 1}</label>
                <input
                  type="number"
                  value={form[field]}
                  onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                  placeholder="Sin límite"
                  className="w-full bg-[#0B0B12]/50 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/25 focus:outline-none focus:border-indigo-400/40"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Strict JSON badge */}
        <div className="flex items-center gap-3 bg-amber-400/5 border border-amber-400/20 rounded-xl px-4 py-3">
          <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
          <div>
            <div className="text-xs font-bold text-amber-400">strictJsonOutput: ACTIVO</div>
            <div className="text-xs text-white/35">
              El bot siempre devuelve JSON válido con el schema requerido.
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-indigo-400 text-[#0B0B12] font-bold rounded-xl hover:bg-indigo-400/90 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
        >
          {loading ? <Spinner /> : <Save className="w-4 h-4" />}
          Guardar plantilla
        </button>
      </div>
    </form>
  )
}

// ─── Product Form ─────────────────────────────────────────────────────────────

const EMPTY_PRODUCT = {
  name: '',
  category: '',
  benefits: '',
  usage: '',
  warnings: '',
  priceUnit: '',
  pricePromo2: '',
  priceSuper6: '',
  currency: 'USD',
  welcomeMessage: '',
  firstMessage: '',
  hooks: '',
  // Imágenes principales (hasta 8 URLs individuales)
  img1: '', img2: '', img3: '', img4: '', img5: '', img6: '', img7: '', img8: '',
  // Videos del producto (hasta 2)
  vid1: '', vid2: '',
  // Testimonios fotos (hasta 7)
  test1Label: '', test1Url: '',
  test2Label: '', test2Url: '',
  test3Label: '', test3Url: '',
  test4Label: '', test4Url: '',
  test5Label: '', test5Url: '',
  test6Label: '', test6Url: '',
  test7Label: '', test7Url: '',
  // Testimonios videos (hasta 7, label independiente)
  test1VidLabel: '', test1VidUrl: '',
  test2VidLabel: '', test2VidUrl: '',
  test3VidLabel: '', test3VidUrl: '',
  test4VidLabel: '', test4VidUrl: '',
  test5VidLabel: '', test5VidUrl: '',
  test6VidLabel: '', test6VidUrl: '',
  test7VidLabel: '', test7VidUrl: '',
  shippingInfo: '',
  coverage: '',
  active: true,
}

type ProductFormState = typeof EMPTY_PRODUCT

/** Normaliza testimonialsVideoUrls en dos arrays independientes: fotos y videos (7 cada uno). */
function parseProductTestimonials(p: Product): {
  photos: Array<{ label: string; url: string }>
  videos: Array<{ label: string; url: string }>
} {
  const photos: Array<{ label: string; url: string }> = Array.from({ length: 7 }, () => ({ label: '', url: '' }))
  const videos: Array<{ label: string; url: string }> = Array.from({ length: 7 }, () => ({ label: '', url: '' }))
  let pi = 0
  let vi = 0

  for (const item of p.testimonialsVideoUrls) {
    if (typeof item === 'object' && item !== null && (item as { url?: string }).url) {
      const obj = item as { url: string; label?: string; type?: string }
      if (obj.type === 'video') {
        if (vi < 7) { videos[vi].url = obj.url; videos[vi].label = obj.label ?? ''; vi++ }
      } else {
        if (pi < 7) { photos[pi].url = obj.url; photos[pi].label = obj.label ?? ''; pi++ }
      }
    } else if (typeof item === 'string' && item.startsWith('http')) {
      if (pi < 7) { photos[pi].url = item; pi++ }
    }
  }

  return { photos, videos }
}

function productToForm(p: Product): ProductFormState {
  const { photos, videos } = parseProductTestimonials(p)
  const imgs = [...p.imageMainUrls, '', '', '', '', '', '', '', ''].slice(0, 8)
  return {
    name: p.name,
    category: p.category ?? '',
    benefits: p.benefits ?? '',
    usage: p.usage ?? '',
    warnings: p.warnings ?? '',
    priceUnit: p.priceUnit ?? '',
    pricePromo2: p.pricePromo2 ?? '',
    priceSuper6: p.priceSuper6 ?? '',
    currency: p.currency ?? 'USD',
    welcomeMessage: p.welcomeMessage ?? '',
    firstMessage: p.firstMessage ?? '',
    hooks: p.hooks.join('\n'),
    img1: imgs[0], img2: imgs[1], img3: imgs[2], img4: imgs[3], img5: imgs[4], img6: imgs[5], img7: imgs[6], img8: imgs[7],
    vid1: ((p as any).productVideoUrls?.[0] as string) || '', vid2: ((p as any).productVideoUrls?.[1] as string) || '',
    test1Label: photos[0].label, test1Url: photos[0].url,
    test2Label: photos[1].label, test2Url: photos[1].url,
    test3Label: photos[2].label, test3Url: photos[2].url,
    test4Label: photos[3].label, test4Url: photos[3].url,
    test5Label: photos[4].label, test5Url: photos[4].url,
    test6Label: photos[5].label, test6Url: photos[5].url,
    test7Label: photos[6].label, test7Url: photos[6].url,
    test1VidLabel: videos[0].label, test1VidUrl: videos[0].url,
    test2VidLabel: videos[1].label, test2VidUrl: videos[1].url,
    test3VidLabel: videos[2].label, test3VidUrl: videos[2].url,
    test4VidLabel: videos[3].label, test4VidUrl: videos[3].url,
    test5VidLabel: videos[4].label, test5VidUrl: videos[4].url,
    test6VidLabel: videos[5].label, test6VidUrl: videos[5].url,
    test7VidLabel: videos[6].label, test7VidUrl: videos[6].url,
    shippingInfo: p.shippingInfo ?? '',
    coverage: p.coverage ?? '',
    active: p.active,
  }
}

function formToPayload(f: ProductFormState, existingProduct?: Product | null) {
  // Aplanar imagen y video de testimonios en el array final
  const testimonialsVideoUrls: Array<{ label: string, url: string, type?: string }> = []

  for (let i = 1; i <= 7; i++) {
    const lbl = f[`test${i}Label` as keyof ProductFormState] as string
    const url = f[`test${i}Url` as keyof ProductFormState] as string
    const vidLbl = f[`test${i}VidLabel` as keyof ProductFormState] as string
    const vid = f[`test${i}VidUrl` as keyof ProductFormState] as string

    if (url.trim()) testimonialsVideoUrls.push({ label: lbl.trim(), url: url.trim() })
    if (vid.trim()) testimonialsVideoUrls.push({ label: vidLbl.trim(), url: vid.trim(), type: 'video' })
  }

  const productVideoUrls = [f.vid1, f.vid2].map(s => s.trim()).filter(Boolean)

  return {
    name: f.name.trim(),
    category: f.category.trim() || null,
    benefits: f.benefits.trim() || null,
    usage: f.usage.trim() || null,
    warnings: f.warnings.trim() || null,
    priceUnit: f.priceUnit ? parseFloat(f.priceUnit) : null,
    pricePromo2: f.pricePromo2 ? parseFloat(f.pricePromo2) : null,
    priceSuper6: f.priceSuper6 ? parseFloat(f.priceSuper6) : null,
    currency: f.currency || 'USD',
    welcomeMessage: f.welcomeMessage.trim() || null,
    firstMessage: f.firstMessage.trim() || null,
    hooks: f.hooks.split('\n').map((s: string) => s.trim()).filter(Boolean),
    imageMainUrls: [f.img1, f.img2, f.img3, f.img4, f.img5, f.img6, f.img7, f.img8].map((s: string) => s.trim()).filter(Boolean),
    productVideoUrls, // Added productVideoUrls explicitly back in
    // Preservar URLs de precios si ya existían para evitar pérdida de datos heredados
    imagePriceUnitUrl: existingProduct?.imagePriceUnitUrl || null,
    imagePricePromoUrl: existingProduct?.imagePricePromoUrl || null,
    imagePriceSuperUrl: existingProduct?.imagePriceSuperUrl || null,
    testimonialsVideoUrls,
    shippingInfo: f.shippingInfo.trim() || null,
    coverage: f.coverage.trim() || null,
    tags: existingProduct?.tags || [],
    active: f.active,
  }
}

function ProductForm({
  botId,
  product,
  onSaved,
  onCancel,
}: {
  botId: string
  product: Product | null
  onSaved: () => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<ProductFormState>(
    product ? productToForm(product) : EMPTY_PRODUCT,
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showTestimonialPhotos, setShowTestimonialPhotos] = useState(false)
  const [showTestimonialVideos, setShowTestimonialVideos] = useState(false)

  const setField = (key: keyof ProductFormState, value: string | boolean) =>
    setForm(f => ({ ...f, [key]: value }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const payload = formToPayload(form, product)
      const url = product
        ? `/api/products/${product.id}`
        : `/api/products`
      const method = product ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error guardando producto')
      // If creating a new product, also assign it to this bot
      if (!product && data.product?.id && botId) {
        await fetch(`/api/bots/${botId}/products`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId: data.product.id }),
        })
      }
      onSaved()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  const inputClass =
    'w-full bg-[#0B0B12]/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-400/40 transition-colors'
  const textareaClass = `${inputClass} resize-y`
  const labelClass = 'block text-xs font-medium text-white/50 mb-1.5'
  const sectionClass = 'bg-white/5 border border-white/10 p-5 rounded-2xl space-y-4'
  const sectionHeaderClass = 'flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider'

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-white flex items-center gap-2">
          <Package className="w-4 h-4 text-amber-400" />
          {product ? 'Editar producto' : 'Nuevo producto'}
        </h3>
        <button type="button" onClick={onCancel} className="text-white/35 hover:text-white transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      {error && <Alert type="error" msg={error} />}

      {/* Basic info */}
      <div className={sectionClass}>
        <div className={sectionHeaderClass}><span className="w-1 h-3.5 bg-amber-400/70 rounded-full" />Información básica</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Nombre del producto *</label>
            <input
              required
              value={form.name}
              onChange={e => setField('name', e.target.value)}
              placeholder="ej: Gel de Aloe Vera"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Categoría</label>
            <select
              value={form.category}
              onChange={e => setField('category', e.target.value)}
              className={`${inputClass} appearance-none bg-[#0B0B12]/50`}
            >
              <option value="">Selecciona una categoría...</option>
              <option value="Salud y Bienestar">Salud y Bienestar</option>
              <option value="Belleza y Cuidado Personal">Belleza y Cuidado Personal</option>
              <option value="Electrónica y Gadgets">Electrónica y Gadgets</option>
              <option value="Hogar y Cocina">Hogar y Cocina</option>
              <option value="Deportes y Fitness">Deportes y Fitness</option>
              <option value="Moda y Accesorios">Moda y Accesorios</option>
              <option value="Juguetes y Bebés">Juguetes y Bebés</option>
              <option value="Mascotas">Mascotas</option>
              <option value="Herramientas y Automotriz">Herramientas y Automotriz</option>
              <option value="Otros">Otros</option>
            </select>
          </div>
        </div>
        <div>
          <label className={labelClass}>Primer mensaje del producto identificado</label>
          <textarea
            rows={3}
            value={form.firstMessage}
            onChange={e => setField('firstMessage', e.target.value)}
            placeholder="Hola {nombre}! Te presento nuestro increíble producto..."
            className={textareaClass}
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setField('active', !form.active)}
            className="flex items-center gap-2 text-sm"
          >
            {form.active ? (
              <ToggleRight className="w-7 h-7 text-amber-400" />
            ) : (
              <ToggleLeft className="w-7 h-7 text-white/25" />
            )}
            <span className={form.active ? 'text-amber-400 font-medium' : 'text-white/35'}>
              {form.active ? 'Producto activo' : 'Producto inactivo'}
            </span>
          </button>
        </div>
      </div>

      {/* Details */}
      <div className={sectionClass}>
        <div className={sectionHeaderClass}><span className="w-1 h-3.5 bg-indigo-400/70 rounded-full" />Descripción</div>
        <div>
          <label className={labelClass}>Beneficios</label>
          <textarea
            rows={3}
            value={form.benefits}
            onChange={e => setField('benefits', e.target.value)}
            placeholder="te ayuda en..."
            className={textareaClass}
          />
        </div>
        <div>
          <label className={labelClass}>Modo de uso</label>
          <textarea
            rows={2}
            value={form.usage}
            onChange={e => setField('usage', e.target.value)}
            placeholder="Aplicar 1 veces al día en área limpia..."
            className={textareaClass}
          />
        </div>
        <div>
          <label className={labelClass}>Advertencias / contraindicaciones</label>
          <textarea
            rows={2}
            value={form.warnings}
            onChange={e => setField('warnings', e.target.value)}
            placeholder="No aplicar en heridas abiertas..."
            className={textareaClass}
          />
        </div>
      </div>

      {/* Prices */}
      <div className={sectionClass}>
        <div className={sectionHeaderClass}><span className="w-1 h-3.5 bg-violet-400/70 rounded-full" />Precios</div>
        <div>
          <label className={labelClass}>Moneda</label>
          <select
            value={form.currency}
            onChange={e => setField('currency', e.target.value)}
            className={inputClass}
          >
            <option value="USD">$ Dólar estadounidense (USD)</option>
            <option value="EUR">€ Euro (EUR)</option>
            <option value="BOB">Bs. Boliviano boliviano (BOB)</option>
            <option value="PEN">S/ Sol peruano (PEN)</option>
            <option value="COP">$ Peso colombiano (COP)</option>
            <option value="ARS">$ Peso argentino (ARS)</option>
            <option value="MXN">$ Peso mexicano (MXN)</option>
            <option value="CLP">$ Peso chileno (CLP)</option>
            <option value="GTQ">Q Quetzal guatemalteco (GTQ)</option>
            <option value="HNL">L Lempira hondureño (HNL)</option>
            <option value="NIO">C$ Córdoba nicaragüense (NIO)</option>
            <option value="CRC">₡ Colón costarricense (CRC)</option>
            <option value="PAB">B/. Balboa panameño (PAB)</option>
            <option value="DOP">RD$ Peso dominicano (DOP)</option>
            <option value="UYU">$ Peso uruguayo (UYU)</option>
            <option value="PYG">₲ Guaraní paraguayo (PYG)</option>
            <option value="BRL">R$ Real brasileño (BRL)</option>
            <option value="VES">Bs.S Bolívar venezolano (VES)</option>
            <option value="CUP">$ Peso cubano (CUP)</option>
          </select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className={labelClass}>Precio unitario</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.priceUnit}
              onChange={e => setField('priceUnit', e.target.value)}
              placeholder="25.00"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Precio promo ×2</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.pricePromo2}
              onChange={e => setField('pricePromo2', e.target.value)}
              placeholder="45.00"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Precio súper ×6</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.priceSuper6}
              onChange={e => setField('priceSuper6', e.target.value)}
              placeholder="120.00"
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* Images Section */}
      <div className={sectionClass}>
        <div>
          <div className={`${sectionHeaderClass} mb-3`}><span className="w-1 h-3.5 bg-amber-400/70 rounded-full" />Imágenes principales</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(['img1', 'img2', 'img3'] as const).map(key => (
              <UploadField key={key} type="image" value={form[key]} onChange={v => setField(key, v)} placeholder="Subir foto principal" />
            ))}
          </div>
        </div>

        <div className="pt-2">
          <div className={`${sectionHeaderClass} mb-3`}><span className="w-1 h-3.5 bg-amber-400/70 rounded-full" />Más fotos del producto</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {(['img4', 'img5', 'img6', 'img7', 'img8'] as const).map((key, i) => (
              <UploadField key={key} type="image" value={form[key]} onChange={v => setField(key, v)} placeholder={`Foto adicional ${i + 1}`} />
            ))}
          </div>
        </div>

        <div className="pt-4 border-t border-white/5">
          <div className={`${sectionHeaderClass} mb-3`}><span className="w-1 h-3.5 bg-indigo-400/70 rounded-full" />Videos del producto</div>
          <p className="text-xs text-white/25 mb-3">El agente enviará estos videos si el cliente quiere ver el producto en acción. Máximo 90 segundos.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(['vid1', 'vid2'] as const).map((key, i) => (
              <UploadField key={key} type="video" value={form[key as keyof ProductFormState] as string} onChange={v => setField(key, v)} placeholder={`Video del producto ${i + 1}`} />
            ))}
          </div>
        </div>
      </div>

      {/* Testimonial Images */}
      <div className={sectionClass}>
        <button
          type="button"
          onClick={() => setShowTestimonialPhotos(v => !v)}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider">
            <span className="w-1 h-3.5 bg-indigo-400/70 rounded-full" />
            Fotos de testimonios
            <span className="text-[10px] normal-case font-normal text-white/35">(el agente las envía ante dudas)</span>
          </div>
          <ChevronRight className={`w-4 h-4 text-white/35 transition-transform ${showTestimonialPhotos ? 'rotate-90' : ''}`} />
        </button>
        {showTestimonialPhotos && (
          <div className="space-y-3 pt-2">
            {[1, 2, 3, 4, 5, 6, 7].map(n => {
              const labelKey = `test${n}Label` as keyof ProductFormState
              const urlKey = `test${n}Url` as keyof ProductFormState
              return (
                <div key={n} className="grid grid-cols-1 sm:grid-cols-[1fr_2fr] gap-2 items-start">
                  <input
                    value={form[labelKey] as string}
                    onChange={e => setField(labelKey, e.target.value)}
                    placeholder={`Ej: Testimonio manchas ${n}`}
                    className={inputClass}
                  />
                  <UploadField type="image" value={form[urlKey] as string} onChange={v => setField(urlKey, v)} placeholder="Subir foto de testimonio" />
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Testimonial Videos */}
      <div className={sectionClass}>
        <button
          type="button"
          onClick={() => setShowTestimonialVideos(v => !v)}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider">
            <span className="w-1 h-3.5 bg-violet-400/70 rounded-full" />
            Videos de testimonios
            <span className="text-[10px] bg-violet-400/20 text-violet-400 px-2 py-0.5 rounded border border-violet-400/30 normal-case font-normal">NUEVO</span>
          </div>
          <ChevronRight className={`w-4 h-4 text-white/35 transition-transform ${showTestimonialVideos ? 'rotate-90' : ''}`} />
        </button>
        {showTestimonialVideos && (
          <div className="space-y-3 pt-2">
            <p className="text-xs text-white/25">El agente enviará estos videos cuando el cliente necesite mayor confianza. Máximo 90 segundos por video.</p>
            {[1, 2, 3, 4, 5, 6, 7].map(n => {
              const vidLabelKey = `test${n}VidLabel` as keyof ProductFormState
              const vidUrlKey = `test${n}VidUrl` as keyof ProductFormState
              return (
                <div key={n} className="grid grid-cols-1 sm:grid-cols-[1fr_2fr] gap-2 items-start">
                  <input
                    value={form[vidLabelKey] as string}
                    onChange={e => setField(vidLabelKey, e.target.value)}
                    placeholder={`Ej: Video testimonio ${n}`}
                    className={inputClass}
                  />
                  <UploadField type="video" value={form[vidUrlKey] as string} onChange={v => setField(vidUrlKey, v)} placeholder={`Subir video testimonio ${n}`} />
                </div>
              )
            })}
          </div>
        )}
      </div>


      {/* Buttons */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-3 bg-white/4 border border-white/10 text-white/50 font-medium rounded-xl hover:bg-white/5 transition-colors text-sm"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={loading}
          className="flex-1 py-3 bg-amber-400 text-[#0B0B12] font-bold rounded-xl hover:bg-amber-400/90 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors text-sm"
        >
          {loading ? <Spinner /> : <Save className="w-4 h-4" />}
          {product ? 'Actualizar' : 'Crear producto'}
        </button>
      </div>
    </form>
  )
}

// ─── Products Tab ─────────────────────────────────────────────────────────────

// ─── Share Product Modal ──────────────────────────────────────────────────────

function ShareProductModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const [identifier, setIdentifier] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  async function handleShare(e: React.FormEvent) {
    e.preventDefault()
    if (!identifier.trim()) return
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch(`/api/products/${product.id}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: identifier.trim() }),
      })
      const data = await res.json()
      setResult({ ok: res.ok, message: data.message || data.error || 'Error desconocido' })
      if (res.ok) setIdentifier('')
    } catch {
      setResult({ ok: false, message: 'Error de conexión' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 w-full max-w-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Share2 className="w-4 h-4 text-indigo-400" />
            <h3 className="font-bold text-white text-sm">Compartir producto</h3>
          </div>
          <button onClick={onClose} className="text-white/35 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="text-xs text-white/35 bg-white/5 rounded-xl p-3 border border-white/5">
          <p className="font-semibold text-white mb-1">📋 {product.name}</p>
          El destinatario recibirá una <span className="text-amber-400">copia independiente</span> del producto.
          Podrá editarla libremente sin afectar el tuyo.
        </div>

        <form onSubmit={handleShare} className="space-y-3">
          <div>
            <label className="text-xs text-white/35 mb-1 block">Username o email del destinatario</label>
            <input
              type="text"
              value={identifier}
              onChange={e => setIdentifier(e.target.value)}
              placeholder="@usuario o correo@email.com"
              className="w-full bg-[#0B0B12] border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-indigo-400/40"
              disabled={loading}
            />
          </div>

          {result && (
            <div className={`text-xs rounded-lg px-3 py-2 ${result.ok ? 'bg-amber-400/10 text-amber-400 border border-amber-400/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
              {result.ok ? '✓ ' : '✕ '}{result.message}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-xl border border-white/10 text-white/35 hover:text-white text-sm transition-colors"
            >
              Cerrar
            </button>
            <button
              type="submit"
              disabled={loading || !identifier.trim()}
              className="flex-1 py-2 rounded-xl bg-indigo-400/20 text-indigo-400 border border-indigo-400/30 hover:bg-indigo-400/30 text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserCheck className="w-3.5 h-3.5" />}
              Compartir
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ProductsTab({ bot }: { bot: Bot }) {
  const [assigned, setAssigned] = useState<Product[]>([])
  const [available, setAvailable] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [actioning, setActioning] = useState<string | null>(null)
  const [sharingProduct, setSharingProduct] = useState<Product | null>(null)

  const loadProducts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/bots/${bot.id}/products`)
      if (res.ok) {
        const data = await res.json()
        setAssigned(data.assigned ?? [])
        setAvailable(data.available ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [bot.id])

  useEffect(() => { loadProducts() }, [loadProducts])

  async function handleUnassign(productId: string) {
    if (!confirm('¿Quitar este producto del bot?')) return
    setActioning(productId)
    try {
      await fetch(`/api/bots/${bot.id}/products/${productId}`, { method: 'DELETE' })
      setAssigned(ps => ps.filter(p => p.id !== productId))
      setAvailable(prev => {
        const removed = assigned.find(p => p.id === productId)
        return removed ? [...prev, removed] : prev
      })
    } finally {
      setActioning(null)
    }
  }

  async function handleAssign(product: Product) {
    setActioning(product.id)
    try {
      const res = await fetch(`/api/bots/${bot.id}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: product.id }),
      })
      if (res.ok) {
        setAvailable(ps => ps.filter(p => p.id !== product.id))
        setAssigned(prev => [...prev, product])
      }
    } finally {
      setActioning(null)
    }
  }

  function handleEdit(product: Product) {
    setEditingProduct(product)
    setShowForm(true)
  }

  function handleFormClose() {
    setShowForm(false)
    setEditingProduct(null)
  }

  function handleFormSaved() {
    handleFormClose()
    loadProducts()
  }

  if (showForm) {
    return (
      <ProductForm
        botId={bot.id}
        product={editingProduct}
        onSaved={handleFormSaved}
        onCancel={handleFormClose}
      />
    )
  }

  return (
    <div className="space-y-5">
      {sharingProduct && (
        <ShareProductModal product={sharingProduct} onClose={() => setSharingProduct(null)} />
      )}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-white/35">
          {assigned.length} asignado{assigned.length !== 1 ? 's' : ''} · {available.length} disponible{available.length !== 1 ? 's' : ''} en catálogo
        </div>
        <button
          onClick={() => { setEditingProduct(null); setShowForm(true) }}
          className="flex items-center gap-2 px-4 py-2 bg-amber-400 text-[#0B0B12] font-bold rounded-xl text-sm hover:bg-amber-400/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nuevo producto
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-white/35" />
        </div>
      ) : (
        <>
          {/* Assigned products */}
          <div>
            <div className="text-xs font-semibold text-white/35 uppercase tracking-wider mb-2">
              Asignados a este bot
            </div>
            {assigned.length === 0 ? (
              <div className="bg-white/5 border border-white/10 p-8 rounded-2xl text-center">
                <ShoppingBag className="w-8 h-8 text-white/15 mx-auto mb-2" />
                <div className="text-white/35 text-sm">Sin productos asignados</div>
                <div className="text-white/25 text-xs mt-1">Crea un nuevo producto o asigna uno del catálogo.</div>
              </div>
            ) : (
              <div className="space-y-2">
                {assigned.map(product => (
                  <div
                    key={product.id}
                    className="bg-white/5 border border-white/10 p-4 rounded-xl flex items-center gap-4 group hover:bg-white/5 transition-colors"
                  >
                    <div className={`w-2 h-2 rounded-full shrink-0 ${product.active ? 'bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.5)]' : 'bg-white/8'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-white text-sm truncate">{product.name}</div>
                      <div className="text-xs text-white/35 mt-0.5 flex items-center gap-2 flex-wrap">
                        {product.category && <span>{product.category}</span>}
                        {product.priceUnit && <span>{product.currency ?? 'USD'} {product.priceUnit}</span>}
                        {product.imageMainUrls.length > 0 && <span>{product.imageMainUrls.length} img</span>}
                        {!product.active && <span className="text-white/15 italic">inactivo</span>}
                        {product.sharedByUsername && (
                          <span className="flex items-center gap-1 text-indigo-400/70">
                            <Share2 className="w-2.5 h-2.5" />
                            de @{product.sharedByUsername}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setSharingProduct(product)}
                        className="p-2 hover:bg-indigo-400/10 rounded-lg transition-colors text-white/35 hover:text-indigo-400"
                        title="Compartir con otro usuario"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleEdit(product)}
                        className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white/35 hover:text-white"
                        title="Editar"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleUnassign(product.id)}
                        disabled={actioning === product.id}
                        className="p-2 hover:bg-yellow-500/10 rounded-lg transition-colors text-white/35 hover:text-yellow-400 disabled:opacity-50"
                        title="Quitar del agente"
                      >
                        {actioning === product.id ? <Spinner /> : <X className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Available catalog products */}
          {available.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-white/35 uppercase tracking-wider mb-2">
                Del catálogo — agregar a este bot
              </div>
              <div className="space-y-2">
                {available.map(product => (
                  <div
                    key={product.id}
                    className="bg-white/5 border border-white/10 p-4 rounded-xl flex items-center gap-4 group hover:bg-white/5 transition-colors opacity-60 hover:opacity-100"
                  >
                    <div className={`w-2 h-2 rounded-full shrink-0 ${product.active ? 'bg-amber-400/50' : 'bg-white/8'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-white text-sm truncate">{product.name}</div>
                      <div className="text-xs text-white/35 mt-0.5 flex items-center gap-2">
                        {product.category && <span>{product.category}</span>}
                        {product.priceUnit && <span>{product.currency ?? 'USD'} {product.priceUnit}</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => handleAssign(product)}
                      disabled={actioning === product.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-400/10 text-amber-400 hover:bg-amber-400/20 transition-colors disabled:opacity-50"
                    >
                      {actioning === product.id ? <Spinner /> : <Plus className="w-3 h-3" />}
                      Asignar
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── QR Tab (solo para bots BAILEYS) ─────────────────────────────────────────

type BaileysStatus = 'disconnected' | 'connecting' | 'qr_ready' | 'connected'

// ─── Follow-up Tab ────────────────────────────────────────────────────────────

function FollowUpTab({
  bot,
  onSaved,
}: {
  bot: Bot
  onSaved: (updated: Partial<Bot>) => void
}) {
  const [f1, setF1] = useState(bot.followUp1Delay)
  const [f2, setF2] = useState(bot.followUp2Delay)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      const res = await fetch(`/api/bots/${bot.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          followUp1Delay: Number(f1),
          followUp2Delay: Number(f2),
        }),
      })
      if (!res.ok) throw new Error('Error al guardar configuración')
      const data = await res.json()
      onSaved(data.bot)
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300 transition-all">
      <div className="bg-white/5 border border-white/10 p-6 rounded-2xl space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center">
            <Bell className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Configuración de Seguimientos</h3>
            <p className="text-sm text-white/35 mt-0.5">Define los intervalos para re-interactuar con clientes.</p>
          </div>
        </div>

        <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-2">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-white/50 uppercase tracking-widest pl-1">
              1er Seguimiento
            </label>
            <div className="relative group">
              <input
                type="number"
                min="1"
                value={f1}
                onChange={e => setF1(Number(e.target.value))}
                className="w-full bg-[#0B0B12]/50 border border-white/10 group-hover:border-white/20 focus:border-amber-400/40 rounded-xl px-4 py-3 text-sm text-white transition-all outline-none"
                placeholder="Ej: 15"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[9px] text-white/25 font-bold uppercase tracking-tighter">Minutos</span>
            </div>
            <p className="text-[10px] text-white/25 italic pl-1">Por defecto: 15 min.</p>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-white/50 uppercase tracking-widest pl-1">
              2do Seguimiento
            </label>
            <div className="relative group">
              <input
                type="number"
                min="1"
                value={f2}
                onChange={e => setF2(Number(e.target.value))}
                className="w-full bg-[#0B0B12]/50 border border-white/10 group-hover:border-white/20 focus:border-amber-400/40 rounded-xl px-4 py-3 text-sm text-white transition-all outline-none"
                placeholder="Ej: 4320"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[9px] text-white/25 font-bold uppercase tracking-tighter">Minutos</span>
            </div>
            <p className="text-[10px] text-white/25 italic pl-1">Por defecto: 4320 min (3 días).</p>
          </div>

          <div className="md:col-span-2 flex items-center justify-between gap-4 pt-2">
            <div className="flex-1">
              {error && <Alert type="error" msg={error} />}
              {success && <Alert type="success" msg="¡Configuración guardada!" />}
            </div>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-6 py-3 bg-amber-400 text-black rounded-xl text-sm font-bold hover:bg-amber-400/90 transition-all disabled:opacity-50 shrink-0 shadow-lg shadow-amber-400/10"
            >
              {saving ? <Spinner /> : <Check className="w-4 h-4" />}
              Guardar Cambios
            </button>
          </div>
        </form>
      </div>

      <div className="bg-amber-400/5 border border-amber-400/10 rounded-2xl p-4 flex gap-4">
        <div className="w-10 h-10 rounded-full bg-amber-400/10 flex items-center justify-center shrink-0">
          <Zap className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-white">¿Cómo funciona?</h4>
          <p className="text-xs text-white/50 mt-1 leading-relaxed">
            El sistema calculará el tiempo desde el <strong>último mensaje enviado por el bot</strong>.
            Si el cliente no responde en ese intervalo, el agente enviará un mensaje automático.
            Los seguimientos se detienen si el cliente compra o si vuelve a escribir.
          </p>
        </div>
      </div>
    </div>
  )
}

function QRTab({ bot }: { bot: Bot }) {
  const [status, setStatus] = useState<BaileysStatus>('disconnected')
  const [qrBase64, setQrBase64] = useState<string | undefined>()
  const [phone, setPhone] = useState<string | undefined>(bot.baileysPhone ?? undefined)
  const [connecting, setConnecting] = useState(false)
  const [clearingMemory, setClearingMemory] = useState(false)
  const [msg, setMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null)

  // Polling: actualizar estado cada 3 segundos cuando no está 'connected'
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>
    async function poll() {
      try {
        const res = await fetch(`/api/bots/${bot.id}/baileys/status`)
        if (!res.ok) return
        const data = await res.json()
        setStatus(data.status)
        setQrBase64(data.qrBase64)
        if (data.phone) setPhone(data.phone)
      } catch { /* ignore */ }
    }
    poll()
    if (status !== 'connected') {
      interval = setInterval(poll, 3000)
    }
    return () => clearInterval(interval)
  }, [bot.id, status])

  async function handleConnect() {
    setConnecting(true)
    setMsg(null)
    try {
      const res = await fetch(`/api/bots/${bot.id}/baileys/connect`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al conectar')
      setStatus('connecting')
    } catch (err: unknown) {
      setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Error desconocido' })
    } finally {
      setConnecting(false)
    }
  }

  async function handleDisconnect() {
    if (!confirm('¿Desconectar y borrar sesión? Deberás escanear el QR de nuevo.')) return
    await fetch(`/api/bots/${bot.id}/baileys/status`, { method: 'DELETE' })
    setStatus('disconnected')
    setQrBase64(undefined)
    setPhone(undefined)
    setMsg({ type: 'success', text: 'Sesión borrada correctamente.' })
  }

  async function handleClearMemory() {
    if (!confirm('¿Eliminar todas las conversaciones de este bot? El bot olvidará el historial de todos los clientes. Esta acción no se puede deshacer.')) return
    setClearingMemory(true)
    setMsg(null)
    try {
      const res = await fetch(`/api/bots/${bot.id}/clear-memory`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al limpiar')
      setMsg({ type: 'success', text: `Memoria limpiada — ${data.conversationsDeleted} conversación(es) eliminada(s).` })
    } catch (err: unknown) {
      setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Error desconocido' })
    } finally {
      setClearingMemory(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Estado */}
      <div className="bg-white/5 border border-white/10 p-5 rounded-2xl flex items-center justify-between">
        <div>
          <div className="text-sm font-bold text-white flex items-center gap-2">
            {status === 'connected'
              ? <Wifi className="w-4 h-4 text-amber-400" />
              : <WifiOff className="w-4 h-4 text-white/35" />}
            {status === 'connected' ? 'Conectado' : status === 'qr_ready' ? 'Esperando escaneo' : status === 'connecting' ? 'Conectando...' : 'Desconectado'}
          </div>
          {phone && <div className="text-xs text-white/35 mt-0.5">📱 +{phone}</div>}
        </div>
        <div className="flex gap-2">
          {status === 'connected' ? (
            <button
              onClick={handleDisconnect}
              className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 rounded-xl text-xs font-medium transition-colors"
            >
              <WifiOff className="w-3.5 h-3.5" /> Desconectar
            </button>
          ) : (
            <button
              onClick={handleConnect}
              disabled={connecting || status === 'connecting' || status === 'qr_ready'}
              className="flex items-center gap-2 px-3 py-2 bg-amber-400/10 border border-amber-400/30 text-amber-400 hover:bg-amber-400/20 rounded-xl text-xs font-medium transition-colors disabled:opacity-50"
            >
              {connecting || status === 'connecting' ? <Spinner /> : <RefreshCw className="w-3.5 h-3.5" />}
              {status === 'qr_ready' ? 'Escanea el QR' : 'Conectar'}
            </button>
          )}
        </div>
      </div>

      {msg && <Alert type={msg.type} msg={msg.text} />}

      {/* QR */}
      {status === 'qr_ready' && qrBase64 && (
        <div className="bg-white/5 border border-white/10 p-6 rounded-2xl text-center space-y-4">
          <div className="flex items-center gap-2 justify-center text-sm font-bold text-white">
            <QrCode className="w-4 h-4 text-amber-400" />
            Escanea con WhatsApp
          </div>
          <p className="text-xs text-white/35">
            Abre WhatsApp → Dispositivos vinculados → Vincular dispositivo
          </p>
          <div className="flex justify-center">
            <img
              src={qrBase64}
              alt="QR WhatsApp"
              className="w-56 h-56 rounded-2xl border-4 border-amber-400/30 bg-white p-2"
            />
          </div>
          <p className="text-[11px] text-white/25">El QR se actualiza automáticamente cada 20 segundos.</p>
        </div>
      )}

      {/* Conectado */}
      {status === 'connected' && (
        <div className="bg-white/5 border border-amber-400/20 p-6 rounded-2xl text-center space-y-2">
          <div className="w-12 h-12 rounded-xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center mx-auto">
            <Wifi className="w-6 h-6 text-amber-400" />
          </div>
          <div className="text-sm font-bold text-white">¡Agente conectado correctamente!</div>
          <div className="text-xs text-white/35">El agente está activo y respondiendo mensajes en WhatsApp.</div>
        </div>
      )}

      {/* Desconectado - instrucciones */}
      {status === 'disconnected' && (
        <div className="bg-white/5 border border-white/10 p-6 rounded-2xl">
          <h3 className="text-sm font-bold text-white mb-3">Pasos para conectar</h3>
          <ol className="space-y-3">
            {['Presiona "Conectar" arriba', 'Espera a que aparezca el código QR', 'Abre WhatsApp en tu teléfono', 'Ve a Dispositivos vinculados → Vincular dispositivo', 'Escanea el QR con tu cámara'].map((step, i) => (
              <li key={i} className="flex gap-3 text-sm text-white/50">
                <span className="w-5 h-5 rounded-full bg-amber-400/10 border border-amber-400/20 text-amber-400 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                {step}
              </li>
            ))}
          </ol>
        </div>
      )}
      {/* Zona peligrosa: limpiar memoria */}
      <div className="bg-white/5 border border-red-500/15 p-4 rounded-2xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-bold text-white flex items-center gap-2">
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
              Limpiar memoria
            </div>
            <p className="text-xs text-white/35 mt-0.5">
              Elimina el historial de conversaciones de todos los clientes.
            </p>
          </div>
          <button
            onClick={handleClearMemory}
            disabled={clearingMemory}
            className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 rounded-xl text-xs font-medium transition-colors disabled:opacity-50 shrink-0"
          >
            {clearingMemory ? <Spinner /> : <Trash2 className="w-3.5 h-3.5" />}
            Limpiar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Chats Tab ────────────────────────────────────────────────────────────────

interface ConvSummary {
  id: string
  userPhone: string
  userName: string | null
  sold: boolean
  botDisabled: boolean
  updatedAt: string
  messages: { role: string; content: string; type: string; createdAt: string }[]
  _count: { messages: number }
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  type: string
  content: string
  createdAt: string
}

function parseAssistantContent(content: string): string {
  try {
    const p = JSON.parse(content) as Record<string, unknown>
    return [p.mensaje1, p.mensaje2, p.mensaje3].filter(Boolean).join('\n\n')
  } catch {
    return content
  }
}

function ChatsTab({ bot }: { bot: Bot }) {
  const [convs, setConvs] = useState<ConvSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [deletingChat, setDeletingChat] = useState(false)
  const [togglingBot, setTogglingBot] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [markSoldModal, setMarkSoldModal] = useState(false)
  const [markSoldReport, setMarkSoldReport] = useState('')
  const [markingSold, setMarkingSold] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  async function loadConvs() {
    setLoading(true)
    try {
      const res = await fetch(`/api/bots/${bot.id}/conversations`)
      if (res.ok) {
        const data = await res.json()
        setConvs(data.conversations ?? [])
      }
    } finally {
      setLoading(false)
    }
  }

  async function loadMessages(phone: string) {
    setMessages([])
    setLoadingMsgs(true)
    try {
      const res = await fetch(`/api/bots/${bot.id}/conversations/${encodeURIComponent(phone)}`)
      if (res.ok) {
        const data = await res.json()
        setMessages(data.messages ?? [])
      }
    } finally {
      setLoadingMsgs(false)
    }
  }

  async function deleteChat(phone: string) {
    if (!confirm('¿Borrar el historial de mensajes de este contacto?')) return
    setDeletingChat(true)
    try {
      await fetch(`/api/bots/${bot.id}/conversations/${encodeURIComponent(phone)}`, { method: 'DELETE' })
      setMessages([])
      setSelectedPhone(null)
      await loadConvs()
    } finally {
      setDeletingChat(false)
    }
  }

  async function toggleBot(phone: string, currentDisabled: boolean) {
    setTogglingBot(true)
    try {
      const res = await fetch(`/api/bots/${bot.id}/conversations/${encodeURIComponent(phone)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botDisabled: !currentDisabled }),
      })
      if (res.ok) {
        setConvs(prev => prev.map(c => c.userPhone === phone ? { ...c, botDisabled: !currentDisabled } : c))
      }
    } finally {
      setTogglingBot(false)
    }
  }

  async function handleMarkAsSold() {
    if (!selectedPhone) return
    setMarkingSold(true)
    try {
      const res = await fetch(`/api/bots/${bot.id}/conversations/${encodeURIComponent(selectedPhone)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAsSold: true, orderReport: markSoldReport }),
      })
      if (res.ok) {
        setConvs(prev => prev.map(c => c.userPhone === selectedPhone ? { ...c, sold: true, botDisabled: true } : c))
        setMarkSoldModal(false)
        setMarkSoldReport('')
      }
    } finally {
      setMarkingSold(false)
    }
  }

  async function sendReply() {
    if (!selectedPhone || !replyText.trim() || sending) return
    setSendError('')
    setSending(true)
    try {
      const res = await fetch(`/api/bots/${bot.id}/conversations/${encodeURIComponent(selectedPhone)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: replyText.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setSendError(data.error ?? 'Error al enviar')
        return
      }
      setMessages(prev => [...prev, data.message as ChatMessage])
      setReplyText('')
    } catch {
      setSendError('Error de conexión')
    } finally {
      setSending(false)
    }
  }

  useEffect(() => { loadConvs() }, [bot.id])

  useEffect(() => {
    if (selectedPhone) {
      setReplyText('')
      setSendError('')
      loadMessages(selectedPhone)
    }
  }, [selectedPhone])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const selectedConv = convs.find(c => c.userPhone === selectedPhone)
  const isMeta = bot.type === 'META'

  // Colores según el tipo de bot
  const theme = isMeta
    ? { panelBg: '#18191a', headerBg: '#242526', chatBg: '#0e0e0e', itemHover: '#2f3031', itemSelected: '#3a3b3c', avatarBg: '#0084ff', avatarText: '#fff', outBubble: '#0084ff', outText: '#fff', inBubble: '#3a3b3c', inText: '#e4e6ea', inputBg: '#3a3b3c', inputBorder: '#4a4b4c', sendBtn: '#0084ff', accent: '#0084ff', accentText: '#fff' }
    : { panelBg: '#111b21', headerBg: '#202c33', chatBg: '#0b141a', itemHover: '#2a3942', itemSelected: '#2a3942', avatarBg: '#00a884', avatarText: '#fff', outBubble: '#005c4b', outText: '#e9edef', inBubble: '#202c33', inText: '#e9edef', inputBg: '#2a3942', inputBorder: '#374045', sendBtn: '#00a884', accent: '#00a884', accentText: '#fff' }

  function initials(name: string | null, phone: string) {
    if (name) return name.slice(0, 2).toUpperCase()
    return phone.slice(-2)
  }

  // En móvil mostramos un panel a la vez
  const showList = !selectedPhone
  const showChat = !!selectedPhone

  return (
    <>
    <div className="rounded-2xl overflow-hidden h-[480px] sm:h-[620px]" style={{ background: theme.panelBg }}>
      <div className="flex h-full">

        {/* ── Panel izquierdo: lista de contactos ── */}
        <div
          className={`flex-col border-r shrink-0 h-full ${showList ? 'flex w-full' : 'hidden'} sm:flex sm:w-64`}
          style={{ borderColor: 'rgba(255,255,255,0.06)', background: theme.panelBg }}
        >
          {/* Header lista */}
          <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ background: theme.headerBg }}>
            <span className="text-sm font-bold text-white">{isMeta ? '💬 Messenger' : '💬 WhatsApp'}</span>
            <button onClick={loadConvs} className="p-1.5 rounded-full hover:bg-white/10 transition-colors" title="Refrescar">
              <RefreshCw className="w-4 h-4 text-white/60" />
            </button>
          </div>

          {/* Lista */}
          <div className="flex-1 overflow-y-auto">
            {loading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin" style={{ color: theme.accent }} />
              </div>
            )}
            {!loading && convs.length === 0 && (
              <div className="px-4 py-8 text-center text-xs text-white/30">Sin conversaciones aún</div>
            )}
            {!loading && convs.map(c => {
              const lastMsg = c.messages[0]
              const isSelected = selectedPhone === c.userPhone
              const displayName = c.userName || c.userPhone
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedPhone(c.userPhone)}
                  className="w-full text-left flex items-center gap-2 sm:gap-3 px-3 py-2.5 border-b transition-colors"
                  style={{
                    borderColor: 'rgba(255,255,255,0.04)',
                    background: isSelected ? theme.itemSelected : 'transparent',
                  }}
                  onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = theme.itemHover }}
                  onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ background: c.botDisabled ? '#374045' : theme.avatarBg, color: theme.avatarText }}>
                    {initials(c.userName, c.userPhone)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span className="text-sm font-medium truncate" style={{ color: '#e9edef' }}>{displayName}</span>
                      <span className="text-[10px] shrink-0" style={{ color: '#8696a0' }}>
                        {new Date(c.updatedAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <p className="text-xs truncate flex-1" style={{ color: '#8696a0' }}>
                        {lastMsg ? (lastMsg.role === 'assistant' ? '🤖 ' : '') + parseAssistantContent(lastMsg.content).slice(0, 30) : 'Sin mensajes'}
                      </p>
                      {c.sold && <span className="text-[9px] font-bold shrink-0 px-1 py-0.5 rounded" style={{ background: 'rgba(0,168,132,0.2)', color: '#00a884' }}>VENTA</span>}
                      {c.botDisabled && <span className="text-[9px] font-bold shrink-0 px-1 py-0.5 rounded" style={{ background: 'rgba(239,68,68,0.2)', color: '#f87171' }}>OFF</span>}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Panel derecho: chat ── */}
        <div className={`flex-col min-w-0 flex-1 h-full ${showChat ? 'flex' : 'hidden'} sm:flex`}>
          {!selectedPhone ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3" style={{ background: theme.chatBg }}>
              <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.05)' }}>
                <MessageSquare className="w-8 h-8" style={{ color: 'rgba(255,255,255,0.2)' }} />
              </div>
              <p className="text-sm font-medium" style={{ color: '#8696a0' }}>Selecciona un chat</p>
              <p className="text-xs" style={{ color: '#8696a0' }}>para ver el historial de mensajes</p>
            </div>
          ) : (
            <>
              {/* ── Cabecera del chat ── */}
              <div className="px-2 sm:px-3 py-2 flex items-center gap-2 shrink-0" style={{ background: theme.headerBg }}>
                {/* Volver — solo móvil */}
                <button onClick={() => setSelectedPhone(null)} className="sm:hidden p-1.5 rounded-full hover:bg-white/10 transition-colors shrink-0">
                  <ArrowLeft className="w-4 h-4 text-white/70" />
                </button>

                {/* Avatar */}
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ background: selectedConv?.botDisabled ? '#374045' : theme.avatarBg, color: theme.avatarText }}>
                  {initials(selectedConv?.userName ?? null, selectedPhone)}
                </div>

                {/* Nombre */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm font-semibold truncate text-white">{selectedConv?.userName || selectedPhone}</p>
                  <p className="text-[9px] sm:text-[10px] truncate" style={{ color: '#8696a0' }}>{selectedPhone}</p>
                </div>

                {/* ── Botón Toggle bot ── */}
                <button
                  onClick={() => selectedConv && toggleBot(selectedPhone, selectedConv.botDisabled)}
                  disabled={togglingBot}
                  className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-full text-xs font-bold transition-all disabled:opacity-50 shrink-0"
                  style={selectedConv?.botDisabled
                    ? { background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.4)' }
                    : { background: `rgba(${isMeta ? '0,132,255' : '0,168,132'},0.15)`, color: theme.accent, border: `1px solid rgba(${isMeta ? '0,132,255' : '0,168,132'},0.4)` }}
                >
                  {togglingBot
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : selectedConv?.botDisabled
                      ? <ToggleLeft className="w-4 h-4" />
                      : <ToggleRight className="w-4 h-4" />}
                  <span className="hidden sm:inline">{selectedConv?.botDisabled ? 'Bot OFF' : 'Bot ON'}</span>
                </button>

                {/* ── Botón Marcar Venta ── */}
                {!selectedConv?.sold && (
                  <button
                    onClick={() => {
                      setMarkSoldReport(`Hola *${bot.name}*, nuevo pedido de [nombre].\nContacto: ${selectedPhone}.\nDirección: [dirección].\nDescripción: [producto].`)
                      setMarkSoldModal(true)
                    }}
                    className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-full text-xs font-bold transition-all shrink-0"
                    style={{ background: 'rgba(245,158,11,0.12)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.35)' }}
                  >
                    <ShoppingBag className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Marcar Venta</span>
                  </button>
                )}

                {/* ── Botón Borrar chat ── */}
                <button
                  onClick={() => deleteChat(selectedPhone)}
                  disabled={deletingChat}
                  className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-full text-xs font-bold transition-all disabled:opacity-50 shrink-0"
                  style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.35)' }}
                >
                  {deletingChat ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">Borrar</span>
                </button>
              </div>

              {/* ── Área de mensajes ── */}
              <div
                className="flex-1 overflow-y-auto px-4 py-3 space-y-1"
                style={{
                  minHeight: 0,
                  background: theme.chatBg,
                  backgroundImage: isMeta
                    ? 'none'
                    : 'radial-gradient(circle, rgba(255,255,255,0.015) 1px, transparent 1px)',
                  backgroundSize: '24px 24px',
                }}
              >
                {loadingMsgs && (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="w-5 h-5 animate-spin" style={{ color: theme.accent }} />
                  </div>
                )}
                {!loadingMsgs && messages.length === 0 && (
                  <div className="flex items-center justify-center py-10 text-xs" style={{ color: '#8696a0' }}>Sin mensajes</div>
                )}
                {!loadingMsgs && messages.map(msg => {
                  const isBot = msg.role === 'assistant'
                  const text = isBot ? parseAssistantContent(msg.content) : msg.content
                  const time = new Date(msg.createdAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
                  return (
                    <div key={msg.id} className={`flex mb-1 ${isBot ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className="max-w-[80%] sm:max-w-[65%] rounded-2xl px-3 py-2 text-sm leading-relaxed relative"
                        style={{
                          background: isBot ? theme.outBubble : theme.inBubble,
                          color: isBot ? theme.outText : theme.inText,
                          borderRadius: isBot ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                        }}
                      >
                        <div className="whitespace-pre-wrap break-words">{text}</div>
                        <div className="flex items-center justify-end gap-1 mt-1">
                          <span className="text-[10px]" style={{ color: isBot ? 'rgba(255,255,255,0.5)' : '#8696a0' }}>
                            {msg.type !== 'text' ? `📎 ${msg.type} · ` : ''}{time}
                          </span>
                          {isBot && <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.5)' }}>✓✓</span>}
                        </div>
                      </div>
                    </div>
                  )
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* ── Input de respuesta ── */}
              {bot.type !== 'YCLOUD' ? (
                <div className="px-4 py-3 flex items-center justify-center shrink-0" style={{ background: theme.headerBg }}>
                  <span className="text-xs rounded-full px-3 py-1.5" style={{ background: 'rgba(255,255,255,0.05)', color: '#8696a0' }}>
                    Envío manual solo disponible para bots YCloud
                  </span>
                </div>
              ) : (
                <div className="px-3 py-2 flex flex-col gap-1 shrink-0" style={{ background: theme.headerBg }}>
                  {sendError && (
                    <p className="text-[10px] text-red-400 px-2 pb-1">{sendError}</p>
                  )}
                  <div className="flex items-end gap-2">
                    <textarea
                      value={replyText}
                      onChange={e => { setReplyText(e.target.value); if (sendError) setSendError('') }}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply() } }}
                      placeholder="Escribe un mensaje…"
                      rows={1}
                      className="flex-1 rounded-2xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none resize-none"
                      style={{ background: theme.inputBg, border: `1px solid ${theme.inputBorder}`, maxHeight: 100 }}
                    />
                    <button
                      onClick={sendReply}
                      disabled={sending || !replyText.trim()}
                      className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all disabled:opacity-40"
                      style={{ background: theme.sendBtn }}
                      title="Enviar"
                    >
                      {sending
                        ? <Loader2 className="w-4 h-4 animate-spin text-white" />
                        : <svg viewBox="0 0 24 24" className="w-5 h-5 text-white fill-current" style={{ transform: 'rotate(45deg)', marginLeft: '-2px' }}><path d="M2 21L23 12 2 3v7l15 2-15 2z"/></svg>}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>

    {/* ── Modal: Marcar Venta Manual ── */}
    {markSoldModal && (
      <div
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        onClick={e => { if (e.target === e.currentTarget) setMarkSoldModal(false) }}
      >
        <div style={{ background: '#0B0B12', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 480 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShoppingBag size={18} color="#F59E0B" />
              <span style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>Registrar venta por llamada</span>
            </div>
            <button onClick={() => setMarkSoldModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)' }}>
              <X size={18} />
            </button>
          </div>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 12 }}>
            Edita el reporte con los datos del pedido. El bot dejará de responder a este contacto.
          </p>
          <textarea
            value={markSoldReport}
            onChange={e => setMarkSoldReport(e.target.value)}
            rows={6}
            style={{
              width: '100%', borderRadius: 10, padding: '10px 12px', fontSize: 13,
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
              color: '#fff', resize: 'vertical', outline: 'none', fontFamily: 'inherit',
            }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
            <button
              onClick={() => setMarkSoldModal(false)}
              style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 13 }}
            >
              Cancelar
            </button>
            <button
              onClick={handleMarkAsSold}
              disabled={markingSold}
              style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#F59E0B', color: '#000', fontWeight: 700, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, opacity: markingSold ? 0.6 : 1 }}
            >
              {markingSold ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              Confirmar Venta
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}

// ─── Bot Detail View ──────────────────────────────────────────────────────────

function BotDetailView({
  bot: initialBot,
  onBack,
  onBotUpdated,
  onDeleted,
}: {
  bot: Bot
  onBack: () => void
  onBotUpdated: (updated: Bot) => void
  onDeleted: (botId: string) => void
}) {
  const [bot, setBot] = useState<Bot>(initialBot)
  const isBaileys = bot.type === 'BAILEYS'
  const [tab, setTab] = useState<Tab>(isBaileys ? 'qr' : 'webhook')

  const [editingName, setEditingName] = useState(false)
  const [newName, setNewName] = useState(bot.name)
  const [savingName, setSavingName] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [savingStatus, setSavingStatus] = useState(false)

  async function toggleStatus() {
    setSavingStatus(true)
    const newStatus = bot.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE'
    try {
      const res = await fetch(`/api/bots/${bot.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (res.ok) handleBotPatch({ status: newStatus })
    } finally {
      setSavingStatus(false)
    }
  }

  function handleBotPatch(updated: Partial<Bot>) {
    const merged = { ...bot, ...updated }
    setBot(merged)
    onBotUpdated(merged)
  }

  async function saveName() {
    if (!newName.trim() || newName === bot.name) { setEditingName(false); return }
    setSavingName(true)
    try {
      const res = await fetch(`/api/bots/${bot.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      })
      const data = await res.json()
      if (res.ok) handleBotPatch(data.bot)
    } finally {
      setSavingName(false)
      setEditingName(false)
    }
  }

  async function handleDelete() {
    if (!confirm(`¿Eliminar el bot "${bot.name}" permanentemente?\n\nSe borrarán todas sus conversaciones, mensajes y productos. Esta acción no se puede deshacer.`)) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/bots/${bot.id}`, { method: 'DELETE' })
      if (res.ok) onDeleted(bot.id)
    } finally {
      setDeleting(false)
    }
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    ...(!isBaileys ? [{ id: 'webhook' as Tab, label: 'Webhook', icon: <Webhook className="w-3.5 h-3.5" /> }] : []),
    { id: 'credentials', label: 'Credenciales', icon: <Key className="w-3.5 h-3.5" /> },
    { id: 'prompt', label: 'Plantilla', icon: <FileText className="w-3.5 h-3.5" /> },
    { id: 'products', label: 'Productos', icon: <Package className="w-3.5 h-3.5" /> },
    { id: 'followup', label: 'Seguimientos', icon: <Bell className="w-3.5 h-3.5" /> },
    { id: 'chats' as Tab, label: 'Chats', icon: <MessageSquare className="w-3.5 h-3.5" /> },
    ...(isBaileys ? [{ id: 'qr' as Tab, label: 'WhatsApp QR', icon: <QrCode className="w-3.5 h-3.5" /> }] : []),
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="p-2 hover:bg-white/5 rounded-lg transition-colors text-white/35 hover:text-white"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center shrink-0">
            <Bot className="w-5 h-5 text-amber-400" />
          </div>
          {editingName ? (
            <div className="flex items-center gap-2 flex-1">
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveName()}
                autoFocus
                className="bg-[#0B0B12]/50 border border-white/20 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-amber-400/40 flex-1 max-w-xs"
              />
              <button onClick={saveName} disabled={savingName} className="text-amber-400 hover:text-amber-400/80">
                {savingName ? <Spinner /> : <Check className="w-4 h-4" />}
              </button>
              <button onClick={() => setEditingName(false)} className="text-white/35 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-white">{bot.name}</h2>
              <button
                onClick={() => { setNewName(bot.name); setEditingName(true) }}
                className="text-white/25 hover:text-white transition-colors"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
        <button
          onClick={toggleStatus}
          disabled={savingStatus}
          title={bot.status === 'ACTIVE' ? 'Pausar agente' : 'Activar agente'}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold transition-all disabled:opacity-50 ${bot.status === 'ACTIVE'
            ? 'bg-amber-400/10 text-amber-400 border-amber-400/20 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30'
            : 'bg-white/8 text-white/35 border-white/10 hover:bg-amber-400/10 hover:text-amber-400 hover:border-amber-400/20'
            }`}
        >
          {savingStatus ? (
            <Spinner />
          ) : bot.status === 'ACTIVE' ? (
            <ToggleRight className="w-3.5 h-3.5" />
          ) : (
            <ToggleLeft className="w-3.5 h-3.5" />
          )}
          {bot.status === 'ACTIVE' ? 'ACTIVO' : 'PAUSADO'}
        </button>
        <button
          onClick={handleDelete}
          disabled={deleting}
          title="Eliminar agente"
          className="p-2 hover:bg-red-500/10 rounded-lg transition-colors text-white/25 hover:text-red-400 disabled:opacity-50"
        >
          {deleting ? <Spinner /> : <Trash2 className="w-4 h-4" />}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#0B0B12]/50 p-1 rounded-xl border border-white/5 overflow-x-auto scrollbar-hide">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${tab === t.id
              ? 'bg-amber-500/10 text-amber-400 border border-amber-400/25'
              : 'text-white/35 hover:text-white/70 hover:bg-white/5'
              }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'webhook' && (bot.type === 'YCLOUD' || bot.type === 'META') && <WebhookTab bot={bot} />}
      {tab === 'credentials' && (
        <CredentialsTab
          bot={bot}
          onStatusChange={status => handleBotPatch({ status })}
        />
      )}
      {tab === 'prompt' && (
        <PromptTab bot={bot} onSaved={handleBotPatch} />
      )}
      {tab === 'products' && <ProductsTab bot={bot} />}
      {tab === 'followup' && (
        <FollowUpTab bot={bot} onSaved={handleBotPatch} />
      )}
      {tab === 'qr' && isBaileys && <QRTab bot={bot} />}
      {tab === 'chats' && <ChatsTab bot={bot} />}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function WhatsAppPage() {
  const [bots, setBots] = useState<Bot[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedBot, setSelectedBot] = useState<Bot | null>(null)
  const [justCreatedWebhook, setJustCreatedWebhook] = useState<string | null>(null)

  async function loadBots() {
    setLoading(true)
    try {
      const res = await fetch('/api/bots')
      if (res.ok) {
        const data = await res.json()
        setBots(data.bots)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadBots() }, [])

  function handleBotCreated(bot: Bot, webhookUrl: string) {
    setBots(prev => [bot, ...prev])
    setJustCreatedWebhook(webhookUrl)
    setSelectedBot(bot)
  }

  function handleSelectBot(bot: Bot) {
    setJustCreatedWebhook(null)
    setSelectedBot(bot)
  }

  function handleBack() {
    setSelectedBot(null)
    setJustCreatedWebhook(null)
  }

  function handleBotUpdated(updated: Bot) {
    setBots(prev => prev.map(b => (b.id === updated.id ? updated : b)))
    setSelectedBot(updated)
  }

  function handleBotDeleted(botId: string) {
    setBots(prev => prev.filter(b => b.id !== botId))
    setSelectedBot(null)
    setJustCreatedWebhook(null)
  }

  const activeBots = bots.filter(b => b.status === 'ACTIVE').length

  return (
    <div className="min-h-screen px-4 py-7 md:px-10 md:py-9 pb-20" style={{ background: '#0B0B12' }}>
      {/* Page Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link
          href="/dashboard/services"
          className="p-2 hover:bg-white/5 rounded-lg transition-colors group"
        >
          <ArrowLeft className="w-5 h-5 text-white/35 group-hover:text-white transition-colors" />
        </Link>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-400/10 flex items-center justify-center border border-amber-400/20 shadow-[0_0_15px_rgba(245,158,11,0.15)]">
            <MessageCircle className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              WhatsApp Bots
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded-md bg-amber-400/10 text-amber-400 border border-amber-400/20">
                Multi-Tenant
              </span>
            </h1>
            <p className="text-sm text-white/50">Configura y gestiona tus agentes AI de ventas.</p>
          </div>
        </div>
      </div>

      {selectedBot ? (
        <BotDetailView
          bot={selectedBot}
          onBack={handleBack}
          onBotUpdated={handleBotUpdated}
          onDeleted={handleBotDeleted}
        />
      ) : (
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white/5 border border-white/10 p-4 rounded-xl flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                <Bot className="w-5 h-5 text-white/50" />
              </div>
              <div>
                <div className="text-2xl font-bold text-white">{bots.length}</div>
                <div className="text-xs text-white/35">Total agentes</div>
              </div>
            </div>
            <div className="bg-white/5 border border-amber-400/20 p-4 rounded-xl flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center shrink-0">
                <Zap className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-amber-400">{activeBots}</div>
                <div className="text-xs text-white/35">Activos ahora</div>
              </div>
            </div>
            <div className="bg-white/5 border border-white/10 p-4 rounded-xl flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-400/10 border border-indigo-400/20 flex items-center justify-center shrink-0">
                <ShoppingBag className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-indigo-400">
                  {bots.reduce((acc, b) => acc + (b._count?.assignedProducts ?? 0), 0)}
                </div>
                <div className="text-xs text-white/35">Productos totales</div>
              </div>
            </div>
          </div>

          {/* Global chart */}
          <GlobalBotChart bots={bots} />

          {/* Create bot form */}
          <CreateBotForm onCreated={handleBotCreated} />

          {/* Bot list */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-white/35" />
            </div>
          ) : bots.length === 0 ? (
            <div className="bg-white/5 border border-white/8 p-12 rounded-2xl text-center">
              <div className="w-16 h-16 rounded-2xl bg-amber-400/5 border border-amber-400/10 flex items-center justify-center mx-auto mb-4 shadow-[0_0_20px_rgba(245,158,11,0.08)]">
                <Bot className="w-8 h-8 text-white/25" />
              </div>
              <div className="text-white font-semibold mb-1">Sin agentes configurados</div>
              <div className="text-white/35 text-sm max-w-xs mx-auto">
                Crea tu primer agente AI de ventas usando el formulario de arriba.
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {bots.map(bot => (
                <BotCard key={bot.id} bot={bot} onSelect={handleSelectBot} />
              ))}
            </div>
          )}

          {/* How it works */}
          <div className="bg-white/5 border border-white/10 p-6 rounded-2xl">
            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              ¿Cómo funciona?
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {([
                { icon: <Plus className="w-4 h-4 text-amber-400" />, title: '1. Crea el agente', desc: 'Dale un nombre y obtén la URL de webhook.', border: 'border-l-amber-400/50', bg: 'bg-amber-400/5' },
                { icon: <Key className="w-4 h-4 text-indigo-400" />, title: '2. Configura credenciales', desc: 'Agrega tus API keys de YCloud y OpenAI.', border: 'border-l-indigo-400/50', bg: 'bg-indigo-400/5' },
                { icon: <ShoppingBag className="w-4 h-4 text-violet-400" />, title: '3. Agrega productos', desc: 'Define la base de conocimiento del agente.', border: 'border-l-violet-400/50', bg: 'bg-violet-400/5' },
                { icon: <Webhook className="w-4 h-4 text-amber-400" />, title: '4. Conecta YCloud', desc: 'Apunta el webhook en tu panel de YCloud.', border: 'border-l-amber-400/50', bg: 'bg-amber-400/5' },
              ] as const).map((step, i) => (
                <div key={i} className={`${step.bg} border border-white/5 border-l-2 ${step.border} rounded-xl p-4`}>
                  <div className="mb-2">{step.icon}</div>
                  <div className="text-xs font-bold text-white mb-1">{step.title}</div>
                  <div className="text-[11px] text-white/35 leading-relaxed">{step.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
