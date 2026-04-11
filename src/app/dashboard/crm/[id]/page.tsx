'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
    ArrowLeft, Play, Pause, Users, CheckCircle2, XCircle,
    Clock, Loader2, AlertCircle, RefreshCw,
    Image as ImageIcon, Calendar, Smartphone, Wifi, WifiOff, Film
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

    // WhatsApp QR state
    const [waStatus, setWaStatus] = useState<{ status: string; qrBase64?: string; phone?: string }>({ status: 'disconnected' })
    const [waConnecting, setWaConnecting] = useState(false)
    const [availableBots, setAvailableBots] = useState<{ id: string; name: string; baileysPhone: string | null }[]>([])
    const [assigningBot, setAssigningBot] = useState(false)

    useEffect(() => { fetchCampaign(); fetchWaStatus(); fetchAvailableBots() }, [id])

    useEffect(() => {
        if (campaign?.status !== 'RUNNING') return
        const interval = setInterval(fetchCampaign, 4000)
        return () => clearInterval(interval)
    }, [campaign?.status])

    // Polling QR: solo cuando está conectando o esperando escaneo
    useEffect(() => {
        if (waStatus.status === 'connected' || waStatus.status === 'disconnected') return
        const interval = setInterval(fetchWaStatus, 2000)
        return () => clearInterval(interval)
    }, [waStatus.status])

    async function fetchAvailableBots() {
        try {
            const res = await fetch('/api/bots')
            if (res.ok) {
                const data = await res.json()
                const baileysBots = (data.bots ?? []).filter((b: any) => b.type === 'BAILEYS')
                setAvailableBots(baileysBots.map((b: any) => ({ id: b.id, name: b.name, baileysPhone: b.baileysPhone ?? null })))
            }
        } catch {}
    }

    async function assignBot(botId: string) {
        setAssigningBot(true)
        try {
            const res = await fetch(`/api/crm/campaigns/${id}/connect`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ botId }),
            })
            if (res.ok) {
                const data = await res.json()
                setWaStatus({ status: data.status, phone: data.phone, qrBase64: data.qrBase64 })
            }
        } catch {
            setError('Error al asignar bot')
        } finally {
            setAssigningBot(false)
        }
    }

    async function fetchWaStatus() {
        try {
            const res = await fetch(`/api/crm/campaigns/${id}/connect`)
            if (res.ok) {
                const data = await res.json()
                setWaStatus(data)
            }
        } catch {}
    }

    async function connectWhatsApp() {
        setWaConnecting(true)
        setError(null)
        try {
            const res = await fetch(`/api/crm/campaigns/${id}/connect`, { method: 'POST' })
            if (res.ok) {
                setWaStatus({ status: 'connecting' })
                // el polling del useEffect tomará el relevo
            }
        } catch {
            setError('Error al iniciar conexión')
        } finally {
            setWaConnecting(false)
        }
    }

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
                        <span className={`text-xs font-bold ${waStatus.status === 'connected' ? 'text-green-400' : 'text-white/20'}`}>
                            · WA {waStatus.status === 'connected'
                                ? `✓${waStatus.phone ? ` +${waStatus.phone}` : ''}`
                                : waStatus.status === 'connecting' || waStatus.status === 'qr_ready'
                                    ? 'conectando...'
                                    : 'desconectado'}
                        </span>
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

                    {/* WhatsApp QR */}
                    <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-5 space-y-3">
                        <p className="text-xs font-black uppercase tracking-widest text-white/30 flex items-center gap-2">
                            <Smartphone size={12} /> WhatsApp
                        </p>

                        {waStatus.status === 'connected' ? (
                            <div className="flex items-center gap-2 p-3 rounded-xl bg-green-500/10 border border-green-500/20">
                                <Wifi size={14} className="text-green-400 shrink-0" />
                                <div>
                                    <p className="text-xs font-bold text-green-400">Conectado</p>
                                    {waStatus.phone && <p className="text-[11px] text-white/60 mt-0.5">📱 +{waStatus.phone}</p>}
                                </div>
                            </div>
                        ) : waStatus.status === 'qr_ready' && waStatus.qrBase64 ? (
                            <div className="flex flex-col items-center gap-2">
                                <p className="text-[11px] text-white/40 text-center">Escanea con WhatsApp</p>
                                <div className="bg-white p-2 rounded-xl">
                                    <img src={waStatus.qrBase64} alt="QR WhatsApp" className="w-40 h-40" />
                                </div>
                                <p className="text-[10px] text-white/25 text-center">Abre WhatsApp → Dispositivos vinculados → Vincular dispositivo</p>
                            </div>
                        ) : waStatus.status === 'connecting' ? (
                            <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                                <Loader2 size={14} className="text-amber-400 animate-spin shrink-0" />
                                <p className="text-xs text-amber-400">Generando QR...</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="flex items-center gap-2 p-3 rounded-xl bg-white/5 border border-white/10">
                                    <WifiOff size={14} className="text-white/30 shrink-0" />
                                    <p className="text-xs text-white/40">Sin conectar</p>
                                </div>

                                {/* Bots existentes */}
                                {availableBots.length > 0 && (
                                    <div className="space-y-1.5">
                                        <p className="text-[10px] text-white/30 uppercase font-black tracking-widest">Usar bot existente</p>
                                        {availableBots.map(bot => (
                                            <button
                                                key={bot.id}
                                                type="button"
                                                onClick={() => assignBot(bot.id)}
                                                disabled={assigningBot}
                                                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all disabled:opacity-50 text-left"
                                            >
                                                <Smartphone size={12} className={bot.baileysPhone ? 'text-green-400' : 'text-white/30'} />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-bold text-white/80 truncate">{bot.name}</p>
                                                    {bot.baileysPhone
                                                        ? <p className="text-[10px] text-green-400">📱 +{bot.baileysPhone}</p>
                                                        : <p className="text-[10px] text-white/30">Sin conectar</p>
                                                    }
                                                </div>
                                                {assigningBot ? <Loader2 size={11} className="animate-spin text-white/40 shrink-0" /> : <span className="text-[10px] text-white/40 shrink-0">Usar</span>}
                                            </button>
                                        ))}
                                        <div className="flex items-center gap-2 my-1">
                                            <div className="flex-1 h-px bg-white/10" />
                                            <span className="text-[10px] text-white/20 uppercase">o</span>
                                            <div className="flex-1 h-px bg-white/10" />
                                        </div>
                                    </div>
                                )}

                                <button
                                    type="button"
                                    onClick={connectWhatsApp}
                                    disabled={waConnecting}
                                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-white transition-all disabled:opacity-50"
                                    style={{ background: 'linear-gradient(135deg, #065f46, #059669)' }}
                                >
                                    {waConnecting ? <Loader2 size={12} className="animate-spin" /> : <Smartphone size={12} />}
                                    Conectar nuevo QR
                                </button>
                            </div>
                        )}
                    </div>

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
                        ) : ['DRAFT', 'SCHEDULED', 'PAUSED', 'FAILED'].includes(campaign.status) ? (
                            <button
                                onClick={execute}
                                disabled={actionLoading}
                                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white font-black text-sm transition-all disabled:opacity-50"
                                style={{ background: campaign.status === 'FAILED' ? 'linear-gradient(135deg, #7f1d1d, #dc2626)' : 'linear-gradient(135deg, #15803d, #22c55e)' }}
                            >
                                {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                                {campaign.status === 'PAUSED' ? 'Reanudar envío' : campaign.status === 'FAILED' ? 'Reintentar envío' : 'Iniciar envío ahora'}
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
                        </div>
                    </div>

                    {/* Media files */}
                    <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-5">
                        <p className="text-xs font-black uppercase tracking-widest text-white/30 mb-3 flex items-center gap-2">
                            <ImageIcon size={12} /> Archivos multimedia ({campaign.images?.length})
                        </p>
                        {campaign.images?.length === 0 ? (
                            <p className="text-xs text-white/30">Sin archivos</p>
                        ) : (
                            <div className="grid grid-cols-3 gap-2">
                                {campaign.images?.map((img: any, i: number) => (
                                    <div key={img.id} className="relative aspect-square rounded-xl overflow-hidden border border-white/10">
                                        {img.type === 'VIDEO' ? (
                                            <div className="w-full h-full bg-purple-500/10 flex flex-col items-center justify-center">
                                                <Film size={24} className="text-purple-400" />
                                                <span className="text-[9px] text-purple-300 mt-1">Video</span>
                                            </div>
                                        ) : (
                                            <img src={img.url} alt="" className="w-full h-full object-cover" />
                                        )}
                                        <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[9px] font-black px-1.5 py-0.5 rounded">
                                            {i + 1}
                                        </span>
                                        {img.type === 'VIDEO' && (
                                            <span className="absolute top-1 right-1 bg-purple-500/80 text-white text-[8px] font-bold px-1 rounded">VID</span>
                                        )}
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
