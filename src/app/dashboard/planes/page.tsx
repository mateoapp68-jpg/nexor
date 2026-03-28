'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Check, X, Zap, Sparkles, Crown, Layers,
  MessageCircle, Megaphone, Radio,
  Users, CheckCircle2, Clock, Timer,
  RefreshCw, ArrowLeft,
} from 'lucide-react'

// ─── Defaults (admin los puede cambiar desde /admin/settings) ─────────────────
const PRICE_DEFAULTS: Record<string, number> = {
  PRICE_BASIC: 49,
  PRICE_PRO: 99,
  PRICE_ELITE: 199,
  PRICE_RENEWAL: 19,
}

const PLAN_RANK: Record<string, number> = { NONE: 0, BASIC: 1, PRO: 2, ELITE: 3 }

// ─── Definición de planes ─────────────────────────────────────────────────────
const PACKS = [
  {
    id: 'basic',
    planId: 'BASIC',
    priceKey: 'PRICE_BASIC',
    name: 'Pack Básico',
    tagline: 'Empieza a vender con un agente AI',
    icon: Zap,
    featured: false,
    sections: [
      {
        icon: MessageCircle,
        title: 'Agentes AI · WhatsApp',
        features: [
          '1 agente AI con tu marca',
          'Responde y vende en WhatsApp automáticamente',
          'Mensajes ilimitados con tus clientes',
          'Catálogo con hasta 2 productos',
        ],
      },
      {
        icon: Radio,
        title: 'Social Publisher',
        features: [
          'Hasta 15 publicaciones por mes',
          'Hasta 5 posts programados simultáneos',
          'Facebook e Instagram',
        ],
      },
      {
        icon: Megaphone,
        title: 'Ads Manager · Meta',
        features: [
          'Hasta 5 campañas por mes',
          'Copies e imágenes generados por IA',
        ],
      },
    ],
    notIncluded: ['Soporte prioritario', 'Acceso a nuevos lanzamientos'],
  },
  {
    id: 'pro',
    planId: 'PRO',
    priceKey: 'PRICE_PRO',
    name: 'Pack Pro',
    tagline: 'Escala tus ventas y anuncios sin límites',
    icon: Sparkles,
    featured: true,
    sections: [
      {
        icon: MessageCircle,
        title: 'Agentes AI · WhatsApp',
        features: [
          '2 agentes AI con tu marca',
          'Responde y vende en WhatsApp automáticamente',
          'Mensajes ilimitados con tus clientes',
          'Catálogo con hasta 20 productos',
        ],
      },
      {
        icon: Radio,
        title: 'Social Publisher',
        features: [
          'Hasta 30 publicaciones por mes',
          'Hasta 10 posts programados simultáneos',
          'Facebook e Instagram',
        ],
      },
      {
        icon: Megaphone,
        title: 'Ads Manager · Meta',
        features: [
          'Hasta 15 campañas por mes',
          'Copies e imágenes generados por IA',
          'Estrategias Advantage+ y Smart Segmentation',
        ],
      },
    ],
    notIncluded: ['Acceso a nuevos lanzamientos'],
  },
  {
    id: 'elite',
    planId: 'ELITE',
    priceKey: 'PRICE_ELITE',
    name: 'Pack Elite',
    tagline: 'El máximo poder para líderes de negocio',
    icon: Crown,
    featured: false,
    sections: [
      {
        icon: MessageCircle,
        title: 'Agentes AI · WhatsApp',
        features: [
          '5 agentes AI con tu marca',
          'Responde y vende en WhatsApp automáticamente',
          'Catálogo con hasta 40 productos',
        ],
      },
      {
        icon: Radio,
        title: 'Social Publisher',
        features: [
          'Hasta 50 publicaciones por mes',
          'Hasta 20 posts programados simultáneos',
          'Facebook e Instagram',
        ],
      },
      {
        icon: Megaphone,
        title: 'Ads Manager · Meta',
        features: [
          'Hasta 30 campañas por mes',
          'Copies e imágenes generados por IA',
          'Estrategias Advantage+ y Smart Segmentation',
        ],
      },
      {
        icon: Users,
        title: 'Soporte Premium',
        features: [
          'Acceso exclusivo a nuevos lanzamientos',
          'Asesoramiento personalizado de 1 hora',
          'Manager dedicado 1:1',
          'Onboarding personalizado con el equipo',
        ],
      },
    ],
    notIncluded: [],
  },
]

// ─── Countdown hook ───────────────────────────────────────────────────────────
function useCountdown(expiresAt: string | null) {
  const [remaining, setRemaining] = useState<{
    days: number; hours: number; minutes: number; seconds: number
  } | null>(null)

  useEffect(() => {
    if (!expiresAt) { setRemaining(null); return }
    const target = new Date(expiresAt).getTime()
    const update = () => {
      const diff = target - Date.now()
      if (diff <= 0) { setRemaining({ days: 0, hours: 0, minutes: 0, seconds: 0 }); return }
      setRemaining({
        days: Math.floor(diff / 86400000),
        hours: Math.floor((diff % 86400000) / 3600000),
        minutes: Math.floor((diff % 3600000) / 60000),
        seconds: Math.floor((diff % 60000) / 1000),
      })
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [expiresAt])

  return remaining
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function PlanesPage() {
  const router = useRouter()
  const [currentPlan, setCurrentPlan] = useState('NONE')
  const [planExpiresAt, setPlanExpiresAt] = useState<string | null>(null)
  const [pendingPlan, setPendingPlan] = useState<string | null>(null)
  const [prices, setPrices] = useState<Record<string, number>>(PRICE_DEFAULTS)
  const countdown = useCountdown(planExpiresAt)

  useEffect(() => {
    // Plan del usuario
    fetch('/api/plan-status')
      .then(r => r.json())
      .then(d => {
        if (d.plan) setCurrentPlan(d.plan)
        if (d.planExpiresAt) setPlanExpiresAt(d.planExpiresAt)
      })
      .catch(() => {})

    // Solicitudes pendientes
    fetch('/api/pack-requests')
      .then(r => r.json())
      .then(d => {
        const pending = (d.requests ?? []).find(
          (r: { status: string }) => r.status === 'PENDING'
        )
        if (pending) setPendingPlan(pending.plan)
      })
      .catch(() => {})

    // Precios definidos por el admin
    fetch('/api/settings')
      .then(r => r.json())
      .then(d => {
        const map = d.settings ?? {}
        setPrices({
          PRICE_BASIC:   parseFloat(map.PRICE_BASIC)   || PRICE_DEFAULTS.PRICE_BASIC,
          PRICE_PRO:     parseFloat(map.PRICE_PRO)     || PRICE_DEFAULTS.PRICE_PRO,
          PRICE_ELITE:   parseFloat(map.PRICE_ELITE)   || PRICE_DEFAULTS.PRICE_ELITE,
          PRICE_RENEWAL: parseFloat(map.PRICE_RENEWAL) || PRICE_DEFAULTS.PRICE_RENEWAL,
        })
      })
      .catch(() => {})
  }, [])

  const planLabel: Record<string, string> = {
    BASIC: 'Pack Básico', PRO: 'Pack Pro', ELITE: 'Pack Elite',
  }

  return (
    <div
      className="min-h-screen px-4 py-8 md:px-8"
      style={{ background: '#0B0B12' }}
    >
      <div className="max-w-5xl mx-auto pb-20">

        {/* Back */}
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-xs text-white/30 hover:text-white/60 transition-colors mb-8"
        >
          <ArrowLeft size={13} /> Volver al Dashboard
        </Link>

        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] font-bold uppercase tracking-widest mb-4"
            style={{ background: 'rgba(255,215,0,0.05)', borderColor: 'rgba(255,215,0,0.15)', color: 'rgba(255,215,0,0.5)' }}>
            <Layers size={9} /> Nexor · Planes oficiales
          </div>
          <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tighter text-white mb-3">
            Elige tu Plan
          </h1>
          <p className="text-sm text-white/30 max-w-md mx-auto leading-relaxed">
            Agentes AI de WhatsApp, Publisher de redes sociales y Ads Manager con IA — todo en una plataforma.
          </p>

          {currentPlan !== 'NONE' && (
            <div className="inline-flex items-center gap-2 mt-5 px-4 py-2 rounded-full border text-xs font-bold"
              style={{ background: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.2)', color: '#4ade80' }}>
              <CheckCircle2 size={12} />
              Plan activo: {planLabel[currentPlan] ?? currentPlan}
            </div>
          )}
        </div>

        {/* Countdown */}
        {currentPlan !== 'NONE' && countdown && (
          <div className="mb-8 rounded-2xl p-4 flex items-center gap-4"
            style={{ background: 'rgba(255,215,0,0.04)', border: '1px solid rgba(255,215,0,0.12)' }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'rgba(255,215,0,0.08)', border: '1px solid rgba(255,215,0,0.2)' }}>
              <Timer size={17} style={{ color: '#FFD700' }} />
            </div>
            <div className="flex-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-2">Tu plan vence en</p>
              <div className="flex items-center gap-4">
                {[
                  { v: countdown.days, l: 'días' },
                  { v: countdown.hours, l: 'horas' },
                  { v: countdown.minutes, l: 'min' },
                  { v: countdown.seconds, l: 'seg' },
                ].map(({ v, l }) => (
                  <div key={l} className="text-center">
                    <p className="text-2xl font-black tabular-nums leading-none" style={{ color: '#FFD700' }}>
                      {String(v).padStart(2, '0')}
                    </p>
                    <p className="text-[9px] text-white/25 uppercase tracking-widest mt-0.5">{l}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Plan cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-start">
          {PACKS.map((pack) => {
            const Icon = pack.icon
            const price = prices[pack.priceKey]
            const renewal = prices.PRICE_RENEWAL
            const isActive = currentPlan === pack.planId
            const isLower = PLAN_RANK[currentPlan] > PLAN_RANK[pack.planId]
            const isPending = pendingPlan === pack.planId

            return (
              <div
                key={pack.id}
                className={`relative flex flex-col rounded-3xl transition-all duration-300 ${pack.featured ? 'md:-mt-3' : ''}`}
                style={{
                  background: pack.featured
                    ? 'linear-gradient(160deg, rgba(255,215,0,0.07) 0%, rgba(11,11,18,0.95) 60%)'
                    : 'rgba(255,255,255,0.02)',
                  border: pack.featured
                    ? '1px solid rgba(255,215,0,0.35)'
                    : '1px solid rgba(255,255,255,0.06)',
                  boxShadow: pack.featured
                    ? '0 0 60px rgba(255,215,0,0.1)'
                    : 'none',
                }}
              >
                {/* Top accent line */}
                {pack.featured && (
                  <div className="absolute top-0 left-0 right-0 h-px rounded-t-3xl"
                    style={{ background: 'linear-gradient(90deg, transparent, #FFD700, transparent)' }} />
                )}

                {/* Badge "Más Popular" */}
                {pack.featured && (
                  <div className="absolute -top-3.5 inset-x-0 flex justify-center">
                    <span className="px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest text-black"
                      style={{ background: 'linear-gradient(135deg, #D97706, #FFD700)' }}>
                      ⭐ Más Popular
                    </span>
                  </div>
                )}

                <div className={`p-5 flex flex-col flex-1 ${pack.featured ? 'pt-8' : ''}`}>

                  {/* Icon + name */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
                      style={{ background: 'rgba(255,215,0,0.08)', border: '1px solid rgba(255,215,0,0.2)' }}>
                      <Icon size={18} style={{ color: '#FFD700' }} />
                    </div>
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-widest" style={{ color: '#FFD700' }}>
                        {pack.name}
                      </p>
                      <p className="text-[10px] text-white/35 leading-snug">{pack.tagline}</p>
                    </div>
                  </div>

                  {/* Price */}
                  <div className="mb-5">
                    <div className="flex items-end gap-1.5">
                      <span className="text-[42px] font-black leading-none text-white">
                        ${price}
                      </span>
                      <span className="text-sm text-white/30 mb-1.5">USD</span>
                    </div>
                    <p className="text-[10px] text-white/20 mt-0.5">30 días de acceso · renovable</p>
                  </div>

                  {/* Divider */}
                  <div className="h-px mb-5"
                    style={{ background: pack.featured ? 'rgba(255,215,0,0.12)' : 'rgba(255,255,255,0.05)' }} />

                  {/* Features */}
                  <div className="flex-1 space-y-4 mb-6">
                    {pack.sections.map((section, si) => {
                      const SIcon = section.icon
                      return (
                        <div key={si}>
                          <div className="flex items-center gap-1.5 mb-2">
                            <SIcon size={10} style={{ color: '#FBBF24' }} />
                            <p className="text-[10px] font-black uppercase tracking-widest"
                              style={{ color: '#FBBF24' }}>
                              {section.title}
                            </p>
                          </div>
                          <ul className="space-y-1.5">
                            {section.features.map((feat, fi) => (
                              <li key={fi} className="flex items-start gap-2">
                                <div className="w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                                  style={{ background: 'rgba(255,215,0,0.1)' }}>
                                  <Check size={8} style={{ color: '#FFD700' }} />
                                </div>
                                <span className="text-[11px] leading-snug text-white/55">{feat}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )
                    })}

                    {pack.notIncluded.length > 0 && (
                      <div>
                        <div className="flex items-center gap-1.5 mb-2">
                          <X size={10} className="text-white/15" />
                          <p className="text-[10px] font-black uppercase tracking-widest text-white/15">
                            No incluido
                          </p>
                        </div>
                        <ul className="space-y-1.5">
                          {pack.notIncluded.map((feat, fi) => (
                            <li key={fi} className="flex items-start gap-2">
                              <div className="w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 mt-0.5 bg-white/3">
                                <X size={7} className="text-white/15" />
                              </div>
                              <span className="text-[11px] leading-snug text-white/20 line-through">{feat}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* CTA */}
                  {isActive ? (
                    <button
                      onClick={() => router.push(`/dashboard/planes/checkout?plan=${pack.planId}&renewal=true`)}
                      disabled={!!pendingPlan}
                      className="w-full py-3 rounded-2xl text-sm font-black flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                      style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', color: '#4ade80' }}
                    >
                      <RefreshCw size={13} /> Renovar — ${renewal}
                    </button>
                  ) : isLower ? (
                    <button disabled
                      className="w-full py-3 rounded-2xl text-sm font-black text-white/20 transition-all"
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      Plan inferior
                    </button>
                  ) : isPending ? (
                    <button disabled
                      className="w-full py-3 rounded-2xl text-sm font-black flex items-center justify-center gap-2"
                      style={{ background: 'rgba(251,146,60,0.1)', border: '1px solid rgba(251,146,60,0.25)', color: '#fb923c' }}>
                      <Clock size={13} /> Solicitud pendiente
                    </button>
                  ) : (
                    <button
                      onClick={() => router.push(`/dashboard/planes/checkout?plan=${pack.planId}`)}
                      disabled={!!pendingPlan}
                      className="w-full py-3 rounded-2xl text-sm font-black flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
                      style={pack.featured ? {
                        background: 'linear-gradient(135deg, #B45309, #D97706, #FFD700)',
                        color: '#000',
                        boxShadow: '0 4px 24px rgba(255,215,0,0.35)',
                      } : {
                        background: 'rgba(255,215,0,0.1)',
                        border: '1px solid rgba(255,215,0,0.25)',
                        color: '#FFD700',
                      }}
                    >
                      {currentPlan !== 'NONE' ? 'Actualizar a este plan' : `Adquirir ${pack.name}`}
                      <ChevronRight size={14} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Empresarial */}
        <div className="mt-6 rounded-3xl overflow-hidden"
          style={{ background: 'rgba(255,215,0,0.03)', border: '1px solid rgba(255,215,0,0.12)' }}>
          <div className="h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,215,0,0.4), transparent)' }} />
          <div className="p-6 flex flex-col md:flex-row items-start md:items-center gap-6">
            <div className="flex items-center gap-4 flex-1">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                style={{ background: 'rgba(255,215,0,0.08)', border: '1px solid rgba(255,215,0,0.2)' }}>
                <Users size={20} style={{ color: '#FFD700' }} />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-black uppercase tracking-widest" style={{ color: '#FFD700' }}>
                    Pack Empresarial
                  </p>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest"
                    style={{ background: 'rgba(255,215,0,0.08)', border: '1px solid rgba(255,215,0,0.2)', color: '#FFD700' }}>
                    A medida
                  </span>
                </div>
                <p className="text-xs text-white/35 leading-relaxed max-w-lg">
                  Solución personalizada para empresas y líderes de alto rendimiento. Agentes AI ilimitados, tiendas, landings y soporte dedicado adaptados a tu volumen de negocio.
                </p>
              </div>
            </div>
            <a
              href="https://wa.me/72794224"
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 flex items-center gap-2 px-6 py-3 rounded-2xl font-black text-sm transition-all active:scale-[0.98] text-black"
              style={{ background: 'linear-gradient(135deg, #D97706, #FFD700)' }}
            >
              <Phone size={14} />
              Contactar por WhatsApp
            </a>
          </div>
        </div>

        {/* Footer note */}
        <div className="mt-5 p-4 rounded-2xl flex items-center gap-3"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(255,215,0,0.06)', border: '1px solid rgba(255,215,0,0.12)' }}>
            <Layers size={13} style={{ color: '#FFD700' }} />
          </div>
          <div>
            <p className="text-xs font-bold text-white/40">Proceso manual · 30 días de acceso</p>
            <p className="text-[11px] text-white/20">
              Envía tu solicitud. Nuestro equipo la revisará y activará tu plan en menos de 24h.
            </p>
          </div>
        </div>

      </div>
    </div>
  )
}
