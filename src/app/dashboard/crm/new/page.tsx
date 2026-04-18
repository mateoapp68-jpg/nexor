'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
    ArrowLeft, Upload, X, Loader2, AlertCircle, CheckCircle2,
    Clock, Calendar, Users, Sparkles, Image as ImageIcon, Film,
    Pencil, Trash2, Plus, Phone, FileText, ChevronDown, Mic, Wifi
} from 'lucide-react'

interface ContactEntry {
    phone: string
    name: string | null
}

interface CrmTemplate {
    id: string
    name: string
    description: string | null
    content: string
    usageCount: number
}

export default function NewCrmCampaignPage() {
    const router = useRouter()
    const fileInputRef = useRef<HTMLInputElement>(null)
    const audioInputRef = useRef<HTMLInputElement>(null)
    const excelInputRef = useRef<HTMLInputElement>(null)

    const [form, setForm] = useState({
        name: '',
        prompt: '',
        messageExample: '',
        delayValue: '30',
        delayUnit: 'seconds',
        scheduledAt: '',
    })
    const [channelType, setChannelType] = useState<'BAILEYS' | 'WHATSAPP_CLOUD'>('BAILEYS')
    const [waCloudBots, setWaCloudBots] = useState<{ id: string; name: string }[]>([])
    const [selectedBotId, setSelectedBotId] = useState('')
    const [waMessageMode, setWaMessageMode] = useState<'ai' | 'template'>('ai')
    const [waTemplates, setWaTemplates] = useState<{ name: string; status: string; bodyText: string; language: string }[]>([])
    const [loadingWaTemplates, setLoadingWaTemplates] = useState(false)
    const [selectedTemplateName, setSelectedTemplateName] = useState('')
    const [selectedTemplateLanguage, setSelectedTemplateLanguage] = useState('es')
    const [mediaFiles, setMediaFiles] = useState<{ file: File; preview: string; type: 'IMAGE' | 'VIDEO' }[]>([])
    const [audioFiles, setAudioFiles] = useState<{ file: File; name: string }[]>([])

    // Audio recording
    const [isRecordingAudio, setIsRecordingAudio] = useState(false)
    const [recordingSeconds, setRecordingSeconds] = useState(0)
    const [audioError, setAudioError] = useState<string | null>(null)
    const mediaRecorderRef = useRef<MediaRecorder | null>(null)
    const audioChunksRef = useRef<Blob[]>([])
    const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

    // Contacts
    const [contacts, setContacts] = useState<ContactEntry[]>([])

    // Excel
    const [excelFile, setExcelFile] = useState<File | null>(null)
    const [parsingExcel, setParsingExcel] = useState(false)

    // Templates
    const [templates, setTemplates] = useState<CrmTemplate[]>([])
    const [showTemplates, setShowTemplates] = useState(false)

    // Edit contact
    const [editingIdx, setEditingIdx] = useState<number | null>(null)
    const [editPhone, setEditPhone] = useState('')
    const [editName, setEditName] = useState('')

    // Add manual contact — siempre visible
    const [showAddContact, setShowAddContact] = useState(false)
    const [newPhone, setNewPhone] = useState('')
    const [newName, setNewName] = useState('')

    const [loading, setLoading] = useState(false)
    const [uploadingImg, setUploadingImg] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => { fetchTemplates(); fetchWaCloudBots() }, [])

    async function fetchWaCloudBots() {
        try {
            const res = await fetch('/api/bots')
            if (res.ok) {
                const data = await res.json()
                const bots = (data.bots ?? []).filter((b: any) => b.type === 'WHATSAPP_CLOUD')
                setWaCloudBots(bots.map((b: any) => ({ id: b.id, name: b.name })))
            }
        } catch { setWaCloudBots([]) }
    }

    async function fetchWaTemplates(botId: string) {
        setLoadingWaTemplates(true)
        setWaTemplates([])
        setSelectedTemplateName('')
        setSelectedTemplateLanguage('es')
        try {
            const res = await fetch(`/api/bots/${botId}/wa-templates`)
            if (res.ok) {
                const data = await res.json()
                const EXCLUDED = ['REJECTED', 'DELETED', 'PENDING_DELETION']
                const approved = (data.templates ?? [])
                    .filter((t: any) => !EXCLUDED.includes(t.status))
                    .map((t: any) => ({
                        name: t.name,
                        status: t.status,
                        language: t.language ?? 'es',
                        bodyText: t.components?.find((c: any) => c.type === 'BODY')?.text ?? '',
                    }))
                setWaTemplates(approved)
            }
        } catch { setWaTemplates([]) }
        finally { setLoadingWaTemplates(false) }
    }

    async function fetchTemplates() {
        try {
            const res = await fetch('/api/crm/templates')
            const data = await res.json()
            setTemplates(data.templates || [])
        } catch { setTemplates([]) }
    }

    function applyTemplate(t: CrmTemplate) {
        setForm(f => ({ ...f, prompt: t.content }))
        setShowTemplates(false)
        // Track usage
        fetch(`/api/crm/templates/${t.id}/use`, { method: 'POST' }).catch(() => {})
    }

    function isVideoFile(file: File): boolean {
        return file.type.startsWith('video/')
    }

    function handleAudioSelect(files: FileList | null) {
        if (!files) return
        const selected = Array.from(files).filter(f => f.type.startsWith('audio/'))
        setAudioFiles(prev => [...prev, ...selected.map(file => ({ file, name: file.name }))])
    }

    function removeAudio(index: number) {
        setAudioFiles(prev => prev.filter((_, i) => i !== index))
    }

    async function startRecordingAudio() {
        setAudioError(null)
        if (!navigator.mediaDevices?.getUserMedia) {
            setAudioError('Grabación no disponible. Usá Chrome/Firefox y asegurate de estar en HTTPS.')
            return
        }
        let stream: MediaStream
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        } catch (err: unknown) {
            const name = err instanceof Error ? err.name : ''
            if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
                setAudioError('Permiso de micrófono denegado. Hacé clic en el ícono 🔒 de la barra del navegador y habilitá el micrófono.')
            } else if (name === 'NotFoundError') {
                setAudioError('No se encontró ningún micrófono en este dispositivo.')
            } else {
                setAudioError('No se pudo acceder al micrófono: ' + (err instanceof Error ? err.message : String(err)))
            }
            return
        }
        try {
            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
                    ? 'audio/ogg;codecs=opus'
                    : 'audio/webm'
            const ext = mimeType.includes('ogg') ? 'ogg' : 'webm'
            const mr = new MediaRecorder(stream, { mimeType })
            audioChunksRef.current = []
            mr.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
            mr.onstop = () => {
                stream.getTracks().forEach(t => t.stop())
                if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
                const blob = new Blob(audioChunksRef.current, { type: mimeType })
                const file = new File([blob], `nota-voz-${Date.now()}.${ext}`, { type: mimeType.split(';')[0] })
                setAudioFiles(prev => [...prev, { file, name: file.name }])
                setIsRecordingAudio(false)
                setRecordingSeconds(0)
            }
            mr.start(100)
            mediaRecorderRef.current = mr
            setIsRecordingAudio(true)
            setRecordingSeconds(0)
            recordingTimerRef.current = setInterval(() => setRecordingSeconds(s => s + 1), 1000)
        } catch (err: unknown) {
            stream.getTracks().forEach(t => t.stop())
            setAudioError('Error al iniciar grabación: ' + (err instanceof Error ? err.message : String(err)))
        }
    }

    function stopRecordingAudio() {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop()
        }
        if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
        setIsRecordingAudio(false)
        setRecordingSeconds(0)
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

        const isTemplateMode = channelType === 'WHATSAPP_CLOUD' && waMessageMode === 'template'
        if (!isTemplateMode && mediaFiles.length === 0 && audioFiles.length === 0) { setError('Agrega al menos 1 archivo (imagen, video o audio)'); return }
        if (isTemplateMode && !selectedTemplateName) { setError('Seleccioná un template de WhatsApp'); return }
        if (contacts.length === 0) { setError('Agrega contactos (desde Excel, etiquetas o manualmente)'); return }
        if (channelType === 'WHATSAPP_CLOUD' && !selectedBotId) { setError('Seleccioná un bot de WhatsApp Cloud'); return }

        setLoading(true)
        try {
            // 1. Create campaign
            const res = await fetch('/api/crm/campaigns', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...form,
                    channelType,
                    ...(channelType === 'WHATSAPP_CLOUD' && { botId: selectedBotId }),
                    ...(channelType === 'WHATSAPP_CLOUD' && waMessageMode === 'template' && selectedTemplateName && {
                        templateName: selectedTemplateName,
                        templateLanguage: selectedTemplateLanguage,
                    }),
                }),
            })
            const data = await res.json()
            if (!res.ok) { setError(data.error); return }
            const campaignId = data.campaign.id

            // 2. Upload media files (images/videos + audios)
            setUploadingImg(true)
            const failedFiles: string[] = []
            const allFilesToUpload = [
                ...mediaFiles.map(m => m.file),
                ...audioFiles.map(a => a.file),
            ]
            for (const file of allFilesToUpload) {
                const fd = new FormData()
                fd.append('file', file)
                const mediaRes = await fetch(`/api/crm/campaigns/${campaignId}/images`, {
                    method: 'POST',
                    body: fd,
                })
                if (!mediaRes.ok) {
                    const mediaData = await mediaRes.json()
                    failedFiles.push(mediaData.error || file.name)
                }
            }
            setUploadingImg(false)
            if (failedFiles.length > 0) {
                setError(`Error subiendo archivos: ${failedFiles.join(', ')}`)
                return
            }

            // 3. Upload contacts (Excel file OR JSON from manual entries)
            if (excelFile) {
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
            } else {
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
            }

            router.push(`/dashboard/crm/${campaignId}`)
        } catch { setError('Error de conexión') }
        finally { setLoading(false); setUploadingImg(false) }
    }

    const imageCount = mediaFiles.filter(m => m.type === 'IMAGE').length
    const videoCount = mediaFiles.filter(m => m.type === 'VIDEO').length
    const audioCount = audioFiles.length
    const isTemplateMode = channelType === 'WHATSAPP_CLOUD' && waMessageMode === 'template'

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

                {/* Canal de envío */}
                <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-5">
                    <label className="block text-xs font-black uppercase tracking-widest text-white/40 mb-3">Canal de envío</label>
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            type="button"
                            onClick={() => setChannelType('BAILEYS')}
                            className={`flex flex-col items-start gap-1 p-4 rounded-xl border-2 transition-all ${channelType === 'BAILEYS' ? 'border-amber-500/60 bg-amber-500/10' : 'border-white/10 bg-white/5 hover:border-white/20'}`}
                        >
                            <span className="text-sm font-black text-white">QR Baileys</span>
                            <span className="text-[11px] text-white/40">Conectá tu número escaneando un QR</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setChannelType('WHATSAPP_CLOUD')}
                            className={`flex flex-col items-start gap-1 p-4 rounded-xl border-2 transition-all ${channelType === 'WHATSAPP_CLOUD' ? 'border-green-500/60 bg-green-500/10' : 'border-white/10 bg-white/5 hover:border-white/20'}`}
                        >
                            <span className="text-sm font-black text-white flex items-center gap-1.5"><Wifi size={13} className="text-green-400" /> WA Cloud API</span>
                            <span className="text-[11px] text-white/40">Usa la API oficial de Meta</span>
                        </button>
                    </div>

                    {channelType === 'WHATSAPP_CLOUD' && (
                        <div className="mt-3">
                            {waCloudBots.length === 0 ? (
                                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2">
                                    <AlertCircle size={14} className="text-amber-400 shrink-0 mt-0.5" />
                                    <p className="text-[11px] text-amber-400">
                                        No tenés bots de WhatsApp Cloud configurados.{' '}
                                        <Link href="/dashboard/services/whatsapp" className="underline">Crear uno →</Link>
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-1.5">
                                    <p className="text-[10px] text-white/30 uppercase font-black tracking-widest mb-2">Seleccioná el bot</p>
                                    {waCloudBots.map(bot => (
                                        <button
                                            key={bot.id}
                                            type="button"
                                            onClick={() => { setSelectedBotId(bot.id); fetchWaTemplates(bot.id) }}
                                            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all ${selectedBotId === bot.id ? 'border-green-500/50 bg-green-500/10 text-green-400' : 'border-white/10 bg-white/5 text-white/60 hover:border-white/20 hover:text-white'}`}
                                        >
                                            <div className="flex items-center gap-2">
                                                <Wifi size={12} className={selectedBotId === bot.id ? 'text-green-400' : 'text-white/30'} />
                                                <span className="text-xs font-bold">{bot.name}</span>
                                            </div>
                                            {selectedBotId === bot.id && <CheckCircle2 size={13} className="text-green-400 shrink-0" />}
                                        </button>
                                    ))}

                                    {/* Modo de mensaje — solo cuando hay un bot seleccionado */}
                                    {selectedBotId && (
                                        <div className="mt-3 pt-3 border-t border-white/8">
                                            <p className="text-[10px] text-white/30 uppercase font-black tracking-widest mb-2">Tipo de mensaje</p>
                                            <div className="grid grid-cols-2 gap-2">
                                                <button type="button" onClick={() => setWaMessageMode('ai')}
                                                    className={`flex flex-col items-start gap-0.5 p-3 rounded-xl border-2 transition-all ${waMessageMode === 'ai' ? 'border-amber-500/60 bg-amber-500/10' : 'border-white/10 bg-white/5 hover:border-white/20'}`}>
                                                    <span className="text-xs font-black text-white flex items-center gap-1.5"><Sparkles size={11} className="text-amber-400" /> IA genera texto</span>
                                                    <span className="text-[10px] text-white/30">Mensaje único por contacto</span>
                                                </button>
                                                <button type="button" onClick={() => setWaMessageMode('template')}
                                                    className={`flex flex-col items-start gap-0.5 p-3 rounded-xl border-2 transition-all ${waMessageMode === 'template' ? 'border-green-500/60 bg-green-500/10' : 'border-white/10 bg-white/5 hover:border-white/20'}`}>
                                                    <span className="text-xs font-black text-white flex items-center gap-1.5"><FileText size={11} className="text-green-400" /> Template Meta</span>
                                                    <span className="text-[10px] text-white/30">Envía a cualquier número</span>
                                                </button>
                                            </div>

                                            {/* Selector de template */}
                                            {waMessageMode === 'template' && (
                                                <div className="mt-3">
                                                    {loadingWaTemplates ? (
                                                        <div className="flex items-center gap-2 p-3 rounded-xl bg-white/5 border border-white/10">
                                                            <Loader2 size={13} className="animate-spin text-white/40" />
                                                            <span className="text-xs text-white/40">Cargando templates...</span>
                                                        </div>
                                                    ) : waTemplates.length === 0 ? (
                                                        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                                                            <p className="text-[11px] text-amber-400">No tenés templates aprobados. <Link href={`/dashboard/services/whatsapp/${selectedBotId}/templates`} className="underline font-bold">Crear uno →</Link></p>
                                                        </div>
                                                    ) : (
                                                        <div className="space-y-1.5">
                                                            <p className="text-[10px] text-white/30 uppercase font-black tracking-widest mb-1">Seleccioná el template</p>
                                                            {waTemplates.map(t => (
                                                                <button key={t.name} type="button" onClick={() => { setSelectedTemplateName(t.name); setSelectedTemplateLanguage(t.language) }}
                                                                    className={`w-full text-left p-3 rounded-xl border transition-all ${selectedTemplateName === t.name ? 'border-green-500/50 bg-green-500/10' : 'border-white/10 bg-white/5 hover:border-white/20'}`}>
                                                                    <div className="flex items-center justify-between mb-1">
                                                                        <code className="text-xs font-bold text-green-400">{t.name}</code>
                                                                        <div className="flex items-center gap-1.5">
                                                                            {t.status !== 'APPROVED' && (
                                                                                <span className="text-[10px] text-amber-400/70 font-bold">{t.status}</span>
                                                                            )}
                                                                            {selectedTemplateName === t.name && <CheckCircle2 size={13} className="text-green-400 shrink-0" />}
                                                                        </div>
                                                                    </div>
                                                                    {t.bodyText && <p className="text-[11px] text-white/50 line-clamp-2">{t.bodyText}</p>}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Prompt + Multimedia + Audios — ocultos en modo template */}
                {!isTemplateMode && (
                  <>
                    <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-5">
                        <div className="flex items-center justify-between mb-1">
                            <label className="text-xs font-black uppercase tracking-widest text-white/40 flex items-center gap-2">
                                <Sparkles size={12} /> Prompt para la IA
                            </label>
                            {templates.length > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setShowTemplates(!showTemplates)}
                                    className="flex items-center gap-1.5 text-[11px] font-bold text-amber-400/70 hover:text-amber-400 transition-all"
                                >
                                    <FileText size={12} />
                                    Usar plantilla
                                    <ChevronDown size={12} className={`transition-transform ${showTemplates ? 'rotate-180' : ''}`} />
                                </button>
                            )}
                        </div>
                        <p className="text-[11px] text-white/25 mb-3">
                            La IA usará esto como base para generar un mensaje único para cada contacto.
                            {audioCount > 0 && <span className="text-amber-400/70"> Si subís audios, no se envía texto — el prompt es opcional.</span>}
                        </p>

                        {showTemplates && templates.length > 0 && (
                            <div className="mb-3 space-y-2 max-h-48 overflow-y-auto rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                                {templates.map(t => (
                                    <button
                                        key={t.id}
                                        type="button"
                                        onClick={() => applyTemplate(t)}
                                        className="w-full text-left p-3 rounded-xl bg-white/5 border border-white/8 hover:border-amber-500/40 hover:bg-amber-500/5 transition-all group"
                                    >
                                        <div className="flex items-center justify-between">
                                            <p className="text-sm font-bold text-white group-hover:text-amber-400 transition-all">{t.name}</p>
                                            <span className="text-[10px] text-white/20">{t.usageCount} usos</span>
                                        </div>
                                        {t.description && <p className="text-[11px] text-white/30 mt-0.5">{t.description}</p>}
                                        <p className="text-[11px] text-white/20 mt-1 line-clamp-2">{t.content.slice(0, 120)}...</p>
                                    </button>
                                ))}
                            </div>
                        )}

                        <textarea
                            value={form.prompt}
                            onChange={e => setForm(f => ({ ...f, prompt: e.target.value }))}
                            placeholder="Ej: Promoción especial de fin de año, descuento del 30% en todos nuestros productos, solo por esta semana. Tono cálido y urgente."
                            required={audioCount === 0}
                            rows={4}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/10 resize-none leading-relaxed"
                        />

                        <div className="mt-4">
                            <label className="block text-xs font-black uppercase tracking-widest text-white/40 mb-1">
                                Ejemplar de mensaje <span className="text-white/20 normal-case font-normal">(opcional)</span>
                            </label>
                            <p className="text-[11px] text-white/25 mb-2">
                                La IA seguirá el estilo, tono y formato de este ejemplo para cada mensaje generado.
                            </p>
                            <textarea
                                value={form.messageExample}
                                onChange={e => setForm(f => ({ ...f, messageExample: e.target.value }))}
                                placeholder="Ej: ¡Hola! 👋 Tenemos una oferta increíble para vos esta semana. No te la perdás 🔥"
                                rows={3}
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/10 resize-none leading-relaxed"
                            />
                        </div>
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
                        <p className="text-[10px] text-white/20 mt-2">Imágenes: JPG, PNG, WEBP, GIF · Videos: MP4, MOV, WEBM</p>
                    </div>

                    {/* Audios */}
                    <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-5">
                        <label className="block text-xs font-black uppercase tracking-widest text-white/40 mb-1 flex items-center gap-2">
                            <Mic size={12} /> Audios — nota de voz ({audioCount})
                        </label>
                        <p className="text-[11px] text-white/25 mb-3">
                            Los audios se envían como <span className="text-green-400/70">nota de voz</span> — aparecen igual que si el usuario los grabara en WhatsApp. Se rotan entre contactos. Si hay audios, <span className="text-amber-400/70">no se envía texto</span>.
                        </p>

                        {audioFiles.length > 0 && (
                            <div className="flex gap-2 flex-wrap mb-3">
                                {audioFiles.map((audio, i) => (
                                    <div key={i} className="relative flex items-center gap-2 px-3 py-2 rounded-xl bg-green-500/10 border border-green-500/20 group">
                                        <Mic size={14} className="text-green-400 shrink-0" />
                                        <span className="text-[11px] text-white/70 max-w-[120px] truncate">{audio.name}</span>
                                        <span className="text-[9px] text-white/30">{(audio.file.size / 1024).toFixed(0)}KB</span>
                                        <button type="button" onClick={() => removeAudio(i)} className="ml-1 text-white/30 hover:text-red-400 transition-all">
                                            <X size={12} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="flex gap-2 flex-wrap">
                            {isRecordingAudio ? (
                                <button
                                    type="button"
                                    onClick={stopRecordingAudio}
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/20 border border-red-500/40 text-red-400 text-xs font-bold animate-pulse"
                                >
                                    <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
                                    Detener · {recordingSeconds}s
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={startRecordingAudio}
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl border border-green-500/30 bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-all text-xs font-bold"
                                >
                                    <Mic size={14} />
                                    Grabar audio
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => audioInputRef.current?.click()}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-dashed border-white/15 hover:border-green-500/40 text-white/30 hover:text-green-400 transition-all text-xs font-bold"
                            >
                                <Upload size={14} />
                                Subir desde local
                            </button>
                        </div>
                        <input ref={audioInputRef} type="file" accept="audio/*" multiple className="hidden" onChange={e => handleAudioSelect(e.target.files)} />
                        {audioError && (
                            <div className="mt-2 flex items-start gap-2 p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[11px]">
                                <AlertCircle size={13} className="shrink-0 mt-0.5" />
                                <span>{audioError}</span>
                            </div>
                        )}
                        <p className="text-[10px] text-white/20 mt-2">Formatos: OGG, MP3, WAV, AAC, M4A · Hasta 20 audios</p>
                    </div>
                  </>
                )}

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
                    <div className="flex items-center justify-between mb-3">
                        <label className="text-xs font-black uppercase tracking-widest text-white/40 flex items-center gap-2">
                            <Users size={12} /> Contactos ({contacts.length})
                        </label>
                        <button
                            type="button"
                            onClick={() => setShowAddContact(v => !v)}
                            className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 transition-all"
                        >
                            <Plus size={12} /> Agregar manual
                        </button>
                    </div>

                    {/* Formulario agregar manual — siempre disponible */}
                    {showAddContact && (
                        <div className="flex gap-2 mb-3 p-3 rounded-xl bg-white/5 border border-amber-500/20">
                            <input
                                value={newPhone}
                                onChange={e => setNewPhone(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addManualContact())}
                                placeholder="Teléfono (+591...)"
                                className="flex-1 bg-transparent text-xs text-white placeholder-white/20 focus:outline-none px-2 border-r border-white/10"
                            />
                            <input
                                value={newName}
                                onChange={e => setNewName(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addManualContact())}
                                placeholder="Nombre (opcional)"
                                className="flex-1 bg-transparent text-xs text-white placeholder-white/20 focus:outline-none px-2"
                            />
                            <button type="button" onClick={addManualContact} className="text-green-400 hover:text-green-300 px-1">
                                <CheckCircle2 size={15} />
                            </button>
                            <button type="button" onClick={() => { setShowAddContact(false); setNewPhone(''); setNewName('') }} className="text-white/30 hover:text-red-400 px-1">
                                <X size={15} />
                            </button>
                        </div>
                    )}

                    <p className="text-[11px] text-white/25 mb-3">
                        Subí un Excel con tus contactos. Tip: podés exportar contactos desde WhatsApp Web con nuestra <Link href="/dashboard/crm/export" className="text-amber-400 underline">extensión de Chrome</Link>.
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
                                    <p className="text-xs text-white/30">{(excelFile.size / 1024).toFixed(1)} KB · <span className="text-white/20">Columnas: teléfono · nombre</span></p>
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

                    {/* Contact list (editable) */}
                    {contacts.length > 0 && (
                        <div className="mt-4">
                            <p className="text-[11px] text-white/30 mb-2">
                                <span className="text-green-400 font-bold">{contacts.length} contactos</span> cargados
                            </p>
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
                                                <div className="flex-1 min-w-0">
                                                    {c.name && <p className="text-xs font-bold text-white/80 truncate">{c.name}</p>}
                                                    <p className="text-xs text-white/60">{c.phone}</p>
                                                </div>
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

                    {contacts.length === 0 && !parsingExcel && (
                        <p className="mt-3 text-[11px] text-white/20 text-center">
                            Sin contactos — subí un Excel o agregá manualmente
                        </p>
                    )}
                </div>

                {/* Submit */}
                <button
                    type="submit"
                    disabled={loading}
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
