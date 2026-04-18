'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Plus, Trash2, Loader2, CheckCircle2, Clock,
  XCircle, RefreshCw, Sparkles, Image as ImageIcon, Film,
  FileText, Phone, Globe, X, ChevronDown, ChevronUp, Copy,
  MessageSquare, Eye, Upload, Link,
} from 'lucide-react'

type HeaderType = 'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT'
type ButtonType = 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER' | 'COPY_CODE'

interface TemplateButton {
  type: ButtonType
  text: string
  url?: string
  phone_number?: string
  example?: string
}

interface WaTemplate {
  id: string
  name: string
  status: string
  language: string
  category: string
  components: Array<{ type: string; text?: string; format?: string; buttons?: TemplateButton[] }>
}

const STATUS_META: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  APPROVED:        { label: 'Aprobado',         color: 'text-green-400',  icon: CheckCircle2 },
  PENDING:         { label: 'En revisión',       color: 'text-amber-400',  icon: Clock },
  REJECTED:        { label: 'Rechazado',         color: 'text-red-400',    icon: XCircle },
  PAUSED:          { label: 'Pausado',           color: 'text-white/40',   icon: XCircle },
  PENDING_DELETION:{ label: 'Eliminando...',     color: 'text-white/30',   icon: Clock },
}

const BUTTON_TYPE_META: Record<ButtonType, { label: string; icon: typeof Plus; color: string }> = {
  QUICK_REPLY:  { label: 'Respuesta rápida', icon: MessageSquare, color: 'text-blue-400' },
  URL:          { label: 'Visitar sitio web', icon: Globe,         color: 'text-purple-400' },
  PHONE_NUMBER: { label: 'Llamar al número', icon: Phone,         color: 'text-green-400' },
  COPY_CODE:    { label: 'Copiar código',    icon: Copy,          color: 'text-amber-400' },
}

const HEADER_OPTIONS: { value: HeaderType; label: string; icon: typeof ImageIcon }[] = [
  { value: 'NONE',     label: 'Ninguno',    icon: FileText },
  { value: 'TEXT',     label: 'Texto',      icon: FileText },
  { value: 'IMAGE',    label: 'Imagen',     icon: ImageIcon },
  { value: 'VIDEO',    label: 'Vídeo',      icon: Film },
  { value: 'DOCUMENT', label: 'Documento',  icon: FileText },
]

const LANGUAGES: { value: string; label: string }[] = [
  { value: 'es',    label: 'Español' },
  { value: 'es_AR', label: 'Español (Argentina)' },
  { value: 'es_MX', label: 'Español (México)' },
  { value: 'es_ES', label: 'Español (España)' },
  { value: 'en_US', label: 'English (US)' },
  { value: 'en_GB', label: 'English (UK)' },
  { value: 'pt_BR', label: 'Português (Brasil)' },
  { value: 'pt_PT', label: 'Português (Portugal)' },
]

const emptyButton = (): TemplateButton => ({ type: 'QUICK_REPLY', text: '' })

// ── Preview Component ──────────────────────────────────────────────────────────
function TemplatePreview({
  headerType, headerText, headerMediaUrl,
  bodyText, footerText, buttons,
}: {
  headerType: HeaderType
  headerText: string
  headerMediaUrl: string
  bodyText: string
  footerText: string
  buttons: TemplateButton[]
}) {
  const hasContent = bodyText || (headerType !== 'NONE') || footerText || buttons.length > 0

  return (
    <div className="sticky top-6">
      <div className="flex items-center gap-2 mb-3">
        <Eye className="w-4 h-4 text-white/30" />
        <span className="text-xs font-black uppercase tracking-widest text-white/30">Vista previa</span>
      </div>

      {/* Phone mockup */}
      <div className="rounded-3xl border-2 border-white/10 bg-[#111827] overflow-hidden max-w-[300px] mx-auto">
        {/* WA top bar */}
        <div className="bg-[#128C7E] px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold text-white">N</div>
          <div>
            <p className="text-white text-xs font-bold">Nexor Bot</p>
            <p className="text-white/60 text-[10px]">en línea</p>
          </div>
        </div>

        {/* Chat area */}
        <div className="bg-[#0B141A] min-h-[200px] p-3 space-y-1">
          {!hasContent ? (
            <p className="text-white/20 text-xs text-center mt-8">Tu plantilla aparecerá aquí</p>
          ) : (
            <div className="flex flex-col items-end gap-0.5">
              {/* Bubble */}
              <div className="max-w-[220px] w-full rounded-2xl rounded-tr-sm overflow-hidden shadow-lg" style={{ background: '#005C4B' }}>
                {/* Header */}
                {headerType === 'TEXT' && headerText && (
                  <div className="px-3 pt-2.5 pb-1">
                    <p className="text-white text-xs font-bold leading-snug">{headerText}</p>
                  </div>
                )}
                {headerType === 'IMAGE' && (
                  <div className="w-full h-28 bg-white/10 flex items-center justify-center">
                    {headerMediaUrl ? (
                      <img src={headerMediaUrl} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                    ) : (
                      <ImageIcon className="w-8 h-8 text-white/20" />
                    )}
                  </div>
                )}
                {headerType === 'VIDEO' && (
                  <div className="w-full h-28 bg-white/10 flex items-center justify-center">
                    <Film className="w-8 h-8 text-white/20" />
                    <span className="text-white/30 text-[10px] ml-1">Vídeo</span>
                  </div>
                )}
                {headerType === 'DOCUMENT' && (
                  <div className="w-full h-14 bg-white/10 flex items-center gap-2 px-3">
                    <FileText className="w-6 h-6 text-white/40 shrink-0" />
                    <span className="text-white/50 text-[10px]">Documento adjunto</span>
                  </div>
                )}

                {/* Body */}
                {bodyText && (
                  <div className="px-3 py-2">
                    <p className="text-white text-[11px] leading-relaxed whitespace-pre-wrap">{bodyText}</p>
                  </div>
                )}

                {/* Footer + timestamp */}
                <div className="px-3 pb-2 flex items-end justify-between gap-2">
                  {footerText && <p className="text-white/40 text-[10px] leading-tight flex-1">{footerText}</p>}
                  <span className="text-white/30 text-[10px] shrink-0 ml-auto">
                    {new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })} ✓✓
                  </span>
                </div>
              </div>

              {/* Buttons */}
              {buttons.length > 0 && (
                <div className="max-w-[220px] w-full space-y-0.5">
                  {buttons.map((btn, i) => (
                    <div key={i} className="rounded-xl py-2 px-3 text-center text-[11px] font-bold flex items-center justify-center gap-1.5" style={{ background: '#005C4B' }}>
                      {btn.type === 'URL'          && <Globe className="w-3 h-3 text-blue-300" />}
                      {btn.type === 'PHONE_NUMBER' && <Phone className="w-3 h-3 text-green-300" />}
                      {btn.type === 'COPY_CODE'    && <Copy  className="w-3 h-3 text-amber-300" />}
                      {btn.type === 'QUICK_REPLY'  && <MessageSquare className="w-3 h-3 text-blue-300" />}
                      <span className="text-white">{btn.text || `Botón ${i + 1}`}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function WaTemplatesPage() {
  const { botId } = useParams<{ botId: string }>()
  const router = useRouter()

  const [templates, setTemplates]     = useState<WaTemplate[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [showForm, setShowForm]       = useState(false)
  const [saving, setSaving]           = useState(false)
  const [saveError, setSaveError]     = useState<string | null>(null)
  const [deletingName, setDeletingName] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Form state
  const [name, setName]               = useState('')
  const [category, setCategory]       = useState('MARKETING')
  const [language, setLanguage]       = useState('es')
  const [headerType, setHeaderType]   = useState<HeaderType>('NONE')
  const [headerText, setHeaderText]   = useState('')
  const [headerMediaUrl, setHeaderMediaUrl] = useState('')
  const [mediaInputMode, setMediaInputMode] = useState<'url' | 'upload'>('upload')
  const [uploadingMedia, setUploadingMedia] = useState(false)
  const [uploadedFileName, setUploadedFileName] = useState('')
  const mediaFileRef = useRef<HTMLInputElement>(null)
  const [bodyText, setBodyText]       = useState('')
  const [footerText, setFooterText]   = useState('')
  const [buttons, setButtons]         = useState<TemplateButton[]>([])

  async function loadTemplates() {
    setLoading(true); setError(null)
    try {
      const res  = await fetch(`/api/bots/${botId}/wa-templates`)
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      setTemplates(data.templates ?? [])
    } catch { setError('Error de conexión') }
    finally   { setLoading(false) }
  }

  useEffect(() => { loadTemplates() }, [botId])

  function resetForm() {
    setName(''); setCategory('MARKETING'); setLanguage('es')
    setHeaderType('NONE'); setHeaderText(''); setHeaderMediaUrl('')
    setMediaInputMode('upload'); setUploadedFileName('')
    setBodyText(''); setFooterText(''); setButtons([])
    setShowAdvanced(false); setSaveError(null)
  }

  async function handleMediaUpload(file: File) {
    setUploadingMedia(true)
    setSaveError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/bots/${botId}/template-media`, { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { setSaveError(data.error); return }
      setHeaderMediaUrl(data.url)
      setUploadedFileName(file.name)
    } catch { setSaveError('Error al subir el archivo') }
    finally  { setUploadingMedia(false) }
  }

  function insertVar() {
    const nextNum = (bodyText.match(/\{\{\d+\}\}/g) ?? []).length + 1
    setBodyText(t => t + `{{${nextNum}}}`)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaveError(null)
    if (!bodyText.trim()) { setSaveError('El cuerpo es requerido'); return }
    if (buttons.some(b => !b.text.trim() && b.type !== 'COPY_CODE')) { setSaveError('Todos los botones deben tener texto'); return }
    if (buttons.some(b => b.type === 'URL' && !b.url?.trim())) { setSaveError('Los botones URL necesitan una URL'); return }
    if (buttons.some(b => b.type === 'PHONE_NUMBER' && !b.phone_number?.trim())) { setSaveError('Los botones de teléfono necesitan un número'); return }

    setSaving(true)
    try {
      const res = await fetch(`/api/bots/${botId}/wa-templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, category, language, bodyText,
          headerType: headerType === 'NONE' ? undefined : headerType,
          headerText: headerType === 'TEXT' ? headerText : undefined,
          headerMediaUrl: ['IMAGE','VIDEO','DOCUMENT'].includes(headerType) ? headerMediaUrl : undefined,
          footerText: footerText || undefined,
          buttons: buttons.length > 0 ? buttons : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setSaveError(data.error); return }
      setShowForm(false); resetForm(); await loadTemplates()
    } catch { setSaveError('Error de conexión') }
    finally   { setSaving(false) }
  }

  async function handleDelete(tplName: string) {
    if (!confirm(`¿Eliminar "${tplName}"?`)) return
    setDeletingName(tplName)
    try {
      const res = await fetch(`/api/bots/${botId}/wa-templates?name=${encodeURIComponent(tplName)}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(`Error al eliminar: ${data.error ?? 'Error desconocido'}`)
        return
      }
      setTemplates(prev => prev.filter(t => t.name !== tplName))
    } catch {
      alert('Error de conexión al eliminar la plantilla')
    } finally {
      setDeletingName(null)
    }
  }

  function addButton() {
    if (buttons.length >= 10) return
    setButtons(prev => [...prev, emptyButton()])
  }
  function updateButton(i: number, patch: Partial<TemplateButton>) {
    setButtons(prev => prev.map((b, idx) => idx === i ? { ...b, ...patch } : b))
  }
  function removeButton(i: number) {
    setButtons(prev => prev.filter((_, idx) => idx !== i))
  }

  function getBodyText(t: WaTemplate)   { return t.components?.find(c => c.type === 'BODY')?.text ?? '' }
  function getHeaderText(t: WaTemplate) { return t.components?.find(c => c.type === 'HEADER')?.text ?? '' }
  function getHeaderFormat(t: WaTemplate) { return t.components?.find(c => c.type === 'HEADER')?.format ?? '' }
  function getButtons(t: WaTemplate)    { return t.components?.find(c => c.type === 'BUTTONS')?.buttons ?? [] }

  const headerIcon: Record<string, string> = { IMAGE: '🖼️', VIDEO: '🎬', DOCUMENT: '📄', TEXT: '✏️' }

  return (
    <div className="px-4 sm:px-6 pt-6 max-w-screen-xl mx-auto pb-20">

      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => router.back()} className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-white/5 transition-colors">
          <ArrowLeft className="w-4 h-4 text-white/50" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-medium text-white tracking-widest uppercase">Templates de WhatsApp</h1>
          <p className="text-xs text-white/30 mt-0.5">Creá y gestioná tus plantillas aprobadas por Meta</p>
        </div>
        <button onClick={loadTemplates} className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-white/5">
          <RefreshCw className={`w-4 h-4 text-white/40 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <button onClick={() => { setShowForm(true); resetForm() }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-black"
          style={{ background: 'linear-gradient(135deg, #FFD700, #FFB800)' }}>
          <Plus className="w-4 h-4" /> Nueva plantilla
        </button>
      </div>

      <div className="h-px w-full mb-6" style={{ background: 'linear-gradient(90deg, rgba(255,215,0,0.3), transparent)' }} />

      {/* WABA ID error */}
      {error?.includes('WABA') && (
        <div className="rounded-2xl p-5 border border-amber-500/20 bg-amber-500/5 mb-6">
          <p className="text-sm text-amber-400 font-bold mb-1">WABA ID no configurado</p>
          <p className="text-xs text-white/40">Andá a <strong className="text-white/60">Credenciales</strong> y guardá el WhatsApp Business Account ID.</p>
        </div>
      )}

      {/* ── Formulario ───────────────────────────────────────────────────────── */}
      {showForm && (
        <div className="rounded-2xl border border-amber-500/20 bg-[#0B0B12]/80 overflow-hidden mb-8">
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-black uppercase tracking-widest text-amber-400">Nueva plantilla</h2>
            </div>
            <button onClick={() => { setShowForm(false); resetForm() }} className="text-white/30 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleCreate}>
            {/* Two-column layout: form | preview */}
            <div className="grid lg:grid-cols-[1fr_300px] gap-0">

              {/* Left: form */}
              <div className="p-6 space-y-6 border-r border-white/5">

                {/* Nombre + Categoría + Idioma */}
                <div className="grid sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-1">
                    <label className="block text-xs text-white/40 mb-1.5 font-bold uppercase tracking-widest">Nombre</label>
                    <input value={name}
                      onChange={e => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                      placeholder="promo_evento_2026" required maxLength={512}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-amber-500/50" />
                    <p className="text-[10px] text-white/20 mt-1">{name.length}/512 · solo letras, números y _</p>
                  </div>
                  <div>
                    <label className="block text-xs text-white/40 mb-1.5 font-bold uppercase tracking-widest">Categoría</label>
                    <select value={category} onChange={e => setCategory(e.target.value)}
                      className="w-full bg-[#0B0B12] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50">
                      <option value="MARKETING">Marketing</option>
                      <option value="UTILITY">Utilidad</option>
                      <option value="AUTHENTICATION">Autenticación</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-white/40 mb-1.5 font-bold uppercase tracking-widest">Idioma</label>
                    <select value={language} onChange={e => setLanguage(e.target.value)}
                      className="w-full bg-[#0B0B12] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50">
                      {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                    </select>
                  </div>
                </div>

                {/* Encabezado */}
                <div>
                  <label className="block text-xs text-white/40 mb-2 font-bold uppercase tracking-widest">
                    Tipo de encabezado <span className="text-white/20 normal-case font-normal">(opcional)</span>
                  </label>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {HEADER_OPTIONS.map(opt => (
                      <button key={opt.value} type="button" onClick={() => { setHeaderType(opt.value); setHeaderMediaUrl(''); setUploadedFileName(''); setMediaInputMode('upload') }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${headerType === opt.value ? 'border-amber-500/60 bg-amber-500/10 text-amber-400' : 'border-white/10 bg-white/5 text-white/40 hover:text-white/70'}`}>
                        <opt.icon className="w-3 h-3" /> {opt.label}
                      </button>
                    ))}
                  </div>
                  {headerType === 'TEXT' && (
                    <div>
                      <input value={headerText} onChange={e => setHeaderText(e.target.value)}
                        placeholder="Ej: 🎟️ Renzo Entradas — Evento 2026" maxLength={60}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-amber-500/50" />
                      <p className="text-[10px] text-white/20 mt-1">{headerText.length}/60</p>
                    </div>
                  )}
                  {['IMAGE','VIDEO','DOCUMENT'].includes(headerType) && (
                    <div className="space-y-2">
                      {/* Toggle upload / URL */}
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setMediaInputMode('upload')}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${mediaInputMode === 'upload' ? 'border-amber-500/60 bg-amber-500/10 text-amber-400' : 'border-white/10 bg-white/5 text-white/40 hover:text-white/70'}`}>
                          <Upload className="w-3 h-3" /> Subir archivo
                        </button>
                        <button type="button" onClick={() => setMediaInputMode('url')}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${mediaInputMode === 'url' ? 'border-amber-500/60 bg-amber-500/10 text-amber-400' : 'border-white/10 bg-white/5 text-white/40 hover:text-white/70'}`}>
                          <Link className="w-3 h-3" /> Usar URL
                        </button>
                      </div>

                      {mediaInputMode === 'upload' ? (
                        <div>
                          <input
                            ref={mediaFileRef}
                            type="file"
                            className="hidden"
                            accept={headerType === 'IMAGE' ? 'image/jpeg,image/png,image/webp' : headerType === 'VIDEO' ? 'video/mp4,video/quicktime' : 'application/pdf'}
                            onChange={e => { if (e.target.files?.[0]) handleMediaUpload(e.target.files[0]) }}
                          />
                          {uploadedFileName && headerMediaUrl ? (
                            <div className="flex items-center gap-2 p-3 rounded-xl bg-green-500/10 border border-green-500/20">
                              <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-green-400 font-bold truncate">{uploadedFileName}</p>
                                <p className="text-[10px] text-white/30 truncate">{headerMediaUrl}</p>
                              </div>
                              <button type="button" onClick={() => { setHeaderMediaUrl(''); setUploadedFileName('') }}
                                className="text-white/30 hover:text-red-400 shrink-0"><X className="w-3.5 h-3.5" /></button>
                            </div>
                          ) : (
                            <button type="button" onClick={() => mediaFileRef.current?.click()} disabled={uploadingMedia}
                              className="w-full flex items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed border-white/15 hover:border-amber-500/40 text-white/40 hover:text-amber-400 transition-all disabled:opacity-50">
                              {uploadingMedia
                                ? <><Loader2 className="w-4 h-4 animate-spin" /> Subiendo...</>
                                : <><Upload className="w-4 h-4" />
                                    {headerType === 'IMAGE' ? 'Seleccionar imagen (JPG, PNG, WEBP · máx 5 MB)' :
                                     headerType === 'VIDEO' ? 'Seleccionar video (MP4 · máx 16 MB)' :
                                     'Seleccionar PDF (máx 100 MB)'}</>
                              }
                            </button>
                          )}
                        </div>
                      ) : (
                        <div>
                          <input value={headerMediaUrl} onChange={e => { setHeaderMediaUrl(e.target.value); setUploadedFileName('') }}
                            placeholder={headerType === 'IMAGE' ? 'https://... URL de la imagen' : headerType === 'VIDEO' ? 'https://... URL del vídeo' : 'https://... URL del PDF'}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-amber-500/50" />
                          <p className="text-[10px] text-white/25 mt-1">La URL debe ser pública y accesible por Meta</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Cuerpo */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs text-white/40 font-bold uppercase tracking-widest">
                      Texto del mensaje
                    </label>
                    <button type="button" onClick={() => insertVar()}
                      className="flex items-center gap-1 text-[11px] font-bold text-amber-400/70 hover:text-amber-400 transition-colors">
                      <Plus className="w-3 h-3" /> Añadir variable
                    </button>
                  </div>
                  <p className="text-[11px] text-white/25 mb-2">Usá {'{{1}}'}, {'{{2}}'} etc. para variables personalizadas por contacto.</p>
                  <textarea value={bodyText} onChange={e => setBodyText(e.target.value)}
                    placeholder="¡Hola! 👋 Tenemos una oferta especial para vos esta semana. No te la perdás 🔥" required rows={5}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-amber-500/50 resize-none" />
                  <p className="text-[10px] text-white/20 mt-1">{bodyText.length}/1024</p>
                </div>

                {/* Avanzado: pie + botones */}
                <div>
                  <button type="button" onClick={() => setShowAdvanced(!showAdvanced)}
                    className="flex items-center gap-2 text-xs text-white/40 hover:text-white/70 transition-colors font-bold uppercase tracking-widest">
                    {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    Pie de página y botones
                  </button>

                  {showAdvanced && (
                    <div className="mt-4 space-y-5">

                      {/* Pie */}
                      <div>
                        <label className="block text-xs text-white/40 mb-1.5 font-bold uppercase tracking-widest">
                          Pie de página <span className="text-white/20 normal-case font-normal">(opcional)</span>
                        </label>
                        <input value={footerText} onChange={e => setFooterText(e.target.value)}
                          placeholder="Respondé STOP para darte de baja" maxLength={60}
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-amber-500/50" />
                        <p className="text-[10px] text-white/20 mt-1">{footerText.length}/60</p>
                      </div>

                      {/* Botones */}
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <label className="text-xs text-white/40 font-bold uppercase tracking-widest">
                              Botones <span className="text-white/20 normal-case font-normal">({buttons.length}/10)</span>
                            </label>
                            {buttons.length > 3 && (
                              <p className="text-[10px] text-amber-400/70 mt-0.5">Más de 3 botones se muestran como lista en WhatsApp</p>
                            )}
                          </div>
                          {buttons.length < 10 && (
                            <button type="button" onClick={addButton}
                              className="flex items-center gap-1 text-[11px] font-bold text-amber-400 hover:text-amber-300 transition-colors px-3 py-1.5 rounded-lg border border-amber-500/20 hover:border-amber-500/40">
                              <Plus className="w-3 h-3" /> Agregar botón
                            </button>
                          )}
                        </div>

                        <div className="space-y-3">
                          {buttons.map((btn, i) => (
                            <div key={i} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2.5">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-white/20 font-bold w-4 shrink-0">{i + 1}</span>
                                <select value={btn.type}
                                  onChange={e => updateButton(i, { type: e.target.value as ButtonType, url: '', phone_number: '', example: '' })}
                                  className="bg-[#0B0B12] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none flex-shrink-0">
                                  {(Object.entries(BUTTON_TYPE_META) as [ButtonType, { label: string }][]).map(([v, m]) => (
                                    <option key={v} value={v}>{m.label}</option>
                                  ))}
                                </select>
                                {btn.type !== 'COPY_CODE' && (
                                  <input value={btn.text} onChange={e => updateButton(i, { text: e.target.value })}
                                    placeholder="Texto del botón" maxLength={25}
                                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/20 focus:outline-none focus:border-amber-500/40" />
                                )}
                                <button type="button" onClick={() => removeButton(i)} className="text-white/20 hover:text-red-400 transition-colors ml-auto">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>

                              {btn.type === 'URL' && (
                                <input value={btn.url ?? ''} onChange={e => updateButton(i, { url: e.target.value })}
                                  placeholder="https://tu-sitio.com" type="url"
                                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/20 focus:outline-none focus:border-amber-500/40" />
                              )}
                              {btn.type === 'PHONE_NUMBER' && (
                                <input value={btn.phone_number ?? ''} onChange={e => updateButton(i, { phone_number: e.target.value })}
                                  placeholder="+59172794224"
                                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/20 focus:outline-none focus:border-amber-500/40" />
                              )}
                              {btn.type === 'COPY_CODE' && (
                                <div>
                                  <p className="text-[10px] text-white/30 mb-1.5">El cliente toca este botón para copiar el código al portapapeles.</p>
                                  <input value={btn.example ?? ''} onChange={e => updateButton(i, { example: e.target.value, text: 'Copiar código' })}
                                    placeholder="Ej: PROMO2026 (código de ejemplo para revisión)"
                                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/20 focus:outline-none focus:border-amber-500/40" />
                                </div>
                              )}
                            </div>
                          ))}

                          {buttons.length === 0 && (
                            <p className="text-[11px] text-white/20 py-2">Sin botones — podés agregar hasta 10.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {saveError && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                    {saveError}
                  </div>
                )}

                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={() => { setShowForm(false); resetForm() }}
                    className="flex-1 py-2.5 rounded-xl text-sm text-white/50 border border-white/10 hover:bg-white/5 transition-all">
                    Cancelar
                  </button>
                  <button type="submit" disabled={saving}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold text-black flex items-center justify-center gap-2 disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg, #FFD700, #FFB800)' }}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    {saving ? 'Enviando a Meta...' : 'Enviar a revisión'}
                  </button>
                </div>
              </div>

              {/* Right: preview */}
              <div className="p-6 bg-white/[0.01]">
                <TemplatePreview
                  headerType={headerType}
                  headerText={headerText}
                  headerMediaUrl={headerMediaUrl}
                  bodyText={bodyText}
                  footerText={footerText}
                  buttons={buttons}
                />
              </div>
            </div>
          </form>
        </div>
      )}

      {/* ── Lista de templates ─────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-amber-400" /></div>
      ) : error && !error.includes('WABA') ? (
        <div className="rounded-2xl p-5 border border-red-500/20 bg-red-500/5">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      ) : templates.length === 0 ? (
        <div className="rounded-2xl p-12 border border-white/5 bg-white/[0.02] flex flex-col items-center text-center">
          <Sparkles className="w-8 h-8 text-white/10 mb-3" />
          <p className="text-sm text-white/30">No tenés plantillas creadas aún</p>
          <p className="text-xs text-white/20 mt-1">Creá una arriba — Meta la revisa en minutos</p>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map(t => {
            const status     = STATUS_META[t.status] ?? { label: t.status, color: 'text-white/40', icon: Clock }
            const StatusIcon = status.icon
            const body       = getBodyText(t)
            const header     = getHeaderText(t)
            const format     = getHeaderFormat(t)
            const btns       = getButtons(t)
            return (
              <div key={t.id} className="rounded-2xl p-5 border border-white/8 bg-white/[0.03]">
                <div className="flex gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <code className="text-sm font-bold text-amber-400">{t.name}</code>
                      <span className={`flex items-center gap-1 text-xs font-bold ${status.color}`}>
                        <StatusIcon className="w-3 h-3" />{status.label}
                      </span>
                      <span className="text-[10px] text-white/20 uppercase tracking-widest">{t.category}</span>
                      <span className="text-[10px] text-white/20">{t.language}</span>
                      {format && <span className="text-[10px] text-white/30">{headerIcon[format] ?? ''} {format}</span>}
                    </div>
                    {header && <p className="text-xs text-white/60 font-bold mb-1">{header}</p>}
                    {body   && <p className="text-sm text-white/70 leading-relaxed line-clamp-3">{body}</p>}
                    {btns.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {btns.map((b: TemplateButton, i: number) => (
                          <span key={i} className="text-[11px] px-2.5 py-1 rounded-lg border border-white/15 text-white/50 bg-white/5 flex items-center gap-1">
                            {b.type === 'URL'          && <Globe className="w-2.5 h-2.5" />}
                            {b.type === 'PHONE_NUMBER' && <Phone className="w-2.5 h-2.5" />}
                            {b.type === 'COPY_CODE'    && <Copy  className="w-2.5 h-2.5" />}
                            {b.type === 'QUICK_REPLY'  && '↩️ '}
                            {b.text || 'Copiar código'}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <button onClick={() => handleDelete(t.name)} disabled={deletingName === t.name}
                    className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-red-500/10 text-white/20 hover:text-red-400 transition-all shrink-0 disabled:opacity-40">
                    {deletingName === t.name ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
