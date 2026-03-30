'use client'

import { useState, useEffect } from 'react'
import {
    ArrowLeft, Loader2, Rocket, AlertCircle, CheckCircle2,
    Eye, Edit3, ChevronLeft, ChevronRight, Monitor, Smartphone,
    ExternalLink, RefreshCw
} from 'lucide-react'
import Link from 'next/link'
import { useRouter, useParams } from 'next/navigation'

const STATUS_INFO: Record<string, { label: string; color: string; desc: string }> = {
    DRAFT: { label: 'Borrador', color: 'text-white/50', desc: 'Completa la configuración' },
    READY: { label: 'Listo para publicar', color: 'text-amber-400', desc: 'Todo configurado correctamente' },
    PUBLISHING: { label: 'Publicando...', color: 'text-yellow-400', desc: 'Enviando a Meta Ads Manager' },
    PUBLISHED: { label: 'Publicado', color: 'text-green-400', desc: 'Activo en Meta Ads (estado inicial: pausado)' },
    FAILED: { label: 'Error al publicar', color: 'text-red-400', desc: 'Revisa los detalles del error' },
    PAUSED: { label: 'Pausado', color: 'text-orange-400', desc: 'Campaña pausada' }
}

export default function PreviewPage() {
    const router = useRouter()
    const { campaignId } = useParams() as { campaignId: string }
    const [campaign, setCampaign] = useState<any>(null)
    const [creatives, setCreatives] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [publishing, setPublishing] = useState(false)
    const [activeSlot, setActiveSlot] = useState(0)
    const [editingSlot, setEditingSlot] = useState<number | null>(null)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    useEffect(() => { fetchData() }, [campaignId])

    async function fetchData() {
        setLoading(true)
        try {
            const [campRes, copyRes] = await Promise.all([
                fetch('/api/ads/campaign'),
                fetch(`/api/ads/campaign/${campaignId}/copies`)
            ])
            const [campData, copyData] = await Promise.all([campRes.json(), copyRes.json()])
            const camp = campData.campaigns?.find((c: any) => c.id === campaignId)
            if (!camp) { router.push('/dashboard/services/ads'); return }
            setCampaign(camp)
            const sortedCreatives = (copyData.creatives || []).sort((a: any, b: any) => a.slotIndex - b.slotIndex)
            setCreatives(sortedCreatives)
            if (sortedCreatives.length > 0) setActiveSlot(sortedCreatives[0].slotIndex)
        } catch (e) { console.error(e) }
        finally { setLoading(false) }
    }

    async function saveCreative(i: number) {
        const creative = creatives.find((c: any) => c.slotIndex === i) ?? creatives[i]
        if (!creative?.id) return
        setSaving(true)
        try {
            await fetch(`/api/ads/campaign/${campaignId}/copies`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ creatives: [creative] })
            })
            setEditingSlot(null)
            setSuccess('Anuncio actualizado')
        } catch { setError('Error al guardar') }
        finally { setSaving(false) }
    }

    async function publish() {
        if (!confirm('¿Publicar esta campaña en Meta Ads? Se creará en estado PAUSADO para que puedas activarla desde tu Ads Manager.')) return
        setPublishing(true)
        setError(null)
        try {
            const res = await fetch(`/api/ads/campaign/${campaignId}/publish`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            })
            const data = await res.json()
            if (!res.ok) return setError(data.error || 'Error al publicar')
            setSuccess('¡Campaña publicada exitosamente! Está disponible en tu Ads Manager en estado PAUSADO.')
            fetchData()
        } catch { setError('Error de conexión') }
        finally { setPublishing(false) }
    }

    if (loading) {
        return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="animate-spin text-amber-400" size={32} /></div>
    }

    if (!campaign) return null

    const statusInfo = STATUS_INFO[campaign.status] || STATUS_INFO['DRAFT']
    const currentCreative = creatives.find((c: any) => c.slotIndex === activeSlot) ?? creatives[0]
    const isPublished = campaign.status === 'PUBLISHED'

    return (
        <div className="px-4 md:px-6 pt-6 max-w-screen-xl mx-auto pb-24 text-white">
            {/* Header */}
            <div className="flex items-center gap-4 mb-6">
                <Link href="/dashboard/services/ads" className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all">
                    <ArrowLeft size={16} />
                </Link>
                <div className="flex-1 min-w-0">
                    <h1 className="text-xl font-black uppercase tracking-tighter truncate">{campaign.name}</h1>
                    <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-xs font-bold ${statusInfo.color}`}>{statusInfo.label}</span>
                        <span className="text-xs text-white/20">· {statusInfo.desc}</span>
                    </div>
                </div>
                {!isPublished && (
                    <button
                        onClick={publish}
                        disabled={publishing || campaign.status === 'PUBLISHING'}
                        className="flex items-center gap-2 bg-gradient-to-r from-amber-600 to-amber-600 text-white font-bold px-5 py-2.5 rounded-xl hover:opacity-90 disabled:opacity-50 transition-all text-sm shadow-[0_0_30px_rgba(139,92,246,0.3)]"
                    >
                        {publishing ? <><Loader2 size={15} className="animate-spin" /> Publicando...</> : <><Rocket size={15} /> Publicar Campaña</>}
                    </button>
                )}
            </div>

            {error && (
                <div className="mb-5 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex gap-3 text-red-400 text-sm">
                    <AlertCircle size={16} className="shrink-0" />
                    <p>{error}</p>
                    <button onClick={() => setError(null)} className="ml-auto text-xs font-bold">✕</button>
                </div>
            )}
            {success && (
                <div className="mb-5 p-4 bg-green-500/10 border border-green-500/20 rounded-2xl flex gap-3 text-green-400 text-sm">
                    <CheckCircle2 size={16} className="shrink-0" />
                    <p>{success}</p>
                </div>
            )}

            {isPublished && campaign.providerCampaignId && (
                <div className="mb-6 p-5 bg-green-500/5 border border-green-500/20 rounded-2xl">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-bold text-green-400 mb-1">✓ Campaña publicada exitosamente</p>
                            <p className="text-xs text-white/40">ID de campaña: <span className="font-mono">{campaign.providerCampaignId}</span></p>
                            <p className="text-xs text-white/30 mt-1">Estado inicial: PAUSADO. Actívala desde tu Ads Manager.</p>
                        </div>
                        <a
                            href="https://business.facebook.com/adsmanager"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-xl bg-amber-600 text-white hover:bg-amber-500 transition-all"
                        >
                            Abrir Ads Manager <ExternalLink size={12} />
                        </a>
                    </div>
                </div>
            )}

            {creatives.length === 0 ? (
                <div className="text-center py-20">
                    <p className="text-white/30 text-sm mb-4">No hay anuncios generados todavía</p>
                    <Link
                        href={`/dashboard/services/ads/campaign/${campaign.strategy?.id || campaign.strategyId}`}
                        className="text-amber-400 text-sm font-bold hover:underline"
                    >
                        Volver a generar copies →
                    </Link>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Left: Ad preview mockup */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-xs font-bold text-white/40 uppercase tracking-widest">Vista previa del anuncio</p>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => { const idx = creatives.findIndex((c: any) => c.slotIndex === activeSlot); if (idx > 0) setActiveSlot(creatives[idx - 1].slotIndex) }}
                                    disabled={creatives.findIndex((c: any) => c.slotIndex === activeSlot) === 0}
                                    className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center disabled:opacity-30 hover:bg-white/10"
                                >
                                    <ChevronLeft size={14} />
                                </button>
                                <span className="text-xs text-white/30 px-2">{creatives.findIndex((c: any) => c.slotIndex === activeSlot) + 1}/{creatives.length}</span>
                                <button
                                    onClick={() => { const idx = creatives.findIndex((c: any) => c.slotIndex === activeSlot); if (idx < creatives.length - 1) setActiveSlot(creatives[idx + 1].slotIndex) }}
                                    disabled={creatives.findIndex((c: any) => c.slotIndex === activeSlot) === creatives.length - 1}
                                    className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center disabled:opacity-30 hover:bg-white/10"
                                >
                                    <ChevronRight size={14} />
                                </button>
                            </div>
                        </div>

                        {/* Instagram/Facebook feed mockup */}
                        <div className="bg-[#18191a] rounded-2xl overflow-hidden border border-white/10">
                            {/* Post header */}
                            <div className="flex items-center gap-3 p-3 border-b border-white/5">
                                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-500 to-amber-500 flex items-center justify-center text-xs font-black">
                                    {campaign.brief?.name?.[0] || 'N'}
                                </div>
                                <div className="flex-1">
                                    <p className="text-sm font-bold text-white">{campaign.brief?.name || 'Tu Negocio'}</p>
                                    <p className="text-[10px] text-white/30">Publicidad · Patrocinado</p>
                                </div>
                                <span className="text-white/20">···</span>
                            </div>

                            {/* Primary text preview */}
                            {currentCreative?.primaryText && (
                                <div className="px-3 pt-3 pb-2">
                                    <p className="text-xs text-white/80 leading-relaxed line-clamp-3">
                                        {currentCreative.primaryText}
                                    </p>
                                </div>
                            )}

                            {/* Creative */}
                            <div className="w-full aspect-square bg-gradient-to-br from-dark-900 to-black/50 flex items-center justify-center relative overflow-hidden">
                                {currentCreative?.mediaUrl ? (
                                    currentCreative.mediaType === 'video'
                                        ? <video src={currentCreative.mediaUrl} className="w-full h-full object-cover" controls />
                                        : <img src={currentCreative.mediaUrl} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="text-center">
                                        <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-3">
                                            <Smartphone size={24} className="text-white/20" />
                                        </div>
                                        <p className="text-xs text-white/20">Creativo #{activeSlot + 1}</p>
                                        <p className="text-[10px] text-white/10">Sin imagen/video</p>
                                    </div>
                                )}
                            </div>

                            {/* Headline + CTA */}
                            <div className="p-3 border-t border-white/5">
                                <p className="text-xs font-bold text-white">{currentCreative?.headline || 'Titular del anuncio'}</p>
                                {currentCreative?.description && (
                                    <p className="text-[10px] text-white/40 mt-0.5">{currentCreative.description}</p>
                                )}
                                <div className="mt-2">
                                    <div className="w-full py-2 rounded-lg bg-amber-600 text-center text-xs font-bold text-white">
                                        {campaign.brief?.mainCTA || 'Más información'}
                                    </div>
                                </div>
                            </div>

                            {/* Engagement row */}
                            <div className="px-3 pb-3 flex items-center gap-4 text-[10px] text-white/20">
                                <span>👍 Me gusta</span>
                                <span>💬 Comentar</span>
                                <span>↗ Compartir</span>
                            </div>
                        </div>

                        {/* Slot thumbnails */}
                        <div className="flex gap-2 mt-3 flex-wrap">
                            {creatives.map((c, i) => (
                                <button
                                    key={c.id || i}
                                    onClick={() => setActiveSlot(c.slotIndex)}
                                    className={`w-10 h-10 rounded-xl overflow-hidden border-2 transition-all ${c.slotIndex === activeSlot ? 'border-amber-500' : 'border-white/10 hover:border-white/30'}`}
                                >
                                    {c.mediaUrl
                                        ? <img src={c.mediaUrl} alt="" className="w-full h-full object-cover" />
                                        : <div className="w-full h-full bg-white/5 flex items-center justify-center text-[10px] text-white/30 font-bold">{i + 1}</div>
                                    }
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Right: Copy editor */}
                    <div className="space-y-3">
                        <p className="text-xs font-bold text-white/40 uppercase tracking-widest mb-3">Editar copies ({creatives.length} anuncios)</p>
                        {creatives.map((creative, i) => (
                            <div
                                key={creative.id || i}
                                onClick={() => setActiveSlot(creative.slotIndex)}
                                className={`bg-dark-900/40 border rounded-2xl p-4 cursor-pointer transition-all ${creative.slotIndex === activeSlot ? 'border-amber-500/40 bg-amber-500/5' : 'border-white/5 hover:border-white/15'}`}
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[10px] font-black uppercase text-white/30">Anuncio #{i + 1}</span>
                                    <button
                                        onClick={e => { e.stopPropagation(); setEditingSlot(editingSlot === creative.slotIndex ? null : creative.slotIndex) }}
                                        className="text-[10px] font-bold text-amber-400 hover:underline flex items-center gap-1"
                                    >
                                        <Edit3 size={10} /> Editar
                                    </button>
                                </div>

                                {editingSlot === creative.slotIndex ? (
                                    <div className="space-y-2" onClick={e => e.stopPropagation()}>
                                        <textarea
                                            value={creative.primaryText}
                                            onChange={e => setCreatives(prev => prev.map((c) => c.slotIndex === creative.slotIndex ? { ...c, primaryText: e.target.value } : c))}
                                            rows={4}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white/80 resize-none focus:outline-none focus:border-amber-500/50 leading-relaxed"
                                        />
                                        <div className="grid grid-cols-2 gap-2">
                                            <input
                                                value={creative.headline}
                                                onChange={e => setCreatives(prev => prev.map((c) => c.slotIndex === creative.slotIndex ? { ...c, headline: e.target.value } : c))}
                                                placeholder="Titular"
                                                className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50 placeholder:text-white/20"
                                            />
                                            <input
                                                value={creative.description || ''}
                                                onChange={e => setCreatives(prev => prev.map((c) => c.slotIndex === creative.slotIndex ? { ...c, description: e.target.value } : c))}
                                                placeholder="Descripción"
                                                className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50 placeholder:text-white/20"
                                            />
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={() => setEditingSlot(null)} className="flex-1 py-2 rounded-xl bg-white/5 text-xs font-bold hover:bg-white/10">Cancelar</button>
                                            <button
                                                onClick={() => saveCreative(creative.slotIndex)}
                                                disabled={saving}
                                                className="flex-1 py-2 rounded-xl bg-amber-600 text-white text-xs font-bold hover:bg-amber-500 disabled:opacity-50"
                                            >
                                                {saving ? 'Guardando...' : 'Guardar'}
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div>
                                        <p className="text-xs text-white/60 line-clamp-2 leading-relaxed">{creative.primaryText || '(Sin copy)'}</p>
                                        {creative.headline && <p className="text-[10px] text-white/30 font-bold mt-1 truncate">{creative.headline}</p>}
                                    </div>
                                )}
                            </div>
                        ))}

                        {!isPublished && (
                            <button
                                onClick={publish}
                                disabled={publishing || campaign.status === 'PUBLISHING'}
                                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-amber-600 to-amber-600 text-white font-bold py-4 rounded-2xl hover:opacity-90 disabled:opacity-50 transition-all mt-4 shadow-[0_0_30px_rgba(139,92,246,0.3)]"
                            >
                                {publishing
                                    ? <><Loader2 size={18} className="animate-spin" /> Publicando en Meta Ads...</>
                                    : <><Rocket size={18} /> Lanzar Campaña Ahora</>
                                }
                            </button>
                        )}

                        <p className="text-[11px] text-white/20 text-center">
                            La campaña se publicará en estado <b>PAUSADO</b>. Puedes activarla desde tu Ads Manager cuando estés listo.
                        </p>
                    </div>
                </div>
            )}
        </div>
    )
}
