'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
    ArrowLeft, Upload, X, Loader2, AlertCircle, CheckCircle2,
    Bot, Clock, Calendar, Users, Sparkles, Image as ImageIcon, Film,
    Tag, Pencil, Trash2, Plus, Phone
} from 'lucide-react'

interface ContactEntry {
    phone: string
    name: string | null
}

interface LabelData {
    id: string
    name: string
    color: number
    contacts: string[]
    contactCount: number
}

const LABEL_COLORS: Record<number, string> = {
    0: '#64748b', 1: '#f97316', 2: '#84cc16', 3: '#a855f7',
    4: '#ec4899', 5: '#14b8a6', 6: '#3b82f6', 7: '#ef4444',
    8: '#06b6d4', 9: '#eab308', 10: '#8b5cf6', 11: '#f43f5e',
    12: '#10b981', 13: '#6366f1', 14: '#d946ef', 15: '#0ea5e9',
    16: '#f59e0b', 17: '#22c55e', 18: '#e11d48', 19: '#7c3aed',
}

export default function NewCrmCampaignPage() {
    const router = useRouter()
    const fileInputRef = useRef<HTMLInputElement>(null)
    const excelInputRef = useRef<HTMLInputElement>(null)

    const [bots, setBots] = useState<any[]>([])
    const [botStatuses, setBotStatuses] = useState<Record<string, string>>({})
    const [form, setForm] = useState({
        name: '',
        botId: '',
        prompt: '',
        delayValue: '30',
        delayUnit: 'seconds',
        scheduledAt: '',
    })
    const [mediaFiles, setMediaFiles] = useState<{ file: File; preview: string; type: 'IMAGE' | 'VIDEO' }[]>([])

    // Contact source
    const [contactSource, setContactSource] = useState<'excel' | 'label'>('excel')
    const [contacts, setContacts] = useState<ContactEntry[]>([])

    // Excel
    const [excelFile, setExcelFile] = useState<File | null>(null)
    const [parsingExcel, setParsingExcel] = useState(false)

    // Labels
    const [labels, setLabels] = useState<LabelData[]>([])
    const [loadingLabels, setLoadingLabels] = useState(false)
    const [selectedLabels, setSelectedLabels] = useState<string[]>([])

    // Edit contact
    const [editingIdx, setEditingIdx] = useState<number | null>(null)
    const [editPhone, setEditPhone] = useState('')
    const [editName, setEditName] = useState('')

    // Add manual contact
    const [showAddContact, setShowAddContact] = useState(false)
    const [newPhone, setNewPhone] = useState('')
    const [newName, setNewName] = useState('')

    const [loading, setLoading] = useState(false)
    const [uploadingImg, setUploadingImg] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => { fetchBots() }, [])

    // Fetch labels when bot changes
    useEffect(() => {
        if (form.botId && botStatuses[form.botId] === 'connected') {
            fetchLabels(form.botId)
        } else {
            setLabels([])
            setSelectedLabels([])
        }
    }, [form.botId, botStatuses])

    async function fetchBots() {
        const res = await fetch('/api/bots')
        const data = await res.json()
        const baileysBots = (data.bots || []).filter((b: any) => b.type === 'BAILEYS')
        setBots(baileysBots)
        if (baileysBots.length === 1) setForm(f => ({ ...f, botId: baileysBots[0].id }))
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

    async function fetchLabels(botId: string) {
        setLoadingLabels(true)
        try {
            const res = await fetch(`/api/bots/${botId}/baileys/labels`)
            const data = await res.json()
            setLabels(data.labels || [])
        } catch {
            setLabels([])
        }
        setLoadingLabels(false)
    }

    function toggleLabel(labelId: string) {
        setSelectedLabels(prev => {
            const next = prev.includes(labelId)
                ? prev.filter(id => id !== labelId)
                : [...prev, labelId]

            // Update contacts from selected labels
            const allPhones = new Set<string>()
            const targetLabels = next
            for (const label of labels) {
                if (targetLabels.includes(label.id)) {
                    for (const phone of label.contacts) {
                        allPhones.add(phone)
                    }
                }
            }
            const labelContacts: ContactEntry[] = Array.from(allPhones).map(phone => ({
                phone,
                name: null,
            }))
            setContacts(labelContacts)
            return next
        })
    }

    function isVideoFile(file: File): boolean {
        return file.type.startsWith('video/')
    }

    function handleMediaSelect(files: FileList | null) {
        if (!files) return
        const selected = Array.from(files)
        const newMedia = selected.map(file => ({
            file,
            preview: isVideoFile(file) ? '' : URL.createObjectURL(file),
            type: (isVideoFile(file) ? 'VIDEO' : 'IMAGE') as 'IMAGE' | 'VIDEO',
        }))
        setMediaFiles(prev => [...prev, ...newMedia])
    }

    function removeMedia(index: number) {
        setMediaFiles(prev => {
            if (prev[index].preview) URL.revokeObjectURL(prev[index].preview)
            return prev.filter((_, i) => i !== index)
        })
    }

    async function handleExcelSelect(files: FileList | null) {
        if (!files?.[0]) return
        const file = files[0]
        setExcelFile(file)
        setContacts([])
        setParsingExcel(true)
        try {
            const XLSX = await import('xlsx')
            const buffer = await file.arrayBuffer()
            const wb = XLSX.read(buffer, { type: 'array' })
            const ws = wb.Sheets[wb.SheetNames[0]]
            const rows: any[] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
            if (rows.length < 2) { setParsingExcel(false); return }

            const headers = rows[0].map((h: any) => String(h).toLowerCase().trim())
            const phoneIdx = headers.findIndex((h: string) => /tel[eé]f|phone|cel|m[oó]vil|n[uú]mero|numero|whatsapp/.test(h))
            const nameIdx = headers.findIndex((h: string) => /nombre|name/.test(h))

            const parsed: ContactEntry[] = []
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i]
                let phone = phoneIdx >= 0 ? String(row[phoneIdx] ?? '').replace(/\s+/g, '') : ''
                if (!phone) {
                    for (const cell of row) {
                        const s = String(cell ?? '').replace(/\s+/g, '')
                        if (/^\+?\d{7,15}$/.test(s)) { phone = s; break }
                    }
                }
                if (!phone) continue
                if (/^[67]\d{7}$/.test(phone)) phone = '+591' + phone
                else if (/^\d{8}$/.test(phone) && /^[67]/.test(phone)) phone = '+591' + phone
                if (!/^\+/.test(phone)) phone = '+' + phone
                const name = nameIdx >= 0 ? (String(row[nameIdx] ?? '').trim() || null) : null
                parsed.push({ phone, name })
            }
            setContacts(parsed)
        } catch { /* silent */ }
        finally { setParsingExcel(false) }
    }

    function startEdit(idx: number) {
        setEditingIdx(idx)
        setEditPhone(contacts[idx].phone)
        setEditName(contacts[idx].name || '')
    }

    function saveEdit() {
        if (editingIdx === null) return
        if (!editPhone.trim()) return
        setContacts(prev => prev.map((c, i) =>
            i === editingIdx ? { phone: editPhone.trim(), name: editName.trim() || null } : c
        ))
        setEditingIdx(null)
    }

    function deleteContact(idx: number) {
        setContacts(prev => prev.filter((_, i) => i !== idx))
    }

    function addManualContact() {
        if (!newPhone.trim()) return
        let phone = newPhone.trim().replace(/\s+/g, '')
        if (/^[67]\d{7}$/.test(phone)) phone = '+591' + phone
        if (!/^\+/.test(phone)) phone = '+' + phone
        setContacts(prev => [...prev, { phone, name: newName.trim() || null }])
        setNewPhone('')
        setNewName('')
        setShowAddContact(false)
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError(null)

        if (!form.botId) { setError('Selecciona un bot de WhatsApp'); return }
        if (mediaFiles.length === 0) { setError('Agrega al menos 1 archivo (imagen o video)'); return }
        if (contacts.length === 0) { setError('Agrega contactos (desde Excel, etiquetas o manualmente)'); return }

        setLoading(true)
        try {
            // 1. Create campaign
            const res = await fetch('/api/crm/campaigns', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            })
            const data = await res.json()
            if (!res.ok) { setError(data.error); return }
            const campaignId = data.campaign.id

            // 2. Upload media files
            setUploadingImg(true)
            const failedFiles: string[] = []
            for (const media of mediaFiles) {
                const fd = new FormData()
                fd.append('file', media.file)
                const mediaRes = await fetch(`/api/crm/campaigns/${campaignId}/images`, {
                    method: 'POST',
                    body: fd,
                })
                if (!mediaRes.ok) {
                    const mediaData = await mediaRes.json()
                    failedFiles.push(mediaData.error || media.file.name)
                }
            }
            setUploadingImg(false)
            if (failedFiles.length > 0) {
                setError(`Error subiendo archivos: ${failedFiles.join(', ')}`)
                return
            }

            // 3. Upload contacts (JSON with phones from labels/manual, or Excel)
            if (contactSource === 'label' || !excelFile) {
                const contactRes = await fetch(`/api/crm/campaigns/${campaignId}/contacts`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phones: contacts.map(c => c.phone) }),
                })
                if (!contactRes.ok) {
                    const contactData = await contactRes.json()
                    setError(contactData.error)
                    return
                }
            } else {
                const excelFd = new FormData()
                excelFd.append('file', excelFile)
                const excelRes = await fetch(`/api/crm/campaigns/${campaignId}/contacts`, {
                    method: 'POST',
                    body: excelFd,
                })
                if (!excelRes.ok) {
                    const excelData = await excelRes.json()
                    setError(excelData.error)
                    return
                }
            }

            router.push(`/dashboard/crm/${campaignId}`)
        } catch { setError('Error de conexión') }
        finally { setLoading(false); setUploadingImg(false) }
    }

    const imageCount = mediaFiles.filter(m => m.type === 'IMAGE').length
    const videoCount = mediaFiles.filter(m => m.type === 'VIDEO').length

    return (
        <div className="px-4 md:px-6 pt-6 max-w-2xl mx-auto pb-24 text-white">
            {/* Header */}
            <div className="flex items-center gap-4 mb-8">
                <Link href="/dashboard/crm" className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all">
                    <ArrowLeft size={16} />
                </Link>
                <div>
                    <h1 className="text-xl font-black uppercase tracking-tighter">Nueva campaña</h1>
                    <p className="text-white/30 text-xs mt-0.5">CRM Broadcast WhatsApp</p>
                </div>
            </div>

            {error && (
                <div className="mb-5 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex gap-3 text-red-400 text-sm">
                    <AlertCircle size={16} className="shrink-0" />
                    <p>{error}</p>
                    <button onClick={() => setError(null)} className="ml-auto font-bold">✕</button>
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">

                {/* Nombre */}
                <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-5">
                    <label className="block text-xs font-black uppercase tracking-widest text-white/40 mb-3">Nombre de la campaña</label>
                    <input
                        value={form.name}
                        onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                        placeholder="Ej: Promo Navidad 2025"
                        required
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/10"
                    />
                </div>

                {/* Bot */}
                <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-5">
                    <label className="block text-xs font-black uppercase tracking-widest text-white/40 mb-3 flex items-center gap-2">
                        <Bot size={12} /> Bot de WhatsApp (solo Baileys)
                    </label>
                    {bots.length === 0 ? (
                        <p className="text-sm text-red-400">No tenés bots Baileys conectados. <Link href="/dashboard/services/whatsapp" className="underline">Crear uno →</Link></p>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {bots.map(b => (
                                <button
                                    key={b.id}
                                    type="button"
                                    onClick={() => setForm(f => ({ ...f, botId: b.id }))}
                                    className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${form.botId === b.id ? 'border-amber-500/60 bg-amber-500/10' : 'border-white/10 bg-white/5 hover:border-white/20'}`}
                                >
                                    <div className={`w-2 h-2 rounded-full shrink-0 ${
                                        botStatuses[b.id] === 'connected' ? 'bg-green-400' :
                                        botStatuses[b.id] === 'connecting' || botStatuses[b.id] === 'qr_ready' ? 'bg-amber-400 animate-pulse' :
                                        'bg-red-400'
                                    }`} />
                                    <div>
                                        <p className="text-sm font-bold text-white">{b.name}</p>
                                        <p className="text-[10px] text-white/30">
                                            {botStatuses[b.id] === 'connected'
                                                ? (b.baileysPhone || 'Conectado')
                                                : botStatuses[b.id] === 'connecting' || botStatuses[b.id] === 'qr_ready'
                                                ? 'Conectando...'
                                                : 'Desconectado'}
                                        </p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Prompt */}
                <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-5">
                    <label className="block text-xs font-black uppercase tracking-widest text-white/40 mb-1 flex items-center gap-2">
                        <Sparkles size={12} /> Prompt para la IA
                    </label>
                    <p className="text-[11px] text-white/25 mb-3">La IA usará esto como base para generar un mensaje único para cada contacto</p>
                    <textarea
                        value={form.prompt}
                        onChange={e => setForm(f => ({ ...f, prompt: e.target.value }))}
                        placeholder="Ej: Promoción especial de fin de año, descuento del 30% en todos nuestros productos, solo por esta semana. Tono cálido y urgente."
                        required
                        rows={4}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/10 resize-none leading-relaxed"
                    />
                </div>

                {/* Archivos multimedia */}
                <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-5">
                    <label className="block text-xs font-black uppercase tracking-widest text-white/40 mb-1 flex items-center gap-2">
                        <ImageIcon size={12} /> Archivos multimedia ({mediaFiles.length})
                    </label>
                    <p className="text-[11px] text-white/25 mb-1">Subí imágenes y/o videos — se rotarán automáticamente entre contactos.</p>
                    <p className="text-[11px] text-white/25 mb-3">
                        {imageCount > 0 && <span className="text-amber-400/70">{imageCount} imagen{imageCount !== 1 ? 'es' : ''}</span>}
                        {imageCount > 0 && videoCount > 0 && <span> · </span>}
                        {videoCount > 0 && <span className="text-purple-400/70">{videoCount} video{videoCount !== 1 ? 's' : ''}</span>}
                        {mediaFiles.length === 0 && <span className="text-white/20">Sin archivos aún</span>}
                    </p>

                    <div className="flex gap-2 flex-wrap">
                        {mediaFiles.map((media, i) => (
                            <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border border-white/10 group">
                                {media.type === 'VIDEO' ? (
                                    <div className="w-full h-full bg-purple-500/10 flex flex-col items-center justify-center">
                                        <Film size={20} className="text-purple-400" />
                                        <span className="text-[8px] text-purple-300 mt-1 truncate max-w-[70px] px-1">{media.file.name}</span>
                                    </div>
                                ) : (
                                    <img src={media.preview} alt="" className="w-full h-full object-cover" />
                                )}
                                <button
                                    type="button"
                                    onClick={() => removeMedia(i)}
                                    className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all"
                                >
                                    <X size={16} className="text-red-400" />
                                </button>
                                <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[9px] font-black px-1 rounded">{i + 1}</span>
                                {media.type === 'VIDEO' && (
                                    <span className="absolute top-1 right-1 bg-purple-500/80 text-white text-[8px] font-bold px-1 rounded">VID</span>
                                )}
                            </div>
                        ))}

                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="w-20 h-20 rounded-xl border-2 border-dashed border-white/15 hover:border-amber-500/40 flex flex-col items-center justify-center gap-1 text-white/30 hover:text-amber-400 transition-all"
                        >
                            <Upload size={16} />
                            <span className="text-[9px] font-bold">Agregar</span>
                        </button>
                    </div>
                    <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={e => handleMediaSelect(e.target.files)} />
                    <p className="text-[10px] text-white/20 mt-2">Imágenes: JPG, PNG, WEBP, GIF (máx 5 MB) · Videos: MP4, MOV, WEBM (máx 64 MB)</p>
                </div>

                {/* Delay */}
                <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-5">
                    <label className="block text-xs font-black uppercase tracking-widest text-white/40 mb-3 flex items-center gap-2">
                        <Clock size={12} /> Delay entre mensajes
                    </label>
                    <div className="flex gap-3">
                        <input
                            type="number"
                            min="1"
                            max="3600"
                            value={form.delayValue}
                            onChange={e => setForm(f => ({ ...f, delayValue: e.target.value }))}
                            className="w-28 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500/50"
                        />
                        <select
                            value={form.delayUnit}
                            onChange={e => setForm(f => ({ ...f, delayUnit: e.target.value }))}
                            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500/50"
                        >
                            <option value="seconds">Segundos</option>
                            <option value="minutes">Minutos</option>
                        </select>
                    </div>
                    <p className="text-[11px] text-white/25 mt-2">
                        Recomendado: mínimo 30 segundos para evitar bloqueos de WhatsApp
                    </p>
                </div>

                {/* Programar */}
                <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-5">
                    <label className="block text-xs font-black uppercase tracking-widest text-white/40 mb-1 flex items-center gap-2">
                        <Calendar size={12} /> Programar envío (opcional)
                    </label>
                    <p className="text-[11px] text-white/25 mb-3">Dejá vacío para enviar manualmente cuando quieras</p>
                    <input
                        type="datetime-local"
                        value={form.scheduledAt}
                        onChange={e => setForm(f => ({ ...f, scheduledAt: e.target.value }))}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500/50"
                        style={{ colorScheme: 'dark' }}
                    />
                </div>

                {/* ── CONTACTOS ── */}
                <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-5">
                    <label className="block text-xs font-black uppercase tracking-widest text-white/40 mb-3 flex items-center gap-2">
                        <Users size={12} /> Contactos ({contacts.length})
                    </label>

                    {/* Source tabs */}
                    <div className="flex gap-2 mb-4">
                        <button
                            type="button"
                            onClick={() => { setContactSource('excel'); setContacts([]); setSelectedLabels([]) }}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all ${contactSource === 'excel' ? 'bg-amber-500/15 border border-amber-500/40 text-amber-400' : 'bg-white/5 border border-white/10 text-white/40 hover:text-white/60'}`}
                        >
                            <Upload size={14} /> Desde Excel
                        </button>
                        <button
                            type="button"
                            onClick={() => { setContactSource('label'); setContacts([]); setExcelFile(null) }}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all ${contactSource === 'label' ? 'bg-amber-500/15 border border-amber-500/40 text-amber-400' : 'bg-white/5 border border-white/10 text-white/40 hover:text-white/60'}`}
                        >
                            <Tag size={14} /> Desde Etiquetas
                        </button>
                    </div>

                    {/* Excel upload */}
                    {contactSource === 'excel' && (
                        <>
                            <p className="text-[11px] text-white/25 mb-3">
                                El Excel debe tener columna <span className="text-amber-400/70">teléfono</span> (obligatorio). <span className="text-amber-400/70">Nombre</span> es opcional.
                            </p>
                            <button
                                type="button"
                                onClick={() => excelInputRef.current?.click()}
                                className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 border-dashed transition-all ${excelFile ? 'border-green-500/40 bg-green-500/5' : 'border-white/15 hover:border-amber-500/40'}`}
                            >
                                {excelFile ? (
                                    <>
                                        <CheckCircle2 size={18} className="text-green-400 shrink-0" />
                                        <div className="text-left">
                                            <p className="text-sm font-bold text-green-400">{excelFile.name}</p>
                                            <p className="text-xs text-white/30">{(excelFile.size / 1024).toFixed(1)} KB</p>
                                        </div>
                                        <button type="button" onClick={e => { e.stopPropagation(); setExcelFile(null); setContacts([]) }} className="ml-auto text-white/30 hover:text-red-400">
                                            <X size={14} />
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <Upload size={18} className="text-white/30 shrink-0" />
                                        <p className="text-sm text-white/30">Seleccionar archivo Excel (.xlsx, .xls, .csv)</p>
                                    </>
                                )}
                            </button>
                            <input ref={excelInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => handleExcelSelect(e.target.files)} />
                            {parsingExcel && (
                                <div className="mt-3 flex items-center gap-2 text-xs text-white/40">
                                    <Loader2 size={12} className="animate-spin" /> Leyendo contactos...
                                </div>
                            )}
                        </>
                    )}

                    {/* Labels */}
                    {contactSource === 'label' && (
                        <>
                            {!form.botId ? (
                                <p className="text-xs text-white/30">Seleccioná un bot primero</p>
                            ) : botStatuses[form.botId] !== 'connected' ? (
                                <p className="text-xs text-red-400/70">El bot debe estar conectado para ver las etiquetas</p>
                            ) : loadingLabels ? (
                                <div className="flex items-center gap-2 text-xs text-white/40">
                                    <Loader2 size={12} className="animate-spin" /> Cargando etiquetas...
                                </div>
                            ) : labels.length === 0 ? (
                                <p className="text-xs text-white/30">No se encontraron etiquetas en esta cuenta de WhatsApp Business</p>
                            ) : (
                                <div className="space-y-2">
                                    <p className="text-[11px] text-white/25">Seleccioná una o varias etiquetas para cargar sus contactos</p>
                                    <div className="flex flex-wrap gap-2">
                                        {labels.map(label => {
                                            const selected = selectedLabels.includes(label.id)
                                            const color = LABEL_COLORS[label.color] || '#64748b'
                                            return (
                                                <button
                                                    key={label.id}
                                                    type="button"
                                                    onClick={() => toggleLabel(label.id)}
                                                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all border ${selected ? 'bg-white/10 border-white/30' : 'bg-white/5 border-white/10 hover:border-white/20'}`}
                                                >
                                                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
                                                    <span className={selected ? 'text-white' : 'text-white/60'}>{label.name}</span>
                                                    <span className="text-[10px] text-white/30 ml-1">{label.contactCount}</span>
                                                    {selected && <CheckCircle2 size={12} className="text-green-400" />}
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {/* Contact list (editable) */}
                    {contacts.length > 0 && (
                        <div className="mt-4">
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-[11px] text-white/30">
                                    <span className="text-green-400 font-bold">{contacts.length} contactos</span> cargados
                                </p>
                                <button
                                    type="button"
                                    onClick={() => setShowAddContact(true)}
                                    className="flex items-center gap-1 text-[11px] text-amber-400/70 hover:text-amber-400 transition-all"
                                >
                                    <Plus size={12} /> Agregar
                                </button>
                            </div>

                            {/* Add manual contact */}
                            {showAddContact && (
                                <div className="flex gap-2 mb-2 p-2 rounded-xl bg-white/5 border border-white/10">
                                    <input
                                        value={newPhone}
                                        onChange={e => setNewPhone(e.target.value)}
                                        placeholder="Teléfono"
                                        className="flex-1 bg-transparent text-xs text-white placeholder-white/20 focus:outline-none px-2"
                                    />
                                    <input
                                        value={newName}
                                        onChange={e => setNewName(e.target.value)}
                                        placeholder="Nombre (opcional)"
                                        className="flex-1 bg-transparent text-xs text-white placeholder-white/20 focus:outline-none px-2"
                                    />
                                    <button type="button" onClick={addManualContact} className="text-green-400 hover:text-green-300">
                                        <CheckCircle2 size={14} />
                                    </button>
                                    <button type="button" onClick={() => { setShowAddContact(false); setNewPhone(''); setNewName('') }} className="text-white/30 hover:text-red-400">
                                        <X size={14} />
                                    </button>
                                </div>
                            )}

                            <div className="max-h-60 overflow-y-auto rounded-xl border border-white/8 divide-y divide-white/5">
                                {contacts.map((c, i) => (
                                    <div key={i} className="flex items-center gap-2 px-3 py-2 group">
                                        {editingIdx === i ? (
                                            <>
                                                <input
                                                    value={editPhone}
                                                    onChange={e => setEditPhone(e.target.value)}
                                                    className="flex-1 bg-white/5 rounded px-2 py-1 text-xs text-white focus:outline-none"
                                                />
                                                <input
                                                    value={editName}
                                                    onChange={e => setEditName(e.target.value)}
                                                    placeholder="Nombre"
                                                    className="flex-1 bg-white/5 rounded px-2 py-1 text-xs text-white placeholder-white/20 focus:outline-none"
                                                />
                                                <button type="button" onClick={saveEdit} className="text-green-400 hover:text-green-300">
                                                    <CheckCircle2 size={13} />
                                                </button>
                                                <button type="button" onClick={() => setEditingIdx(null)} className="text-white/30 hover:text-red-400">
                                                    <X size={13} />
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <Phone size={10} className="text-white/20 shrink-0" />
                                                <p className="text-xs text-white/70 truncate flex-1">
                                                    {c.name ? (
                                                        <><span className="font-bold">{c.name}</span> <span className="text-white/30">{c.phone}</span></>
                                                    ) : (
                                                        <span>{c.phone}</span>
                                                    )}
                                                </p>
                                                <button type="button" onClick={() => startEdit(i)} className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-amber-400 transition-all">
                                                    <Pencil size={12} />
                                                </button>
                                                <button type="button" onClick={() => deleteContact(i)} className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-400 transition-all">
                                                    <Trash2 size={12} />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Submit */}
                <button
                    type="submit"
                    disabled={loading || bots.length === 0}
                    className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-sm font-black uppercase tracking-widest text-white transition-all disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg, #B45309, #D97706, #FFD700)' }}
                >
                    {loading ? (
                        <>
                            <Loader2 size={16} className="animate-spin" />
                            {uploadingImg ? 'Subiendo archivos...' : 'Creando campaña...'}
                        </>
                    ) : (
                        'Crear campaña'
                    )}
                </button>

            </form>
        </div>
    )
}
