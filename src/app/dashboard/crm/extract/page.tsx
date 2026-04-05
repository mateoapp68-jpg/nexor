'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
    ArrowLeft, Loader2, Bot, Users, Tag, MessageSquare,
    CheckCircle2, Search, Download, AlertCircle, RefreshCw, UsersRound
} from 'lucide-react'

interface BotOption {
    id: string
    name: string
    baileysPhone?: string
}

interface GroupOption {
    id: string
    name: string
    totalMembers: number
    resolvedMembers: number
}

interface LabelOption {
    id: string
    name: string
    color: number
    totalContacts: number
    resolvedContacts: number
}

type Tab = 'groups' | 'labels' | 'all'
type ExportMode = 'phone' | 'phone_name'

export default function CrmExtractPage() {
    const [bots, setBots] = useState<BotOption[]>([])
    const [botStatuses, setBotStatuses] = useState<Record<string, string>>({})
    const [selectedBot, setSelectedBot] = useState('')

    const [tab, setTab] = useState<Tab>('groups')
    const [loading, setLoading] = useState(false)
    const [groups, setGroups] = useState<GroupOption[]>([])
    const [labels, setLabels] = useState<LabelOption[]>([])
    const [search, setSearch] = useState('')
    const [selectedIds, setSelectedIds] = useState<string[]>([])
    const [mode, setMode] = useState<ExportMode>('phone')
    const [error, setError] = useState<string | null>(null)
    const [exporting, setExporting] = useState(false)
    const [successMsg, setSuccessMsg] = useState<string | null>(null)

    useEffect(() => { fetchBots() }, [])

    useEffect(() => {
        if (!selectedBot || botStatuses[selectedBot] !== 'connected') {
            setGroups([]); setLabels([]); return
        }
        if (tab === 'groups') loadGroups()
        else if (tab === 'labels') loadLabels()
    }, [selectedBot, tab, botStatuses])

    async function fetchBots() {
        try {
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
                } catch { statuses[b.id] = 'disconnected' }
            }))
            setBotStatuses(statuses)
        } catch { setError('Error al cargar bots') }
    }

    async function loadGroups() {
        setLoading(true)
        setError(null)
        setSelectedIds([])
        try {
            const res = await fetch(`/api/crm/extract/groups?botId=${selectedBot}`)
            const data = await res.json()
            if (!res.ok) { setError(data.error); setGroups([]); return }
            setGroups(data.groups || [])
        } catch { setError('Error al cargar grupos') }
        setLoading(false)
    }

    async function loadLabels() {
        setLoading(true)
        setError(null)
        setSelectedIds([])
        try {
            const res = await fetch(`/api/crm/extract/labels?botId=${selectedBot}`)
            const data = await res.json()
            if (data.error && (!data.labels || data.labels.length === 0)) {
                setError(data.error); setLabels([]); return
            }
            setLabels(data.labels || [])
        } catch { setError('Error al cargar etiquetas') }
        setLoading(false)
    }

    function toggleSelect(id: string) {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
    }

    function toggleAll() {
        const list = tab === 'groups' ? groups : labels
        if (selectedIds.length === list.length) setSelectedIds([])
        else setSelectedIds(list.map(x => x.id))
    }

    async function handleExport() {
        setError(null)
        setSuccessMsg(null)
        setExporting(true)
        try {
            const body: any = { botId: selectedBot, type: tab, mode }
            if (tab !== 'all') body.selectedIds = selectedIds

            const res = await fetch('/api/crm/extract/export', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })

            if (!res.ok) {
                const data = await res.json().catch(() => ({}))
                setError(data.error || 'Error al exportar')
                setExporting(false)
                return
            }

            const count = res.headers.get('X-Contact-Count') || '?'
            const blob = await res.blob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            const disposition = res.headers.get('Content-Disposition') || ''
            const match = disposition.match(/filename="(.+)"/)
            a.download = match?.[1] || 'contactos.xlsx'
            document.body.appendChild(a); a.click(); a.remove()
            URL.revokeObjectURL(url)
            setSuccessMsg(`${count} contactos exportados con teléfonos reales ✓`)
        } catch { setError('Error de conexión') }
        setExporting(false)
    }

    const filteredGroups = groups.filter(g => g.name.toLowerCase().includes(search.toLowerCase()))
    const filteredLabels = labels.filter(l => l.name.toLowerCase().includes(search.toLowerCase()))
    const isConnected = selectedBot && botStatuses[selectedBot] === 'connected'

    return (
        <div className="px-4 md:px-6 pt-6 max-w-3xl mx-auto pb-24 text-white">
            {/* Header */}
            <div className="flex items-center gap-4 mb-8">
                <Link href="/dashboard/crm/export" className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all">
                    <ArrowLeft size={16} />
                </Link>
                <div>
                    <h1 className="text-xl font-black uppercase tracking-tighter">Extraer contactos</h1>
                    <p className="text-white/30 text-xs mt-0.5">Desde tu bot de WhatsApp — solo números reales</p>
                </div>
            </div>

            {error && (
                <div className="mb-5 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex gap-3 text-red-400 text-sm">
                    <AlertCircle size={16} className="shrink-0" />
                    <p className="flex-1">{error}</p>
                    <button onClick={() => setError(null)} className="font-bold">✕</button>
                </div>
            )}

            {successMsg && (
                <div className="mb-5 p-4 bg-green-500/10 border border-green-500/20 rounded-2xl flex gap-3 text-green-400 text-sm">
                    <CheckCircle2 size={16} className="shrink-0" />
                    <p className="flex-1">{successMsg}</p>
                    <button onClick={() => setSuccessMsg(null)} className="font-bold">✕</button>
                </div>
            )}

            {/* Bot selector */}
            <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-5 mb-6">
                <label className="text-xs font-black uppercase tracking-widest text-white/40 mb-3 flex items-center gap-2">
                    <Bot size={12} /> Seleccionar bot
                </label>
                {bots.length === 0 ? (
                    <p className="text-sm text-red-400">No tenés bots Baileys conectados</p>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {bots.map(b => (
                            <button
                                key={b.id}
                                onClick={() => setSelectedBot(b.id)}
                                className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${selectedBot === b.id ? 'border-amber-500/60 bg-amber-500/10' : 'border-white/10 bg-white/5 hover:border-white/20'}`}
                            >
                                <div className={`w-2 h-2 rounded-full shrink-0 ${botStatuses[b.id] === 'connected' ? 'bg-green-400' : 'bg-red-400'}`} />
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-bold text-white truncate">{b.name}</p>
                                    <p className="text-[10px] text-white/30">{b.baileysPhone || (botStatuses[b.id] === 'connected' ? 'Conectado' : 'Desconectado')}</p>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {selectedBot && isConnected && (
                <>
                    {/* Tabs */}
                    <div className="flex gap-2 mb-5">
                        <TabButton active={tab === 'groups'} onClick={() => setTab('groups')} icon={<UsersRound size={14} />} label="Grupos" />
                        <TabButton active={tab === 'labels'} onClick={() => setTab('labels')} icon={<Tag size={14} />} label="Etiquetas" />
                        <TabButton active={tab === 'all'} onClick={() => setTab('all')} icon={<MessageSquare size={14} />} label="Todos los chats" />
                    </div>

                    {/* Content */}
                    {tab === 'all' ? (
                        <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-6">
                            <p className="text-sm text-white/70 mb-2">Exportar todos los contactos que escribieron a este bot.</p>
                            <p className="text-[11px] text-white/40 mb-4">Estos contactos siempre tienen teléfono real ya que vienen de conversaciones reales.</p>
                        </div>
                    ) : (
                        <>
                            {loading ? (
                                <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-8 flex items-center justify-center gap-3 text-white/40 text-sm">
                                    <Loader2 size={16} className="animate-spin" />
                                    Cargando {tab === 'groups' ? 'grupos' : 'etiquetas'}... (puede tardar un momento)
                                </div>
                            ) : (
                                <>
                                    {/* Toolbar */}
                                    <div className="flex items-center gap-2 mb-3">
                                        <div className="flex-1 relative">
                                            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                                            <input
                                                value={search}
                                                onChange={e => setSearch(e.target.value)}
                                                placeholder={`Buscar ${tab === 'groups' ? 'grupo' : 'etiqueta'}...`}
                                                className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-amber-500/50"
                                            />
                                        </div>
                                        <button
                                            onClick={toggleAll}
                                            className="px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-amber-400 hover:bg-white/10 whitespace-nowrap"
                                        >
                                            {selectedIds.length === (tab === 'groups' ? groups : labels).length && selectedIds.length > 0 ? 'Quitar todos' : 'Seleccionar todos'}
                                        </button>
                                        <button
                                            onClick={() => tab === 'groups' ? loadGroups() : loadLabels()}
                                            className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-white/40 hover:text-amber-400"
                                            title="Recargar"
                                        >
                                            <RefreshCw size={13} />
                                        </button>
                                    </div>

                                    {/* List */}
                                    <div className="bg-white/[0.03] border border-white/8 rounded-2xl overflow-hidden max-h-[400px] overflow-y-auto mb-4">
                                        {tab === 'groups' ? (
                                            filteredGroups.length === 0 ? (
                                                <p className="text-center text-white/30 text-sm py-12">No hay grupos</p>
                                            ) : (
                                                filteredGroups.map(g => (
                                                    <SelectItem
                                                        key={g.id}
                                                        selected={selectedIds.includes(g.id)}
                                                        onClick={() => toggleSelect(g.id)}
                                                        name={g.name}
                                                        total={g.totalMembers}
                                                        resolved={g.resolvedMembers}
                                                    />
                                                ))
                                            )
                                        ) : (
                                            filteredLabels.length === 0 ? (
                                                <p className="text-center text-white/30 text-sm py-12">No hay etiquetas</p>
                                            ) : (
                                                filteredLabels.map(l => (
                                                    <SelectItem
                                                        key={l.id}
                                                        selected={selectedIds.includes(l.id)}
                                                        onClick={() => toggleSelect(l.id)}
                                                        name={l.name}
                                                        total={l.totalContacts}
                                                        resolved={l.resolvedContacts}
                                                    />
                                                ))
                                            )
                                        )}
                                    </div>
                                </>
                            )}
                        </>
                    )}

                    {/* Export mode + button */}
                    <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-5 mb-5">
                        <p className="text-xs font-black uppercase tracking-widest text-white/40 mb-3">Modo de exportación</p>
                        <div className="flex gap-2 mb-4">
                            <button
                                onClick={() => setMode('phone')}
                                className={`flex-1 py-2.5 rounded-xl text-xs font-bold border transition-all ${mode === 'phone' ? 'bg-amber-500/15 border-amber-500/40 text-amber-400' : 'bg-white/5 border-white/10 text-white/50'}`}
                            >
                                Solo teléfono
                            </button>
                            <button
                                onClick={() => setMode('phone_name')}
                                className={`flex-1 py-2.5 rounded-xl text-xs font-bold border transition-all ${mode === 'phone_name' ? 'bg-amber-500/15 border-amber-500/40 text-amber-400' : 'bg-white/5 border-white/10 text-white/50'}`}
                            >
                                Teléfono + Nombre
                            </button>
                        </div>
                        <p className="text-[11px] text-white/40 mb-4 italic">
                            ⚠️ Solo se exportan contactos con <b className="text-amber-400">teléfono real verificado</b>. Los contactos sin resolver se omiten automáticamente.
                        </p>
                        <button
                            onClick={handleExport}
                            disabled={exporting || (tab !== 'all' && selectedIds.length === 0)}
                            className="w-full flex items-center justify-center gap-2 py-4 rounded-xl text-sm font-black uppercase tracking-widest text-white disabled:opacity-40 transition-all"
                            style={{ background: 'linear-gradient(135deg, #B45309, #D97706, #FFD700)' }}
                        >
                            {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                            {exporting ? 'Extrayendo contactos...' : 'Exportar Excel'}
                        </button>
                    </div>
                </>
            )}

            {selectedBot && !isConnected && (
                <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-5 text-sm text-red-400">
                    El bot debe estar conectado para poder extraer contactos. Andá a <Link href="/dashboard/services/whatsapp" className="underline">WhatsApp</Link> y conectalo.
                </div>
            )}
        </div>
    )
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
    return (
        <button
            onClick={onClick}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold border transition-all ${active ? 'bg-amber-500/15 border-amber-500/40 text-amber-400' : 'bg-white/5 border-white/10 text-white/50 hover:text-white/70'}`}
        >
            {icon}
            {label}
        </button>
    )
}

function SelectItem({ selected, onClick, name, total, resolved }: { selected: boolean; onClick: () => void; name: string; total: number; resolved: number }) {
    const pct = total > 0 ? Math.round((resolved / total) * 100) : 0
    return (
        <button
            onClick={onClick}
            className={`w-full flex items-center gap-3 p-4 border-b border-white/5 text-left transition-all ${selected ? 'bg-amber-500/10' : 'hover:bg-white/[0.02]'}`}
        >
            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${selected ? 'bg-amber-400 border-amber-400' : 'border-white/20'}`}>
                {selected && <CheckCircle2 size={12} className="text-black" />}
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">{name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-green-400 font-bold">{resolved} resueltos</span>
                    {total > resolved && (
                        <span className="text-[10px] text-white/30">· {total - resolved} sin resolver</span>
                    )}
                    <span className="text-[10px] text-white/30">· {pct}% real</span>
                </div>
            </div>
        </button>
    )
}
