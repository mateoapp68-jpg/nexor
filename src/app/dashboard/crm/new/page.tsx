'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
    ArrowLeft, Upload, X, Loader2, AlertCircle, CheckCircle2,
    Bot, Clock, Calendar, Users, Sparkles, Image as ImageIcon
} from 'lucide-react'

export default function NewCrmCampaignPage() {
    const router = useRouter()
    const fileInputRef = useRef<HTMLInputElement>(null)
    const excelInputRef = useRef<HTMLInputElement>(null)

    const [bots, setBots] = useState<any[]>([])
    const [form, setForm] = useState({
        name: '',
        botId: '',
        prompt: '',
        delayValue: '30',
        delayUnit: 'seconds',
        scheduledAt: '',
    })
    const [images, setImages] = useState<{ file: File; preview: string }[]>([])
    const [excelFile, setExcelFile] = useState<File | null>(null)
    const [contactsPreview, setContactsPreview] = useState<{ imported: number; errors: number } | null>(null)
    const [loading, setLoading] = useState(false)
    const [uploadingImg, setUploadingImg] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [createdId, setCreatedId] = useState<string | null>(null)

    useEffect(() => { fetchBots() }, [])

    async function fetchBots() {
        const res = await fetch('/api/bots')
        const data = await res.json()
        const baileysBots = (data.bots || []).filter((b: any) => b.type === 'BAILEYS')
        setBots(baileysBots)
        if (baileysBots.length === 1) setForm(f => ({ ...f, botId: baileysBots[0].id }))
    }

    function handleImageSelect(files: FileList | null) {
        if (!files) return
        const remaining = 5 - images.length
        const selected = Array.from(files).slice(0, remaining)
        const newImages = selected.map(file => ({
            file,
            preview: URL.createObjectURL(file),
        }))
        setImages(prev => [...prev, ...newImages])
    }

    function removeImage(index: number) {
        setImages(prev => {
            URL.revokeObjectURL(prev[index].preview)
            return prev.filter((_, i) => i !== index)
        })
    }

    function handleExcelSelect(files: FileList | null) {
        if (!files?.[0]) return
        setExcelFile(files[0])
        setContactsPreview(null)
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError(null)

        if (!form.botId) { setError('Selecciona un bot de WhatsApp'); return }
        if (images.length === 0) { setError('Agrega al menos 1 imagen'); return }
        if (!excelFile) { setError('Carga el archivo Excel con contactos'); return }

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
            setCreatedId(campaignId)

            // 2. Upload images
            setUploadingImg(true)
            for (const img of images) {
                const fd = new FormData()
                fd.append('file', img.file)
                const imgRes = await fetch(`/api/crm/campaigns/${campaignId}/images`, {
                    method: 'POST',
                    body: fd,
                })
                if (!imgRes.ok) {
                    const imgData = await imgRes.json()
                    console.warn('Image upload error:', imgData.error)
                }
            }
            setUploadingImg(false)

            // 3. Upload contacts Excel
            const excelFd = new FormData()
            excelFd.append('file', excelFile)
            const excelRes = await fetch(`/api/crm/campaigns/${campaignId}/contacts`, {
                method: 'POST',
                body: excelFd,
            })
            const excelData = await excelRes.json()
            if (!excelRes.ok) { setError(excelData.error); return }
            setContactsPreview({ imported: excelData.imported, errors: excelData.errors })

            // Done — redirect to campaign detail
            router.push(`/dashboard/crm/${campaignId}`)
        } catch { setError('Error de conexión') }
        finally { setLoading(false); setUploadingImg(false) }
    }

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
                                    <div className={`w-2 h-2 rounded-full ${b.baileysPhone ? 'bg-green-400' : 'bg-red-400'}`} />
                                    <div>
                                        <p className="text-sm font-bold text-white">{b.name}</p>
                                        <p className="text-[10px] text-white/30">{b.baileysPhone || 'Sin conectar'}</p>
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

                {/* Imágenes */}
                <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-5">
                    <label className="block text-xs font-black uppercase tracking-widest text-white/40 mb-1 flex items-center gap-2">
                        <ImageIcon size={12} /> Imágenes ({images.length}/5)
                    </label>
                    <p className="text-[11px] text-white/25 mb-3">Se rotarán automáticamente: contacto 1→img1, contacto 2→img2, etc.</p>

                    <div className="flex gap-2 flex-wrap">
                        {images.map((img, i) => (
                            <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border border-white/10 group">
                                <img src={img.preview} alt="" className="w-full h-full object-cover" />
                                <button
                                    type="button"
                                    onClick={() => removeImage(i)}
                                    className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all"
                                >
                                    <X size={16} className="text-red-400" />
                                </button>
                                <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[9px] font-black px-1 rounded">{i + 1}</span>
                            </div>
                        ))}

                        {images.length < 5 && (
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="w-20 h-20 rounded-xl border-2 border-dashed border-white/15 hover:border-amber-500/40 flex flex-col items-center justify-center gap-1 text-white/30 hover:text-amber-400 transition-all"
                            >
                                <Upload size={16} />
                                <span className="text-[9px] font-bold">Agregar</span>
                            </button>
                        )}
                    </div>
                    <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={e => handleImageSelect(e.target.files)} />
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

                {/* Contactos Excel */}
                <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-5">
                    <label className="block text-xs font-black uppercase tracking-widest text-white/40 mb-1 flex items-center gap-2">
                        <Users size={12} /> Contactos desde Excel
                    </label>
                    <p className="text-[11px] text-white/25 mb-3">
                        El Excel debe tener columnas: <span className="text-amber-400/70">teléfono</span> (obligatorio) y <span className="text-amber-400/70">nombre</span> (opcional).
                        Formatos aceptados: .xlsx, .xls, .csv
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
                                <button type="button" onClick={e => { e.stopPropagation(); setExcelFile(null) }} className="ml-auto text-white/30 hover:text-red-400">
                                    <X size={14} />
                                </button>
                            </>
                        ) : (
                            <>
                                <Upload size={18} className="text-white/30 shrink-0" />
                                <p className="text-sm text-white/30">Seleccionar archivo Excel</p>
                            </>
                        )}
                    </button>
                    <input ref={excelInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => handleExcelSelect(e.target.files)} />
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
                            {uploadingImg ? 'Subiendo imágenes...' : 'Creando campaña...'}
                        </>
                    ) : (
                        'Crear campaña'
                    )}
                </button>

            </form>
        </div>
    )
}
