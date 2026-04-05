'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import {
    ArrowLeft, Loader2, Users, Tag, MessageSquare, CheckCircle2,
    Search, Download, AlertCircle, RefreshCw, UsersRound, X, Smartphone
} from 'lucide-react'

type Step = 'qr' | 'ready'
type Tab = 'groups' | 'labels' | 'all'
type ExportMode = 'phone' | 'phone_name'

interface GroupItem { id: string; name: string; totalMembers: number; selected: boolean }
interface LabelItem { id: string; name: string; hexColor: string; contactCount: number; selected: boolean }

export default function WaWebExtractPage() {
    const [step, setStep] = useState<Step>('qr')
    const [qrImage, setQrImage] = useState<string | null>(null)
    const [phone, setPhone] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [successMsg, setSuccessMsg] = useState<string | null>(null)
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

    const [tab, setTab] = useState<Tab>('groups')
    const [groups, setGroups] = useState<GroupItem[]>([])
    const [labels, setLabels] = useState<LabelItem[]>([])
    const [loadingData, setLoadingData] = useState(false)
    const [search, setSearch] = useState('')
    const [mode, setMode] = useState<ExportMode>('phone')
    const [exporting, setExporting] = useState(false)

    // Start session + poll for QR/ready
    useEffect(() => {
        startSession()
        return () => { if (pollRef.current) clearInterval(pollRef.current) }
    }, [])

    async function startSession() {
        setLoading(true)
        setError(null)
        try {
            // Start session (returns immediately, Chromium starts in background)
            const res = await fetch('/api/crm/waweb/session', { method: 'POST' })
            const data = await res.json()

            if (data.status === 'ready') {
                onReady(data.phone)
                setLoading(false)
                return
            }
            if (data.qr) {
                setQrImage(data.qr)
                setLoading(false)
            }

            // Poll every 2s until session is ready — STOPS once ready
            let alreadyReady = false
            pollRef.current = setInterval(async () => {
                if (alreadyReady) return // prevent double-fire
                try {
                    const r = await fetch('/api/crm/waweb/session')
                    const d = await r.json()
                    if (d.status === 'ready' && !alreadyReady) {
                        alreadyReady = true
                        if (pollRef.current) {
                            clearInterval(pollRef.current)
                            pollRef.current = null
                        }
                        onReady(d.phone)
                        return
                    }
                    if (d.qr) {
                        setQrImage(d.qr)
                        setLoading(false)
                    }
                } catch {}
            }, 2000)
        } catch (err) {
            setError('Error al iniciar sesión')
            setLoading(false)
        }
    }

    function onReady(ph: string) {
        setStep('ready')
        setPhone(ph || '')
        setLoading(false)
        loadTab('groups')
    }

    async function loadTab(t: Tab) {
        setTab(t)
        setSearch('')
        if (t === 'all') return

        setLoadingData(true)
        try {
            const endpoint = t === 'groups' ? '/api/crm/waweb/groups' : '/api/crm/waweb/labels'
            const res = await fetch(endpoint)
            const data = await res.json()
            if (t === 'groups') {
                setGroups((data.groups || []).map((g: any) => ({ ...g, selected: false })))
            } else {
                setLabels((data.labels || []).map((l: any) => ({ ...l, selected: false })))
            }
        } catch { setError('Error al cargar datos') }
        setLoadingData(false)
    }

    function toggleGroup(id: string) {
        setGroups(prev => prev.map(g => g.id === id ? { ...g, selected: !g.selected } : g))
    }

    function toggleLabel(id: string) {
        setLabels(prev => prev.map(l => l.id === id ? { ...l, selected: !l.selected } : l))
    }

    function toggleAll() {
        if (tab === 'groups') {
            const allSel = groups.every(g => g.selected)
            setGroups(prev => prev.map(g => ({ ...g, selected: !allSel })))
        } else {
            const allSel = labels.every(l => l.selected)
            setLabels(prev => prev.map(l => ({ ...l, selected: !allSel })))
        }
    }

    async function handleExport() {
        setError(null)
        setSuccessMsg(null)
        setExporting(true)
        try {
            const body: any = { type: tab, mode }
            if (tab === 'groups') body.selectedIds = groups.filter(g => g.selected).map(g => g.id)
            else if (tab === 'labels') body.selectedIds = labels.filter(l => l.selected).map(l => l.id)

            const res = await fetch('/api/crm/waweb/export', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })

            if (!res.ok) {
                const d = await res.json().catch(() => ({}))
                setError(d.error || 'Error al exportar')
                setExporting(false)
                return
            }

            const count = res.headers.get('X-Contact-Count') || '?'
            const blob = await res.blob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            const disp = res.headers.get('Content-Disposition') || ''
            const match = disp.match(/filename="(.+)"/)
            a.download = match?.[1] || 'contactos.xlsx'
            document.body.appendChild(a); a.click(); a.remove()
            URL.revokeObjectURL(url)
            setSuccessMsg(`${count} contactos exportados con números reales ✓`)
        } catch { setError('Error de conexión') }
        setExporting(false)
    }

    async function disconnect() {
        await fetch('/api/crm/waweb/session', { method: 'DELETE' }).catch(() => {})
        setStep('qr')
        setQrImage(null)
        setPhone('')
        setGroups([])
        setLabels([])
    }

    const filteredGroups = groups.filter(g => g.name.toLowerCase().includes(search.toLowerCase()))
    const filteredLabels = labels.filter(l => l.name.toLowerCase().includes(search.toLowerCase()))
    const hasSelection = tab === 'groups'
        ? groups.some(g => g.selected)
        : tab === 'labels'
        ? labels.some(l => l.selected)
        : true

    return (
        <div className="px-4 md:px-6 pt-6 max-w-3xl mx-auto pb-24 text-white">
            {/* Header */}
            <div className="flex items-center gap-4 mb-8">
                <Link href="/dashboard/crm/export" className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all">
                    <ArrowLeft size={16} />
                </Link>
                <div className="flex-1">
                    <h1 className="text-xl font-black uppercase tracking-tighter">Extraer de WhatsApp</h1>
                    <p className="text-white/30 text-xs mt-0.5">Números reales garantizados — whatsapp-web.js</p>
                </div>
                {step === 'ready' && phone && (
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-green-400 font-bold">+{phone}</span>
                        <button onClick={disconnect} className="text-white/30 hover:text-red-400" title="Desconectar">
                            <X size={14} />
                        </button>
                    </div>
                )}
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

            {/* ─── STEP: QR ─── */}
            {step === 'qr' && (
                <div className="flex flex-col items-center py-8">
                    <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-4">
                        <Smartphone size={28} className="text-amber-400" />
                    </div>
                    <h2 className="text-lg font-black mb-1">Escanea el QR</h2>
                    <p className="text-xs text-white/40 mb-6 text-center max-w-sm">
                        Abrí WhatsApp en tu celular → Dispositivos vinculados → Vincular un dispositivo → Escaneá el código QR
                    </p>

                    {qrImage ? (
                        <div className="bg-white p-4 rounded-2xl mb-4">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={qrImage} alt="QR Code" className="w-64 h-64" />
                        </div>
                    ) : (
                        <div className="w-64 h-64 bg-white/5 border border-white/10 rounded-2xl flex flex-col items-center justify-center gap-3 mb-4">
                            <Loader2 size={28} className="animate-spin text-amber-400" />
                            <span className="text-xs text-white/50 font-bold">Iniciando WhatsApp Web...</span>
                            <span className="text-[10px] text-white/30">Tarda 15-30 segundos la primera vez</span>
                        </div>
                    )}

                    <p className="text-[10px] text-white/30">
                        {qrImage ? 'Esperando que escanees el QR...' : 'Levantando Chromium headless...'}
                    </p>
                </div>
            )}

            {/* ─── STEP: READY ─── */}
            {step === 'ready' && (
                <>
                    {/* Tabs */}
                    <div className="flex gap-2 mb-5">
                        <TabButton active={tab === 'groups'} onClick={() => loadTab('groups')} icon={<UsersRound size={14} />} label="Grupos" />
                        <TabButton active={tab === 'labels'} onClick={() => loadTab('labels')} icon={<Tag size={14} />} label="Etiquetas" />
                        <TabButton active={tab === 'all'} onClick={() => setTab('all')} icon={<MessageSquare size={14} />} label="Todos los chats" />
                    </div>

                    {/* Content */}
                    {tab === 'all' ? (
                        <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-5 mb-5">
                            <p className="text-sm text-white/70 mb-1">Exportar todos los contactos individuales de WhatsApp.</p>
                            <p className="text-[11px] text-white/40">Teléfonos 100% reales.</p>
                        </div>
                    ) : loadingData ? (
                        <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-10 flex items-center justify-center gap-3 text-white/40 text-sm mb-5">
                            <Loader2 size={16} className="animate-spin" />
                            Cargando {tab === 'groups' ? 'grupos' : 'etiquetas'}...
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
                                        placeholder="Buscar..."
                                        className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-amber-500/50"
                                    />
                                </div>
                                <button onClick={toggleAll} className="px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-amber-400 hover:bg-white/10 whitespace-nowrap">
                                    {(tab === 'groups' ? groups : labels).every(i => i.selected) ? 'Quitar todos' : 'Seleccionar todos'}
                                </button>
                                <button onClick={() => loadTab(tab)} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-white/40 hover:text-amber-400" title="Recargar">
                                    <RefreshCw size={13} />
                                </button>
                            </div>

                            {/* List */}
                            <div className="bg-white/[0.03] border border-white/8 rounded-2xl overflow-hidden max-h-[400px] overflow-y-auto mb-5">
                                {tab === 'groups' ? (
                                    filteredGroups.length === 0 ? (
                                        <p className="text-center text-white/30 text-sm py-12">Sin grupos</p>
                                    ) : filteredGroups.map(g => (
                                        <SelectItem
                                            key={g.id}
                                            selected={g.selected}
                                            onClick={() => toggleGroup(g.id)}
                                            name={g.name}
                                            meta={`${g.totalMembers} miembros`}
                                        />
                                    ))
                                ) : (
                                    filteredLabels.length === 0 ? (
                                        <p className="text-center text-white/30 text-sm py-12">Sin etiquetas</p>
                                    ) : filteredLabels.map(l => (
                                        <SelectItem
                                            key={l.id}
                                            selected={l.selected}
                                            onClick={() => toggleLabel(l.id)}
                                            name={l.name}
                                            meta={`${l.contactCount} contacto${l.contactCount !== 1 ? 's' : ''}`}
                                            colorDot={l.hexColor}
                                        />
                                    ))
                                )}
                            </div>
                        </>
                    )}

                    {/* Export mode + button */}
                    <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-5">
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
                        <button
                            onClick={handleExport}
                            disabled={exporting || !hasSelection}
                            className="w-full flex items-center justify-center gap-2 py-4 rounded-xl text-sm font-black uppercase tracking-widest text-white disabled:opacity-40 transition-all"
                            style={{ background: 'linear-gradient(135deg, #B45309, #D97706, #FFD700)' }}
                        >
                            {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                            {exporting ? 'Extrayendo...' : 'Exportar Excel'}
                        </button>
                    </div>
                </>
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
            {icon} {label}
        </button>
    )
}

function SelectItem({ selected, onClick, name, meta, colorDot }: { selected: boolean; onClick: () => void; name: string; meta: string; colorDot?: string }) {
    return (
        <button onClick={onClick} className={`w-full flex items-center gap-3 p-4 border-b border-white/5 text-left transition-all ${selected ? 'bg-amber-500/10' : 'hover:bg-white/[0.02]'}`}>
            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${selected ? 'bg-amber-400 border-amber-400' : 'border-white/20'}`}>
                {selected && <CheckCircle2 size={12} className="text-black" />}
            </div>
            {colorDot && <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: colorDot }} />}
            <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">{name}</p>
                {meta && <p className="text-[10px] text-white/40">{meta}</p>}
            </div>
        </button>
    )
}
