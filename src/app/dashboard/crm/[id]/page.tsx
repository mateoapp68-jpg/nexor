'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
    ArrowLeft, Play, Pause, Users, CheckCircle2, XCircle,
    Clock, Loader2, AlertCircle, RefreshCw,
    Image as ImageIcon, Calendar, Smartphone, Wifi, WifiOff, Film, Mic,
    Plus, Pencil, Trash2, Phone, X, Square, Save, Copy, Upload
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
    const [successMsg, setSuccessMsg] = useState<string | null>(null)

    // WhatsApp QR state
    const [waStatus, setWaStatus] = useState<{ status: string; qrBase64?: string; phone?: string }>({ status: 'disconnected' })
    const [waConnecting, setWaConnecting] = useState(false)
    const [availableBots, setAvailableBots] = useState<{ id: string; name: string; baileysPhone: string | null }[]>([])
    const [assigningBot, setAssigningBot] = useState(false)
    const [botAiActive, setBotAiActive] = useState<boolean | null>(null)
    const [togglingAi, setTogglingAi] = useState(false)
    const [activeBotId, setActiveBotId] = useState<string | null>(null)

    // Gestión de contactos
    const [showAddContact, setShowAddContact] = useState(false)
    const [newPhone, setNewPhone] = useState('')
    const [newName, setNewName] = useState('')
    const [addingContact, setAddingContact] = useState(false)
    const [editingContactId, setEditingContactId] = useState<string | null>(null)
    const [editPhone, setEditPhone] = useState('')
    const [editName, setEditName] = useState('')
    const [savingContact, setSavingContact] = useState(false)
    const [deletingContactId, setDeletingContactId] = useState<string | null>(null)

    // Audio recording
    const mediaRecorderRef = useRef<MediaRecorder | null>(null)
    const audioChunksRef = useRef<Blob[]>([])
    const [isRecording, setIsRecording] = useState(false)
    const [recordingSeconds, setRecordingSeconds] = useState(0)
    const [audioError, setAudioError] = useState<string | null>(null)
    const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const [uploadingAudio, setUploadingAudio] = useState(false)

    // Edit mode (nombre, prompt, delay, scheduledAt)
    const [isEditing, setIsEditing] = useState(false)
    const [editForm, setEditForm] = useState({ name: '', prompt: '', delayValue: '30', delayUnit: 'seconds', scheduledAt: '' })
    const [savingEdit, setSavingEdit] = useState(false)

    // Image / audio management
    const imageInputRef = useRef<HTMLInputElement>(null)
    const audioUploadInputRef = useRef<HTMLInputElement>(null)
    const [uploadingImageCount, setUploadingImageCount] = useState(0)
    const [deletingImageId, setDeletingImageId] = useState<string | null>(null)

    // Duplicate
    const [duplicating, setDuplicating] = useState(false)

    useEffect(() => { fetchCampaign(); fetchWaStatus(); fetchAvailableBots() }, [id])

    useEffect(() => {
        if (campaign?.status !== 'RUNNING') return
        const interval = setInterval(fetchCampaign, 4000)
        return () => clearInterval(interval)
    }, [campaign?.status])

    // Polling QR
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
                setActiveBotId(botId)
                if (data.status === 'connected') {
                    setSuccessMsg(`✅ WhatsApp conectado${data.phone ? ` (+${data.phone})` : ''}`)
                    setTimeout(() => setSuccessMsg(null), 4000)
                }
                const botRes = await fetch(`/api/bots/${botId}`)
                if (botRes.ok) {
                    const botData = await botRes.json()
                    setBotAiActive(botData.bot?.status === 'ACTIVE')
                }
                fetchCampaign()
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
            if (res.ok) setWaStatus({ status: 'connecting' })
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
            if (data.campaign?.bot?.status) {
                setBotAiActive(data.campaign.bot.status === 'ACTIVE')
                setActiveBotId(data.campaign.bot.id)
            }
        } catch { setError('Error al cargar') }
        finally { setLoading(false) }
    }

    async function toggleAiResponse() {
        const botId = activeBotId || campaign?.bot?.id
        if (!botId || togglingAi) return
        setTogglingAi(true)
        const newActive = !botAiActive
        try {
            const res = await fetch(`/api/bots/${botId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newActive ? 'ACTIVE' : 'PAUSED' }),
            })
            if (res.ok) setBotAiActive(newActive)
        } catch {
            setError('Error al cambiar estado del agente')
        } finally {
            setTogglingAi(false)
        }
    }

    // ── Edit mode ──
    function startEdit() {
        setEditForm({
            name: campaign.name,
            prompt: campaign.prompt || '',
            delayValue: String(campaign.delayValue),
            delayUnit: campaign.delayUnit,
            scheduledAt: campaign.scheduledAt ? new Date(campaign.scheduledAt).toISOString().slice(0, 16) : '',
        })
        setIsEditing(true)
    }

    async function saveEdit() {
        setSavingEdit(true)
        try {
            const res = await fetch(`/api/crm/campaigns/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editForm),
            })
            if (res.ok) {
                setIsEditing(false)
                setSuccessMsg('Cambios guardados')
                setTimeout(() => setSuccessMsg(null), 3000)
                fetchCampaign()
            } else {
                const data = await res.json()
                setError(data.error || 'Error al guardar')
            }
        } catch { setError('Error al guardar') }
        finally { setSavingEdit(false) }
    }

    // ── Image / media management ──
    async function uploadImageFile(file: File) {
        setUploadingImageCount(c => c + 1)
        try {
            const fd = new FormData()
            fd.append('file', file)
            const res = await fetch(`/api/crm/campaigns/${id}/images`, { method: 'POST', body: fd })
            if (!res.ok) { const data = await res.json(); setError(data.error || 'Error al subir') }
        } catch { setError('Error al subir archivo') }
        finally {
            setUploadingImageCount(c => c - 1)
            fetchCampaign()
        }
    }

    async function deleteImage(imageId: string) {
        setDeletingImageId(imageId)
        try {
            const res = await fetch(`/api/crm/campaigns/${id}/images`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageId }),
            })
            if (res.ok) fetchCampaign()
            else { const data = await res.json(); setError(data.error || 'Error al eliminar') }
        } catch { setError('Error al eliminar archivo') }
        finally { setDeletingImageId(null) }
    }

    // ── Audio ──
    async function uploadAudioFromFile(file: File) {
        setUploadingAudio(true)
        try {
            const fd = new FormData()
            fd.append('file', file)
            const res = await fetch(`/api/crm/campaigns/${id}/images`, { method: 'POST', body: fd })
            if (res.ok) fetchCampaign()
            else { const data = await res.json(); setError(data.error || 'Error al subir audio') }
        } catch { setError('Error al subir audio') }
        finally { setUploadingAudio(false) }
    }

    async function startRecording() {
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
                setAudioError('Permiso denegado. Hacé clic en el ícono 🔒 de la barra del navegador y habilitá el micrófono.')
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
            const recorder = new MediaRecorder(stream, { mimeType })
            audioChunksRef.current = []
            recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
            recorder.onstop = async () => {
                stream.getTracks().forEach(t => t.stop())
                const blob = new Blob(audioChunksRef.current, { type: mimeType })
                const ext = mimeType.includes('ogg') ? 'ogg' : 'webm'
                const file = new File([blob], `audio-${Date.now()}.${ext}`, { type: mimeType.split(';')[0] })
                await uploadAudioFromFile(file)
            }
            recorder.start(100)
            mediaRecorderRef.current = recorder
            setIsRecording(true)
            setRecordingSeconds(0)
            recordingTimerRef.current = setInterval(() => setRecordingSeconds(s => s + 1), 1000)
        } catch (err: unknown) {
            stream.getTracks().forEach(t => t.stop())
            setAudioError('Error al iniciar grabación: ' + (err instanceof Error ? err.message : String(err)))
        }
    }

    function stopRecording() {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop()
        }
        if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
        setIsRecording(false)
        setRecordingSeconds(0)
    }

    // ── Duplicate ──
    async function duplicateCampaign() {
        setDuplicating(true)
        try {
            const res = await fetch(`/api/crm/campaigns/${id}/duplicate`, { method: 'POST' })
            const data = await res.json()
            if (res.ok) {
                router.push(`/dashboard/crm/${data.campaign.id}`)
            } else {
                setError(data.error || 'Error al duplicar')
            }
        } catch { setError('Error al duplicar campaña') }
        finally { setDuplicating(false) }
    }

    // ── Contacts ──
    async function addContact() {
        if (!newPhone.trim()) return
        setAddingContact(true)
        try {
            const res = await fetch(`/api/crm/campaigns/${id}/contacts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: newPhone.trim(), name: newName.trim() || null }),
            })
            if (res.ok) {
                setNewPhone(''); setNewName(''); setShowAddContact(false)
                fetchCampaign()
            } else {
                const data = await res.json()
                setError(data.error || 'Error al agregar contacto')
            }
        } catch { setError('Error al agregar contacto') }
        finally { setAddingContact(false) }
    }

    function startEditContact(c: any) {
        setEditingContactId(c.id)
        setEditPhone(c.phone)
        setEditName(c.name || '')
    }

    async function saveEditContact() {
        if (!editingContactId || !editPhone.trim()) return
        setSavingContact(true)
        try {
            const res = await fetch(`/api/crm/campaigns/${id}/contacts/${editingContactId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: editPhone.trim(), name: editName.trim() || null }),
            })
            if (res.ok) { setEditingContactId(null); fetchCampaign() }
            else { const data = await res.json(); setError(data.error || 'Error al editar') }
        } catch { setError('Error al editar contacto') }
        finally { setSavingContact(false) }
    }

    async function deleteContact(contactId: string) {
        setDeletingContactId(contactId)
        try {
            await fetch(`/api/crm/campaigns/${id}/contacts/${contactId}`, { method: 'DELETE' })
            fetchCampaign()
        } catch { setError('Error al eliminar contacto') }
        finally { setDeletingContactId(null) }
    }

    async function execute() {
        setActionLoading(true)
        setError(null)
        try {
            const res = await fetch(`/api/crm/campaigns/${id}/execute`, { method: 'POST' })
            const data = await res.json()
            if (!res.ok) { setError(data.error); return }
            setCampaign((prev: any) => prev ? { ...prev, status: 'RUNNING' } : prev)
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
    const canEdit = campaign.status !== 'RUNNING'

    const visualFiles = campaign.images?.filter((img: any) => img.type !== 'AUDIO') ?? []
    const audioFiles = campaign.images?.filter((img: any) => img.type === 'AUDIO') ?? []

    return (
        <div className="px-4 md:px-6 pt-6 max-w-screen-xl mx-auto pb-24 text-white">
            {/* Header */}
            <div className="flex items-center gap-4 mb-6">
                <Link href="/dashboard/crm" className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all shrink-0">
                    <ArrowLeft size={16} />
                </Link>
                <div className="flex-1 min-w-0">
                    {isEditing ? (
                        <input
                            value={editForm.name}
                            onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                            className="w-full bg-white/5 border border-amber-500/40 rounded-xl px-3 py-1.5 text-lg font-black text-white focus:outline-none focus:border-amber-500/70"
                        />
                    ) : (
                        <h1 className="text-xl font-black uppercase tracking-tighter truncate">{campaign.name}</h1>
                    )}
                    <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-xs font-bold ${STATUS_COLORS[campaign.status]}`}>
                            {campaign.status === 'RUNNING' && <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse mr-1.5" />}
                            {STATUS_LABELS[campaign.status]}
                        </span>
                        {campaign.bot?.type === 'WHATSAPP_CLOUD' ? (
                            <span className="text-xs font-bold text-green-400">· Cloud API ✓</span>
                        ) : (
                            <span className={`text-xs font-bold ${waStatus.status === 'connected' ? 'text-green-400' : 'text-white/20'}`}>
                                · WA {waStatus.status === 'connected'
                                    ? `✓${waStatus.phone ? ` +${waStatus.phone}` : ''}`
                                    : waStatus.status === 'connecting' || waStatus.status === 'qr_ready'
                                        ? 'conectando...'
                                        : 'desconectado'}
                            </span>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    {isEditing ? (
                        <>
                            <button
                                onClick={saveEdit}
                                disabled={savingEdit}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black text-white bg-amber-600 hover:bg-amber-500 transition-all disabled:opacity-50"
                            >
                                {savingEdit ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                                Guardar
                            </button>
                            <button
                                onClick={() => setIsEditing(false)}
                                className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all text-white/40 hover:text-red-400"
                            >
                                <X size={14} />
                            </button>
                        </>
                    ) : (
                        <>
                            {canEdit && (
                                <button
                                    onClick={startEdit}
                                    className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all text-white/40 hover:text-amber-400"
                                    title="Editar campaña"
                                >
                                    <Pencil size={14} />
                                </button>
                            )}
                            <button onClick={fetchCampaign} className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all">
                                <RefreshCw size={14} />
                            </button>
                        </>
                    )}
                </div>
            </div>

            {successMsg && (
                <div className="mb-5 p-4 bg-green-500/10 border border-green-500/20 rounded-2xl flex gap-3 text-green-400 text-sm">
                    <CheckCircle2 size={16} className="shrink-0" />
                    <p>{successMsg}</p>
                </div>
            )}

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
                                    style={{ width: `${progress}%`, background: 'linear-gradient(90deg, #B45309, #FFD700)' }}
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
                        {isEditing ? (
                            <textarea
                                value={editForm.prompt}
                                onChange={e => setEditForm(f => ({ ...f, prompt: e.target.value }))}
                                rows={5}
                                placeholder="Mensaje que la IA usará como base para cada contacto..."
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-amber-500/50 resize-none leading-relaxed"
                            />
                        ) : (
                            <p className="text-sm text-white/70 leading-relaxed">{campaign.prompt || <span className="text-white/25 italic">Sin prompt</span>}</p>
                        )}
                    </div>

                    {/* Contacts list */}
                    <div className="bg-white/[0.03] border border-white/8 rounded-2xl overflow-hidden">
                        <div className="p-4 border-b border-white/5 flex items-center justify-between">
                            <p className="text-xs font-black uppercase tracking-widest text-white/30 flex items-center gap-2">
                                <Users size={11} /> Contactos
                            </p>
                            <div className="flex items-center gap-3">
                                <span className="text-xs text-white/30">{total} total</span>
                                {!['RUNNING', 'COMPLETED'].includes(campaign.status) && (
                                    <button
                                        type="button"
                                        onClick={() => { setShowAddContact(v => !v); setNewPhone(''); setNewName('') }}
                                        className="flex items-center gap-1.5 text-[11px] font-black text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-lg px-2.5 py-1 hover:bg-amber-400/20 transition-all"
                                    >
                                        <Plus size={11} /> Agregar contacto
                                    </button>
                                )}
                            </div>
                        </div>

                        {showAddContact && (
                            <div className="p-3 border-b border-white/5 bg-white/[0.02] flex gap-2 items-center">
                                <Phone size={12} className="text-white/30 shrink-0" />
                                <input
                                    value={newPhone}
                                    onChange={e => setNewPhone(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && addContact()}
                                    placeholder="Teléfono (+591...)"
                                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-white/20 focus:outline-none focus:border-amber-500/40 min-w-0"
                                />
                                <input
                                    value={newName}
                                    onChange={e => setNewName(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && addContact()}
                                    placeholder="Nombre (opcional)"
                                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-white/20 focus:outline-none focus:border-amber-500/40 min-w-0"
                                />
                                <button
                                    type="button"
                                    onClick={addContact}
                                    disabled={addingContact || !newPhone.trim()}
                                    className="text-green-400 hover:text-green-300 disabled:opacity-40 shrink-0"
                                >
                                    {addingContact ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                                </button>
                                <button type="button" onClick={() => setShowAddContact(false)} className="text-white/30 hover:text-red-400 shrink-0">
                                    <X size={14} />
                                </button>
                            </div>
                        )}

                        <div className="max-h-80 overflow-y-auto">
                            {campaign.contacts?.length === 0 ? (
                                <div className="py-8 text-center">
                                    <p className="text-white/30 text-sm mb-3">Sin contactos cargados</p>
                                    {!['RUNNING', 'COMPLETED'].includes(campaign.status) && !showAddContact && (
                                        <button
                                            type="button"
                                            onClick={() => { setShowAddContact(true); setNewPhone(''); setNewName('') }}
                                            className="inline-flex items-center gap-2 text-xs font-black text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-xl px-4 py-2 hover:bg-amber-400/20 transition-all"
                                        >
                                            <Plus size={12} /> Agregar primer contacto
                                        </button>
                                    )}
                                </div>
                            ) : (
                                campaign.contacts?.map((c: any) => (
                                    <div key={c.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-white/5 last:border-0 group">
                                        {editingContactId === c.id ? (
                                            <>
                                                <input
                                                    value={editPhone}
                                                    onChange={e => setEditPhone(e.target.value)}
                                                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-amber-500/40 min-w-0"
                                                />
                                                <input
                                                    value={editName}
                                                    onChange={e => setEditName(e.target.value)}
                                                    placeholder="Nombre"
                                                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white placeholder-white/20 focus:outline-none focus:border-amber-500/40 min-w-0"
                                                />
                                                <button type="button" onClick={saveEditContact} disabled={savingContact} className="text-green-400 hover:text-green-300 disabled:opacity-40 shrink-0">
                                                    {savingContact ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                                                </button>
                                                <button type="button" onClick={() => setEditingContactId(null)} className="text-white/30 hover:text-red-400 shrink-0">
                                                    <X size={13} />
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <div className={`w-2 h-2 rounded-full shrink-0 ${c.status === 'SENT' ? 'bg-green-400' : c.status === 'FAILED' ? 'bg-red-400' : 'bg-white/20'}`} />
                                                <div className="flex-1 min-w-0">
                                                    {c.name && <p className="text-xs font-bold text-white/80 truncate">{c.name}</p>}
                                                    <p className="text-xs text-white/60">{c.phone}</p>
                                                </div>
                                                {c.status === 'FAILED' && c.error && (
                                                    <p className="text-[10px] text-red-400 truncate max-w-[100px]">{c.error}</p>
                                                )}
                                                {c.sentAt && (
                                                    <p className="text-[10px] text-white/20 shrink-0">
                                                        {new Date(c.sentAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                                                    </p>
                                                )}
                                                {!['RUNNING', 'COMPLETED'].includes(campaign.status) && (
                                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                                                        <button type="button" onClick={() => startEditContact(c)} className="text-white/30 hover:text-amber-400 transition-all">
                                                            <Pencil size={12} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => deleteContact(c.id)}
                                                            disabled={deletingContactId === c.id}
                                                            className="text-white/30 hover:text-red-400 transition-all disabled:opacity-40"
                                                        >
                                                            {deletingContactId === c.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                                                        </button>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* Right col */}
                <div className="space-y-5">

                    {/* WhatsApp connection panel */}
                    <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-5 space-y-3">
                        <p className="text-xs font-black uppercase tracking-widest text-white/30 flex items-center gap-2">
                            <Smartphone size={12} /> WhatsApp
                        </p>

                        {campaign.bot?.type === 'WHATSAPP_CLOUD' ? (
                            // WA Cloud: no necesita QR, siempre "conectado"
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 p-3 rounded-xl bg-green-500/10 border border-green-500/20">
                                    <Wifi size={14} className="text-green-400 shrink-0" />
                                    <div>
                                        <p className="text-xs font-bold text-green-400">Cloud API conectado</p>
                                        <p className="text-[11px] text-white/50 mt-0.5">API oficial de Meta · {campaign.bot.name}</p>
                                    </div>
                                </div>
                            </div>
                        ) : waStatus.status === 'connected' ? (
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 p-3 rounded-xl bg-green-500/10 border border-green-500/20">
                                    <Wifi size={14} className="text-green-400 shrink-0" />
                                    <div>
                                        <p className="text-xs font-bold text-green-400">Conectado</p>
                                        {waStatus.phone && <p className="text-[11px] text-white/60 mt-0.5">📱 +{waStatus.phone}</p>}
                                    </div>
                                </div>
                                {botAiActive !== null && (
                                    <button
                                        type="button"
                                        onClick={toggleAiResponse}
                                        disabled={togglingAi}
                                        className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all disabled:opacity-50"
                                    >
                                        <div className="flex items-center gap-2">
                                            {togglingAi
                                                ? <Loader2 size={13} className="animate-spin text-white/40" />
                                                : <span className="text-sm">{botAiActive ? '🤖' : '🔕'}</span>
                                            }
                                            <div className="text-left">
                                                <p className="text-xs font-bold text-white/80">Respuesta automática</p>
                                                <p className="text-[10px] text-white/35">{botAiActive ? 'Agente responde mensajes' : 'Solo envío, sin respuestas'}</p>
                                            </div>
                                        </div>
                                        <div className={`w-9 h-5 rounded-full transition-all relative ${botAiActive ? 'bg-amber-500' : 'bg-white/15'}`}>
                                            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${botAiActive ? 'left-4' : 'left-0.5'}`} />
                                        </div>
                                    </button>
                                )}
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

                        {/* Duplicar — siempre disponible */}
                        <button
                            onClick={duplicateCampaign}
                            disabled={duplicating}
                            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/50 hover:text-white text-xs font-black transition-all border border-white/10 disabled:opacity-50"
                        >
                            {duplicating ? <Loader2 size={12} className="animate-spin" /> : <Copy size={12} />}
                            Duplicar campaña
                        </button>
                    </div>

                    {/* Config */}
                    <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-5 space-y-3">
                        <p className="text-xs font-black uppercase tracking-widest text-white/30">Configuración</p>
                        {isEditing ? (
                            <div className="space-y-3">
                                <div>
                                    <label className="text-[10px] text-white/40 uppercase font-black tracking-widest mb-1.5 flex items-center gap-1.5"><Clock size={10} /> Delay entre mensajes</label>
                                    <div className="flex gap-2">
                                        <input
                                            type="number"
                                            min="1"
                                            max="3600"
                                            value={editForm.delayValue}
                                            onChange={e => setEditForm(f => ({ ...f, delayValue: e.target.value }))}
                                            className="w-24 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50"
                                        />
                                        <select
                                            value={editForm.delayUnit}
                                            onChange={e => setEditForm(f => ({ ...f, delayUnit: e.target.value }))}
                                            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50"
                                        >
                                            <option value="seconds">Segundos</option>
                                            <option value="minutes">Minutos</option>
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] text-white/40 uppercase font-black tracking-widest mb-1.5 flex items-center gap-1.5"><Calendar size={10} /> Programar (opcional)</label>
                                    <input
                                        type="datetime-local"
                                        value={editForm.scheduledAt}
                                        onChange={e => setEditForm(f => ({ ...f, scheduledAt: e.target.value }))}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50"
                                        style={{ colorScheme: 'dark' }}
                                    />
                                </div>
                            </div>
                        ) : (
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
                        )}
                    </div>

                    {/* Imágenes / videos */}
                    <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-5">
                        <p className="text-xs font-black uppercase tracking-widest text-white/30 mb-3 flex items-center gap-2">
                            <ImageIcon size={12} /> Multimedia ({visualFiles.length})
                        </p>

                        {visualFiles.length > 0 ? (
                            <div className="grid grid-cols-3 gap-2 mb-3">
                                {visualFiles.map((img: any, i: number) => (
                                    <div key={img.id} className="relative aspect-square rounded-xl overflow-hidden border border-white/10 group">
                                        {img.type === 'VIDEO' ? (
                                            <div className="w-full h-full bg-purple-500/10 flex flex-col items-center justify-center">
                                                <Film size={24} className="text-purple-400" />
                                                <span className="text-[9px] text-purple-300 mt-1">Video</span>
                                            </div>
                                        ) : (
                                            <img src={img.url} alt="" className="w-full h-full object-cover" />
                                        )}
                                        <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[9px] font-black px-1.5 py-0.5 rounded">{i + 1}</span>
                                        {img.type === 'VIDEO' && (
                                            <span className="absolute top-1 right-1 bg-purple-500/80 text-white text-[8px] font-bold px-1 rounded">VID</span>
                                        )}
                                        {canEdit && (
                                            <button
                                                onClick={() => deleteImage(img.id)}
                                                disabled={deletingImageId === img.id}
                                                className="absolute top-1 left-1 w-5 h-5 bg-black/80 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all text-red-400 hover:text-red-300 disabled:opacity-60"
                                            >
                                                {deletingImageId === img.id ? <Loader2 size={8} className="animate-spin" /> : <X size={8} />}
                                            </button>
                                        )}
                                    </div>
                                ))}
                                {canEdit && (
                                    <button
                                        onClick={() => imageInputRef.current?.click()}
                                        disabled={uploadingImageCount > 0}
                                        className="aspect-square rounded-xl border-2 border-dashed border-white/15 hover:border-amber-500/40 flex flex-col items-center justify-center gap-1 text-white/30 hover:text-amber-400 transition-all disabled:opacity-50"
                                    >
                                        {uploadingImageCount > 0 ? <Loader2 size={16} className="animate-spin" /> : <><Upload size={14} /><span className="text-[9px] font-bold">Agregar</span></>}
                                    </button>
                                )}
                            </div>
                        ) : canEdit ? (
                            <button
                                onClick={() => imageInputRef.current?.click()}
                                disabled={uploadingImageCount > 0}
                                className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-dashed border-white/15 hover:border-amber-500/40 text-white/30 hover:text-amber-400 transition-all disabled:opacity-50 mb-3"
                            >
                                {uploadingImageCount > 0 ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
                                <span className="text-sm">Agregar imágenes o videos</span>
                            </button>
                        ) : (
                            <p className="text-xs text-white/25 mb-3">Sin multimedia</p>
                        )}

                        {canEdit && (
                            <>
                                <input
                                    ref={imageInputRef}
                                    type="file"
                                    accept="image/*,video/*"
                                    multiple
                                    className="hidden"
                                    onChange={e => {
                                        Array.from(e.target.files || []).forEach(f => uploadImageFile(f))
                                        e.target.value = ''
                                    }}
                                />
                                <p className="text-[10px] text-white/20">JPG, PNG, WEBP, GIF · MP4, MOV, WEBM</p>
                            </>
                        )}
                    </div>

                    {/* Audios */}
                    <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-5">
                        <p className="text-xs font-black uppercase tracking-widest text-white/30 mb-3 flex items-center gap-2">
                            <Mic size={12} /> Audios — nota de voz {audioFiles.length > 0 && `(${audioFiles.length})`}
                        </p>

                        {audioFiles.length > 0 && (
                            <div className="space-y-2 mb-3">
                                {audioFiles.map((audio: any, i: number) => (
                                    <div key={audio.id} className="flex items-center gap-3 p-3 rounded-xl bg-green-500/10 border border-green-500/20 group">
                                        <Mic size={14} className="text-green-400 shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs text-white/60 truncate">{audio.url.split('?')[0].split('/').pop()}</p>
                                        </div>
                                        <span className="text-[10px] text-white/30 shrink-0">#{i + 1}</span>
                                        {canEdit && (
                                            <button
                                                onClick={() => deleteImage(audio.id)}
                                                disabled={deletingImageId === audio.id}
                                                className="text-white/20 hover:text-red-400 transition-all opacity-0 group-hover:opacity-100 shrink-0 disabled:opacity-40"
                                            >
                                                {deletingImageId === audio.id ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        {canEdit && (
                            isRecording ? (
                                <button
                                    type="button"
                                    onClick={stopRecording}
                                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-black animate-pulse"
                                >
                                    <Square size={12} /> Detener grabación ({recordingSeconds}s)
                                </button>
                            ) : uploadingAudio ? (
                                <div className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/5 text-white/40 text-xs">
                                    <Loader2 size={12} className="animate-spin" /> Subiendo audio...
                                </div>
                            ) : (
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={startRecording}
                                        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-black hover:bg-green-500/20 transition-all"
                                    >
                                        <Mic size={12} /> Grabar audio
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => audioUploadInputRef.current?.click()}
                                        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-white/15 hover:border-green-500/40 text-white/30 hover:text-green-400 transition-all text-xs font-black"
                                    >
                                        <Upload size={12} /> Subir audio
                                    </button>
                                </div>
                            )
                        )}

                        {canEdit && (
                            <>
                                {audioError && (
                                    <div className="mt-2 flex items-start gap-2 p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[11px]">
                                        <AlertCircle size={13} className="shrink-0 mt-0.5" />
                                        <span>{audioError}</span>
                                    </div>
                                )}
                                <input
                                    ref={audioUploadInputRef}
                                    type="file"
                                    accept="audio/*"
                                    multiple
                                    className="hidden"
                                    onChange={e => {
                                        Array.from(e.target.files || []).forEach(f => uploadAudioFromFile(f))
                                        e.target.value = ''
                                    }}
                                />
                            </>
                        )}

                        {!canEdit && audioFiles.length === 0 && (
                            <p className="text-xs text-white/25">Sin audios cargados</p>
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
