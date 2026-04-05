'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
    ArrowLeft, Download, Loader2, Bot, Users,
    ShoppingCart, MessageSquare, FileSpreadsheet, CheckCircle2, Package
} from 'lucide-react'

interface BotOption {
    id: string
    name: string
    baileysPhone?: string
}

interface CampaignOption {
    id: string
    name: string
    status: string
    totalContacts: number
}

export default function CrmExportPage() {
    const [bots, setBots] = useState<BotOption[]>([])
    const [botStatuses, setBotStatuses] = useState<Record<string, string>>({})
    const [selectedBot, setSelectedBot] = useState('')
    const [campaigns, setCampaigns] = useState<CampaignOption[]>([])
    const [downloading, setDownloading] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    useEffect(() => { fetchBots(); fetchCampaigns() }, [])

    async function fetchBots() {
        const res = await fetch('/api/bots')
        const data = await res.json()
        const baileysBots = (data.bots || []).filter((b: any) => b.type === 'BAILEYS')
        setBots(baileysBots)
        if (baileysBots.length === 1) setSelectedBot(baileysBots[0].id)
        const statuses: Record<string, string> = {}
        await Promise.all(baileysBots.map(async (b: any) => {
            try {
                const sr = await fetch(`/api/bots/${b.id}/baileys/status`)
                const sd = await sr.json()
                statuses[b.id] = sd.status || 'disconnected'
            } catch {
                statuses[b.id] = 'disconnected'
            }
        }))
        setBotStatuses(statuses)
    }

    async function fetchCampaigns() {
        try {
            const res = await fetch('/api/crm/campaigns')
            const data = await res.json()
            setCampaigns(data.campaigns || [])
        } catch { setCampaigns([]) }
    }

    async function downloadExcel(key: string, queryParams: string) {
        setDownloading(key)
        setSuccess(null)
        try {
            const res = await fetch(`/api/crm/export?${queryParams}`)
            if (!res.ok) {
                const err = await res.json()
                alert(err.error || 'Error al exportar')
                return
            }
            const blob = await res.blob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            const disposition = res.headers.get('Content-Disposition') || ''
            const match = disposition.match(/filename="(.+)"/)
            a.download = match?.[1] || 'contactos.xlsx'
            document.body.appendChild(a)
            a.click()
            a.remove()
            URL.revokeObjectURL(url)
            setSuccess(key)
            setTimeout(() => setSuccess(null), 3000)
        } catch { alert('Error de conexión') }
        finally { setDownloading(null) }
    }

    return (
        <div className="px-4 md:px-6 pt-6 max-w-2xl mx-auto pb-24 text-white">
            {/* Header */}
            <div className="flex items-center gap-4 mb-8">
                <Link href="/dashboard/crm" className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all">
                    <ArrowLeft size={16} />
                </Link>
                <div>
                    <h1 className="text-xl font-black uppercase tracking-tighter">Exportar contactos</h1>
                    <p className="text-white/30 text-xs mt-0.5">Descarga Excel con contactos del CRM</p>
                </div>
            </div>

            {/* Extraer de WhatsApp — whatsapp-web.js */}
            <div className="relative overflow-hidden bg-gradient-to-br from-amber-500/10 via-amber-600/10 to-yellow-500/10 border-2 border-amber-500/30 rounded-2xl p-5 mb-6">
                <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
                        <Package size={22} className="text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <p className="text-sm font-black text-white">Extraer de WhatsApp</p>
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-500 text-black">NÚMEROS REALES</span>
                        </div>
                        <p className="text-[11px] text-white/60 mb-3 leading-relaxed">
                            Escaneá un QR y extraé <span className="text-amber-400 font-bold">grupos, etiquetas y contactos</span> con números reales garantizados. Sin descargar nada, sin extensiones, todo desde Nexor.
                        </p>
                        <div className="flex items-center gap-2 flex-wrap">
                            <Link
                                href="/dashboard/crm/extract/waweb"
                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider text-black transition-all hover:opacity-90"
                                style={{ background: 'linear-gradient(135deg, #B45309, #D97706, #FFD700)' }}
                            >
                                <Package size={12} /> Extraer contactos
                            </Link>
                        </div>
                    </div>
                </div>
            </div>

            {/* Seleccionar bot */}
            <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-5 mb-6">
                <label className="block text-xs font-black uppercase tracking-widest text-white/40 mb-3 flex items-center gap-2">
                    <Bot size={12} /> Seleccionar Bot
                </label>
                {bots.length === 0 ? (
                    <p className="text-sm text-white/30">No hay bots Baileys</p>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {bots.map(b => (
                            <button
                                key={b.id}
                                onClick={() => setSelectedBot(b.id)}
                                className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${selectedBot === b.id ? 'border-amber-500/60 bg-amber-500/10' : 'border-white/10 bg-white/5 hover:border-white/20'}`}
                            >
                                <div className={`w-2 h-2 rounded-full shrink-0 ${botStatuses[b.id] === 'connected' ? 'bg-green-400' : 'bg-red-400'}`} />
                                <div>
                                    <p className="text-sm font-bold text-white">{b.name}</p>
                                    <p className="text-[10px] text-white/30">{b.baileysPhone || (botStatuses[b.id] === 'connected' ? 'Conectado' : 'Desconectado')}</p>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {selectedBot && (
                <div className="space-y-4">

                    {/* ── Todos los chats ── */}
                    <ExportCard
                        icon={<MessageSquare size={18} />}
                        title="Todos los chats"
                        description="Todos los contactos que han escrito al bot"
                        downloading={downloading === 'all'}
                        success={success === 'all'}
                        onDownload={() => downloadExcel('all', `type=all_chats&botId=${selectedBot}`)}
                    />

                    {/* ── Solo ventas ── */}
                    <ExportCard
                        icon={<ShoppingCart size={18} />}
                        title="Solo ventas"
                        description="Contactos que completaron una compra"
                        downloading={downloading === 'sales'}
                        success={success === 'sales'}
                        onDownload={() => downloadExcel('sales', `type=sales&botId=${selectedBot}`)}
                    />

                    {/* ── Por campaña CRM ── */}
                    {campaigns.length > 0 && (
                        <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-5">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400">
                                    <Users size={18} />
                                </div>
                                <div>
                                    <p className="text-sm font-bold">Por campaña CRM</p>
                                    <p className="text-[11px] text-white/30">Contactos de campañas anteriores con su estado</p>
                                </div>
                            </div>

                            <div className="space-y-2 mt-3">
                                {campaigns.map(c => (
                                    <div key={c.id} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/8">
                                        <div>
                                            <p className="text-sm font-bold text-white">{c.name}</p>
                                            <p className="text-[10px] text-white/30">
                                                {c.totalContacts} contactos · <span className={c.status === 'COMPLETED' ? 'text-blue-400' : c.status === 'RUNNING' ? 'text-green-400' : 'text-white/40'}>{c.status}</span>
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => downloadExcel(`camp_${c.id}`, `type=campaign&campaignId=${c.id}`)}
                                            disabled={downloading === `camp_${c.id}` || c.totalContacts === 0}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs font-bold text-white/60 hover:text-amber-400 hover:border-amber-500/40 transition-all disabled:opacity-30"
                                        >
                                            {downloading === `camp_${c.id}` ? (
                                                <Loader2 size={12} className="animate-spin" />
                                            ) : success === `camp_${c.id}` ? (
                                                <CheckCircle2 size={12} className="text-green-400" />
                                            ) : (
                                                <Download size={12} />
                                            )}
                                            Excel
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

function ExportCard({ icon, title, description, downloading, success, onDownload }: {
    icon: React.ReactNode
    title: string
    description: string
    downloading: boolean
    success: boolean
    onDownload: () => void
}) {
    return (
        <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400">
                    {icon}
                </div>
                <div>
                    <p className="text-sm font-bold">{title}</p>
                    <p className="text-[11px] text-white/30">{description}</p>
                </div>
            </div>
            <button
                onClick={onDownload}
                disabled={downloading}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50 hover:scale-105"
                style={{ background: 'linear-gradient(135deg, #B45309, #D97706, #FFD700)' }}
            >
                {downloading ? (
                    <Loader2 size={14} className="animate-spin" />
                ) : success ? (
                    <CheckCircle2 size={14} />
                ) : (
                    <FileSpreadsheet size={14} />
                )}
                {success ? 'Listo' : 'Descargar'}
            </button>
        </div>
    )
}
