'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
    ArrowLeft, Play, Pause, Users, CheckCircle2, XCircle,
    Clock, Loader2, AlertCircle, MessageSquare, RefreshCw,
    Image as ImageIcon, Calendar, Bot, Trash2
} from 'lucide-react'

const STATUS_COLORS: Record<string, string> = {
    DRAFT: 'text-white/40',
    SCHEDULED: 'text-amber-400',
    RUNNING: 'text-green-400',
    COMPLETED: 'text-blue-400',
    PAUSED: 'text-orange-400',
    FAILED: 'text-red-400',
}
const STATUS_LABELS: Record<string, string> = {
    DRAFT: 'Borrador',
    SCHEDULED: 'Programado',
    RUNNING: 'Enviando...',
    COMPLETED: 'Completado',
    PAUSED: 'Pausado',
    FAILED: 'Fallido',
}

export default function CrmCampaignDetailPage() {
    const { id } = useParams() as { id: string }
    const router = useRouter()
    const [campaign, setCampaign] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [actionLoading, setActionLoading] = useState(false)

    useEffect(() => { fetchCampaign() }, [id])

    useEffect(() => {
        if (campaign?.status !== 'RUNNING') return
        const interval = setInterval(fetchCampaign, 4000)
        return () => clearInterval(interval)
    }, [campaign?.status])

    async function fetchCampaign() {
        try {
            const res = await fetch(`/api/crm/campaigns/${id}`)
            const data = await res.json()
            if (!res.ok) { router.push('/dashboard/crm'); return }
            setCampaign(data.campaign)
        } catch { setError('Error al cargar') }
        finally { setLoading(false) }
    }

    async function execute() {
        setActionLoading(true)
        setError(null)
        try {
            const res = await fetch(`/api/crm/campaigns/${id}/execute`, { method: 'POST' })
            const data = await res.json()
            if (!res.ok) { setError(data.error); return }
            fetchCampaign()
        } finally { setActionLoading(false) }
    }

    async function pause() {
        setActionLoading(true)
        try {
            await fetch(`/api/crm/campaigns/${id}/pause`, { method: 'POST' })
            fetchCampaign()
        } finally { setActionLoading(false) }
    }

    if (loading) return (
        <div className="flex items-center justify-center min-h-[60vh]">
            <Loader2 className="animate-spin text-amber-400" size={32} />
        </div>
    )
    if (!campaign) return null

    const total = campaign.totalContacts || campaign.contacts?.length || 0
    const progress = total > 0 ? Math.round((campaign.sentCount / total) * 100) : 0
    const pending = campaign.contacts?.filter((c: any) => c.status === 'PENDING').length ?? 0
    const sent = campaign.contacts?.filter((c: any) => c.status === 'SENT').length ?? campaign.sentCount
    const failed = campaign.contacts?.filter((c: any) => c.status === 'FAILED').length ?? campaign.failedCount

    return (
        <div className="px-4 md:px-6 pt-6 max-w-screen-xl mx-auto pb-24 text-white">
            {/* Header */}
            <div className="flex items-center gap-4 mb-6">
                <Link href="/dashboard/crm" className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all">
                    <ArrowLeft size={16} />
                </Link>
                <div className="flex-1 min-w-0">
                    <h1 className="text-xl font-black uppercase tracking-tighter truncate">{campaign.name}</h1>
                    <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-xs font-bold ${STATUS_COLORS[campaign.status]}`}>
                            {campaign.status === 'RUNNING' && <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse mr-1.5" />}
                            {STATUS_LABELS[campaign.status]}
                        </span>
                        <span className="text-xs text-white/20">· {campaign.bot?.name}</span>
                    </div>
                </div>
                <button onClick={fetchCampaign} className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all">
                    <RefreshCw size={14} />
                </button>
            </div>

            {error && (
                <div className="mb-5 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex gap-3 text-red-400 text-sm">
                    <AlertCircle size={16} className="shrink-0" />
                    <p>{error}</p>
                    <button onClick={() => setError(null)} className="ml-auto font-bold">✕</button>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left col */}
                <div className="lg:col-span-2 space-y-5">

                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-3">
                        {[
                            { label: 'Total', value: total, color: 'text-white', icon: <Users size={14} /> },
                            { label: 'Enviados', value: sent, color: 'text-green-400', icon: <CheckCircle2 size={14} /> },
                            { label: 'Fallidos', value: failed, color: 'text-red-400', icon: <XCircle size={14} /> },
                        ].map(s => (
                            <div key={s.label} className="bg-white/[0.03] border border-white/8 rounded-2xl p-4 text-center">
                                <div className={`flex items-center justify-center gap-1.5 mb-1 ${s.color}`}>{s.icon}</div>
                                <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
                                <p className="text-[10px] text-white/30 uppercase">{s.label}</p>
                            </div>
                        ))}
                    </div>

                    {/* Progress */}
                    {total > 0 && (
                        <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-5">
                            <div className="flex justify-between text-xs text-white/40 mb-2 font-bold">
                                <span>Progreso del envío</span>
                                <span>{progress}%</span>
                            </div>
                            <div className="h-3 bg-white/10 rounded-full overflow-hidden">
                                <div
                                    className="h-full rounded-full transition-all duration-500"
                                    style={{
                                        width: `${progress}%`,
                                        background: 'linear-gradient(90deg, #B45309, #FFD700)',
                                    }}
                                />
                            </div>
                            <div className="flex justify-between text-[10px] text-white/25 mt-1.5">
                                <span>{sent} enviados</span>
                                <span>{pending} pendientes</span>
                            </div>
                        </div>
                    )}

                    {/* Prompt */}
                    <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-5">
                        <p className="text-xs font-black uppercase tracking-widest text-white/30 mb-2">Prompt de la IA</p>
                        <p className="text-sm text-white/70 leading-relaxed">{campaign.prompt}</p>
                    </div>

                    {/* Contacts list */}
                    <div className="bg-white/[0.03] border border-white/8 rounded-2xl overflow-hidden">
                        <div className="p-4 border-b border-white/5 flex items-center justify-between">
                            <p className="text-xs font-black uppercase tracking-widest text-white/30">Contactos</p>
                            <span className="text-xs text-white/30">{total} total</span>
                        </div>
                        <div className="max-h-80 overflow-y-auto">
                            {campaign.contacts?.length === 0 ? (
                                <p className="text-center text-white/30 text-sm py-8">Sin contactos cargados</p>
                            ) : (
                                campaign.contacts?.map((c: any) => (
                                    <div key={c.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-white/5 last:border-0">
                                        <div className={`w-2 h-2 rounded-full shrink-0 ${c.status === 'SENT' ? 'bg-green-400' : c.status === 'FAILED' ? 'bg-red-400' : 'bg-white/20'}`} />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm text-white/80 truncate">{c.name || c.phone}</p>
                                            {c.name && <p className="text-[10px] text-white/30">{c.phone}</p>}
                                        </div>
                                        {c.status === 'FAILED' && c.error && (
                                            <p className="text-[10px] text-red-400 truncate max-w-[120px]">{c.error}</p>
                                        )}
                                        {c.sentAt && (
                                            <p className="text-[10px] text-white/20 shrink-0">
                                                {new Date(c.sentAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* Right col */}
                <div className="space-y-5">

                    {/* Actions */}
                    <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-5 space-y-3">
                        <p className="text-xs font-black uppercase tracking-widest text-white/30">Acciones</p>

                        {campaign.status === 'RUNNING' ? (
                            <button
                                onClick={pause}
                                disabled={actionLoading}
                                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 font-black text-sm transition-all disabled:opacity-50"
                            >
                                {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <Pause size={14} />}
                                Pausar envío
                            </button>
                        ) : ['DRAFT', 'SCHEDULED', 'PAUSED'].includes(campaign.status) ? (
                            <button
                                onClick={execute}
                                disabled={actionLoading}
                                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white font-black text-sm transition-all disabled:opacity-50"
                                style={{ background: 'linear-gradient(135deg, #15803d, #22c55e)' }}
                            >
                                {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                                {campaign.status === 'PAUSED' ? 'Reanudar envío' : 'Iniciar envío ahora'}
                            </button>
                        ) : null}
                    </div>

                    {/* Config */}
                    <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-5 space-y-3">
                        <p className="text-xs font-black uppercase tracking-widest text-white/30">Configuración</p>
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-white/40 flex items-center gap-1.5"><Clock size={12} /> Delay</span>
                                <span className="font-bold">{campaign.delayValue} {campaign.delayUnit === 'minutes' ? 'min' : 'seg'}</span>
                            </div>
                            {campaign.scheduledAt && (
                                <div className="flex justify-between">
                                    <span className="text-white/40 flex items-center gap-1.5"><Calendar size={12} /> Programado</span>
                                    <span className="font-bold text-amber-400 text-xs">
                                        {new Date(campaign.scheduledAt).toLocaleString('es', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                            )}
                            <div className="flex justify-between">
                                <span className="text-white/40 flex items-center gap-1.5"><Bot size={12} /> Bot</span>
                                <span className="font-bold text-xs truncate max-w-[120px]">{campaign.bot?.name}</span>
                            </div>
                        </div>
                    </div>

                    {/* Images */}
                    <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-5">
                        <p className="text-xs font-black uppercase tracking-widest text-white/30 mb-3 flex items-center gap-2">
                            <ImageIcon size={12} /> Imágenes rotativas ({campaign.images?.length}/5)
                        </p>
                        {campaign.images?.length === 0 ? (
                            <p className="text-xs text-white/30">Sin imágenes</p>
                        ) : (
                            <div className="grid grid-cols-3 gap-2">
                                {campaign.images?.map((img: any, i: number) => (
                                    <div key={img.id} className="relative aspect-square rounded-xl overflow-hidden border border-white/10">
                                        <img src={img.url} alt="" className="w-full h-full object-cover" />
                                        <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[9px] font-black px-1.5 py-0.5 rounded">
                                            {i + 1}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Logs recientes */}
                    {campaign.logs?.length > 0 && (
                        <div className="bg-white/[0.03] border border-white/8 rounded-2xl overflow-hidden">
                            <div className="p-4 border-b border-white/5">
                                <p className="text-xs font-black uppercase tracking-widest text-white/30">Últimos mensajes enviados</p>
                            </div>
                            <div className="max-h-64 overflow-y-auto">
                                {campaign.logs.slice(0, 20).map((log: any) => (
                                    <div key={log.id} className="px-4 py-3 border-b border-white/5 last:border-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <div className={`w-1.5 h-1.5 rounded-full ${log.status === 'SENT' ? 'bg-green-400' : 'bg-red-400'}`} />
                                            <p className="text-xs font-bold text-white/60">{log.name || log.phone}</p>
                                            <p className="text-[10px] text-white/20 ml-auto">
                                                {new Date(log.sentAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                        </div>
                                        {log.message && <p className="text-[11px] text-white/40 line-clamp-2 leading-relaxed ml-3.5">{log.message}</p>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
