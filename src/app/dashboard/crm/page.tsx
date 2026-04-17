'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
    Plus, Play, Pause, Trash2, Eye,
    Loader2, MessageSquare, AlertCircle,
    Download, Wifi, RotateCcw, Smartphone
} from 'lucide-react'

const STATUS_COLORS: Record<string, string> = {
    DRAFT: 'text-white/40 bg-white/5',
    SCHEDULED: 'text-amber-400 bg-amber-400/10',
    RUNNING: 'text-green-400 bg-green-400/10',
    COMPLETED: 'text-blue-400 bg-blue-400/10',
    PAUSED: 'text-orange-400 bg-orange-400/10',
    FAILED: 'text-red-400 bg-red-400/10',
}
const STATUS_LABELS: Record<string, string> = {
    DRAFT: 'Borrador',
    SCHEDULED: 'Programado',
    RUNNING: 'Enviando...',
    COMPLETED: 'Completado',
    PAUSED: 'Pausado',
    FAILED: 'Fallido',
}

export default function CrmPage() {
    const router = useRouter()
    const [campaigns, setCampaigns] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [deleting, setDeleting] = useState<string | null>(null)
    const [reenvying, setReenvying] = useState<string | null>(null)

    useEffect(() => { fetchCampaigns() }, [])

    // Auto-refresh every 5s if any campaign is running
    useEffect(() => {
        const hasRunning = campaigns.some(c => c.status === 'RUNNING')
        if (!hasRunning) return
        const interval = setInterval(fetchCampaigns, 5000)
        return () => clearInterval(interval)
    }, [campaigns])

    async function fetchCampaigns() {
        try {
            const res = await fetch('/api/crm/campaigns')
            const data = await res.json()
            setCampaigns(data.campaigns || [])
        } catch { setError('Error al cargar campañas') }
        finally { setLoading(false) }
    }

    async function deleteCampaign(id: string) {
        if (!confirm('¿Eliminar esta campaña? Se borrarán todos los contactos y logs.')) return
        setDeleting(id)
        try {
            await fetch(`/api/crm/campaigns/${id}`, { method: 'DELETE' })
            setCampaigns(prev => prev.filter(c => c.id !== id))
        } catch { setError('Error al eliminar') }
        finally { setDeleting(null) }
    }

    async function pauseCampaign(id: string) {
        await fetch(`/api/crm/campaigns/${id}/pause`, { method: 'POST' })
        fetchCampaigns()
    }

    async function executeCampaign(id: string) {
        const res = await fetch(`/api/crm/campaigns/${id}/execute`, { method: 'POST' })
        const data = await res.json()
        if (!res.ok) { setError(data.error); return }
        fetchCampaigns()
    }

    async function reenviarCampaign(id: string) {
        setReenvying(id)
        try {
            const res = await fetch(`/api/crm/campaigns/${id}/duplicate`, { method: 'POST' })
            const data = await res.json()
            if (!res.ok) { setError(data.error || 'Error al reenviar'); return }
            router.push(`/dashboard/crm/${data.campaign.id}`)
        } catch { setError('Error al reenviar campaña') }
        finally { setReenvying(null) }
    }

    if (loading) return (
        <div className="flex items-center justify-center min-h-[60vh]">
            <Loader2 className="animate-spin text-amber-400" size={32} />
        </div>
    )

    return (
        <div className="px-4 md:px-6 pt-6 max-w-screen-xl mx-auto pb-24 text-white">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-black uppercase tracking-tighter">CRM Broadcast</h1>
                    <p className="text-white/40 text-sm mt-0.5">Envíos masivos por WhatsApp con IA</p>
                </div>
                <div className="flex items-center gap-2">
                    <Link
                        href="/dashboard/crm/export"
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border border-white/10 bg-white/5 text-white/60 hover:text-amber-400 hover:border-amber-500/40 transition-all"
                    >
                        <Download size={15} /> Exportar
                    </Link>
                    <Link
                        href="/dashboard/crm/new"
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black uppercase tracking-wide text-white transition-all hover:opacity-90"
                        style={{ background: 'linear-gradient(135deg, #B45309, #D97706, #FFD700)' }}
                    >
                        <Plus size={15} /> Nueva campaña
                    </Link>
                </div>
            </div>

            {error && (
                <div className="mb-5 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex gap-3 text-red-400 text-sm">
                    <AlertCircle size={16} className="shrink-0" />
                    <p>{error}</p>
                    <button onClick={() => setError(null)} className="ml-auto font-bold">✕</button>
                </div>
            )}

            {campaigns.length === 0 ? (
                <div className="text-center py-24">
                    <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
                        <MessageSquare size={28} className="text-amber-400" />
                    </div>
                    <p className="text-white/40 text-sm mb-2">No tenés campañas todavía</p>
                    <Link href="/dashboard/crm/new" className="text-amber-400 font-bold text-sm hover:underline">
                        Crear primera campaña →
                    </Link>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {campaigns.map(c => (
                        <div key={c.id} className="bg-white/[0.03] border border-white/8 rounded-2xl p-5 flex flex-col gap-4">
                            {/* Top */}
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                    <p className="font-black text-white truncate">{c.name}</p>
                                    {c.bot?.type === 'WHATSAPP_CLOUD' ? (
                                        <p className="flex items-center gap-1 text-[11px] text-green-400 mt-0.5 font-bold">
                                            <Wifi size={10} /> Cloud API · {c.bot.name}
                                        </p>
                                    ) : c.bot?.baileysPhone ? (
                                        <p className="flex items-center gap-1 text-[11px] text-green-400 mt-0.5 font-bold">
                                            <Smartphone size={10} /> QR · +{c.bot.baileysPhone}
                                        </p>
                                    ) : (
                                        <p className="text-xs text-white/25 mt-0.5">Sin WhatsApp conectado</p>
                                    )}
                                </div>
                                <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-lg shrink-0 ${STATUS_COLORS[c.status]}`}>
                                    {STATUS_LABELS[c.status]}
                                </span>
                            </div>

                            {/* Stats */}
                            <div className="grid grid-cols-3 gap-2">
                                <div className="bg-white/5 rounded-xl p-2.5 text-center">
                                    <p className="text-lg font-black text-white">{c._count?.contacts ?? c.totalContacts ?? 0}</p>
                                    <p className="text-[10px] text-white/30 uppercase">Contactos</p>
                                </div>
                                <div className="bg-white/5 rounded-xl p-2.5 text-center">
                                    <p className="text-lg font-black text-green-400">{c.sentCount}</p>
                                    <p className="text-[10px] text-white/30 uppercase">Enviados</p>
                                </div>
                                <div className="bg-white/5 rounded-xl p-2.5 text-center">
                                    <p className="text-lg font-black text-red-400">{c.failedCount}</p>
                                    <p className="text-[10px] text-white/30 uppercase">Fallidos</p>
                                </div>
                            </div>

                            {/* Progress bar */}
                            {c.totalContacts > 0 && (
                                <div>
                                    <div className="flex justify-between text-[10px] text-white/30 mb-1">
                                        <span>Progreso</span>
                                        <span>{Math.round((c.sentCount / c.totalContacts) * 100)}%</span>
                                    </div>
                                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-gradient-to-r from-amber-600 to-amber-400 rounded-full transition-all"
                                            style={{ width: `${Math.min(100, (c.sentCount / c.totalContacts) * 100)}%` }}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Images preview */}
                            {c.images?.length > 0 && (
                                <div className="flex gap-1.5">
                                    {c.images.slice(0, 5).map((img: any, i: number) => (
                                        <div key={i} className="w-9 h-9 rounded-lg overflow-hidden border border-white/10 shrink-0">
                                            <img src={img.url} alt="" className="w-full h-full object-cover" />
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Actions */}
                            <div className="flex gap-2 mt-auto">
                                <Link
                                    href={`/dashboard/crm/${c.id}`}
                                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold transition-all"
                                >
                                    <Eye size={12} /> Ver
                                </Link>

                                {c.status === 'RUNNING' ? (
                                    <button
                                        onClick={() => pauseCampaign(c.id)}
                                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 text-xs font-bold transition-all"
                                    >
                                        <Pause size={12} /> Pausar
                                    </button>
                                ) : c.status === 'COMPLETED' ? (
                                    <button
                                        onClick={() => reenviarCampaign(c.id)}
                                        disabled={reenvying === c.id}
                                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-xs font-bold transition-all disabled:opacity-50"
                                    >
                                        {reenvying === c.id ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                                        Reenviar
                                    </button>
                                ) : ['DRAFT', 'SCHEDULED', 'PAUSED', 'FAILED'].includes(c.status) ? (
                                    <button
                                        onClick={() => executeCampaign(c.id)}
                                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all ${c.status === 'FAILED' ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400' : 'bg-green-500/10 hover:bg-green-500/20 text-green-400'}`}
                                    >
                                        <Play size={12} /> {c.status === 'PAUSED' ? 'Reanudar' : c.status === 'FAILED' ? 'Reintentar' : 'Enviar'}
                                    </button>
                                ) : null}

                                {c.status !== 'RUNNING' && (
                                    <button
                                        onClick={() => deleteCampaign(c.id)}
                                        disabled={deleting === c.id}
                                        className="w-9 flex items-center justify-center rounded-xl bg-white/5 hover:bg-red-500/10 text-white/30 hover:text-red-400 transition-all"
                                    >
                                        {deleting === c.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
