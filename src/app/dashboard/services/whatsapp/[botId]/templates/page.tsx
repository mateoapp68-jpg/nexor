'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Plus, Trash2, Loader2, CheckCircle2, Clock,
  XCircle, RefreshCw, Sparkles, Image as ImageIcon, Film,
  FileText, Phone, Globe, X, ChevronDown, ChevronUp,
} from 'lucide-react'

type HeaderType = 'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT'
type ButtonType = 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER'

interface TemplateButton {
  type: ButtonType
  text: string
  url?: string
  phone_number?: string
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
  APPROVED: { label: 'Aprobado',    color: 'text-green-400',  icon: CheckCircle2 },
  PENDING:  { label: 'En revisión', color: 'text-amber-400',  icon: Clock },
  REJECTED: { label: 'Rechazado',   color: 'text-red-400',    icon: XCircle },
  PAUSED:   { label: 'Pausado',     color: 'text-white/40',   icon: XCircle },
}

const HEADER_OPTIONS: { value: HeaderType; label: string; icon: typeof ImageIcon }[] = [
  { value: 'NONE',     label: 'Sin encabezado', icon: FileText },
  { value: 'TEXT',     label: 'Texto',          icon: FileText },
  { value: 'IMAGE',    label: 'Imagen',         icon: ImageIcon },
  { value: 'VIDEO',    label: 'Video',          icon: Film },
  { value: 'DOCUMENT', label: 'Documento',      icon: FileText },
]

const BUTTON_TYPE_META: Record<ButtonType, { label: string; icon: typeof Plus }> = {
  QUICK_REPLY:  { label: 'Respuesta rápida', icon: Sparkles },
  URL:          { label: 'URL',              icon: Globe },
  PHONE_NUMBER: { label: 'Teléfono',         icon: Phone },
}

const emptyButton = (): TemplateButton => ({ type: 'QUICK_REPLY', text: '' })

export default function WaTemplatesPage() {
  const { botId } = useParams<{ botId: string }>()
  const router = useRouter()

  const [templates, setTemplates] = useState<WaTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Form state
  const [name, setName]               = useState('')
  const [category, setCategory]       = useState('MARKETING')
  const [language, setLanguage]       = useState('es')
  const [headerType, setHeaderType]   = useState<HeaderType>('NONE')
  const [headerText, setHeaderText]   = useState('')
  const [headerMediaUrl, setHeaderMediaUrl] = useState('')
  const [bodyText, setBodyText]       = useState('')
  const [footerText, setFooterText]   = useState('')
  const [buttons, setButtons]         = useState<TemplateButton[]>([])
  const [showAdvanced, setShowAdvanced] = useState(false)

  const [deletingName, setDeletingName] = useState<string | null>(null)

  async function loadTemplates() {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/bots/${botId}/wa-templates`)
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      setTemplates(data.templates ?? [])
    } catch { setError('Error de conexión') }
    finally { setLoading(false) }
  }

  useEffect(() => { loadTemplates() }, [botId])

  function resetForm() {
    setName(''); setCategory('MARKETING'); setLanguage('es')
    setHeaderType('NONE'); setHeaderText(''); setHeaderMediaUrl('')
    setBodyText(''); setFooterText(''); setButtons([])
    setShowAdvanced(false); setSaveError(null)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaveError(null)
    if (!bodyText.trim()) { setSaveError('El cuerpo del mensaje es requerido'); return }
    if (buttons.some(b => !b.text.trim())) { setSaveError('Todos los botones deben tener texto'); return }
    if (buttons.some(b => b.type === 'URL' && !b.url?.trim())) { setSaveError('Los botones de URL necesitan una URL'); return }
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
      setShowForm(false); resetForm()
      await loadTemplates()
    } catch { setSaveError('Error de conexión') }
    finally { setSaving(false) }
  }

  async function handleDelete(tplName: string) {
    if (!confirm(`¿Eliminar el template "${tplName}"?`)) return
    setDeletingName(tplName)
    try {
      await fetch(`/api/bots/${botId}/wa-templates?name=${encodeURIComponent(tplName)}`, { method: 'DELETE' })
      setTemplates(prev => prev.filter(t => t.name !== tplName))
    } finally { setDeletingName(null) }
  }

  function addButton() {
    if (buttons.length >= 3) return
    setButtons(prev => [...prev, emptyButton()])
  }
  function updateButton(i: number, patch: Partial<TemplateButton>) {
    setButtons(prev => prev.map((b, idx) => idx === i ? { ...b, ...patch } : b))
  }
  function removeButton(i: number) {
    setButtons(prev => prev.filter((_, idx) => idx !== i))
  }

  function getBodyText(t: WaTemplate) { return t.components?.find(c => c.type === 'BODY')?.text ?? '' }
  function getHeaderText(t: WaTemplate) { return t.components?.find(c => c.type === 'HEADER')?.text ?? '' }
  function getHeaderFormat(t: WaTemplate) { return t.components?.find(c => c.type === 'HEADER')?.format ?? '' }
  function getButtons(t: WaTemplate) { return t.components?.find(c => c.type === 'BUTTONS')?.buttons ?? [] }

  const headerIcon: Record<string, string> = { IMAGE: '🖼️', VIDEO: '🎬', DOCUMENT: '📄', TEXT: '✏️' }

  return (
    <div className="px-4 sm:px-6 pt-6 max-w-screen-xl mx-auto pb-20 space-y-6">

      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => router.back()} className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-white/5 transition-colors">
          <ArrowLeft className="w-4 h-4 text-white/50" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-medium text-white tracking-widest uppercase">Templates de WhatsApp</h1>
          <p className="text-xs text-white/30 mt-0.5">Creá y gestioná tus plantillas aprobadas por Meta</p>
        </div>
        <button onClick={loadTemplates} className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-white/5 transition-colors">
          <RefreshCw className={`w-4 h-4 text-white/40 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <button onClick={() => { setShowForm(true); resetForm() }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-black transition-all"
          style={{ background: 'linear-gradient(135deg, #FFD700, #FFB800)' }}>
          <Plus className="w-4 h-4" /> Nuevo template
        </button>
      </div>

      <div className="h-px w-full" style={{ background: 'linear-gradient(90deg, rgba(255,215,0,0.3), transparent)' }} />

      {/* Error WABA ID */}
      {error?.includes('WABA ID') && (
        <div className="rounded-2xl p-5 border border-amber-500/20 bg-amber-500/5">
          <p className="text-sm text-amber-400 font-bold mb-1">WABA ID no configurado</p>
          <p className="text-xs text-white/40">Andá a <strong className="text-white/60">Servicios → WhatsApp → Credenciales</strong> y guardá el WhatsApp Business Account ID.</p>
        </div>
      )}

      {/* ── Formulario ── */}
      {showForm && (
        <div className="rounded-2xl border border-amber-500/20 bg-[#0B0B12]/80 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-black uppercase tracking-widest text-amber-400">Nuevo template</h2>
            </div>
            <button onClick={() => { setShowForm(false); resetForm() }} className="text-white/30 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleCreate} className="p-6 space-y-5">

            {/* Nombre + categoría + idioma */}
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="sm:col-span-1">
                <label className="block text-xs text-white/40 mb-1.5">Nombre <span className="text-white/20">(solo letras, números y _)</span></label>
                <input value={name} onChange={e => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                  placeholder="promo_evento_2026" required
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-amber-500/50" />
              </div>
              <div>
                <label className="block text-xs text-white/40 mb-1.5">Categoría</label>
                <select value={category} onChange={e => setCategory(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50">
                  <option value="MARKETING">Marketing</option>
                  <option value="UTILITY">Utilidad</option>
                  <option value="AUTHENTICATION">Autenticación</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-white/40 mb-1.5">Idioma</label>
                <select value={language} onChange={e => setLanguage(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50">
                  <option value="es">Español</option>
                  <option value="es_AR">Español (AR)</option>
                  <option value="en_US">English (US)</option>
                  <option value="pt_BR">Português (BR)</option>
                </select>
              </div>
            </div>

            {/* Encabezado */}
            <div>
              <label className="block text-xs text-white/40 mb-2">Tipo de encabezado</label>
              <div className="flex flex-wrap gap-2 mb-3">
                {HEADER_OPTIONS.map(opt => (
                  <button key={opt.value} type="button" onClick={() => setHeaderType(opt.value)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${headerType === opt.value ? 'border-amber-500/60 bg-amber-500/10 text-amber-400' : 'border-white/10 bg-white/5 text-white/40 hover:text-white hover:border-white/20'}`}>
                    <opt.icon className="w-3 h-3" /> {opt.label}
                  </button>
                ))}
              </div>
              {headerType === 'TEXT' && (
                <input value={headerText} onChange={e => setHeaderText(e.target.value)}
                  placeholder="Ej: 🎟️ Renzo Entradas" maxLength={60}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-amber-500/50" />
              )}
              {['IMAGE','VIDEO','DOCUMENT'].includes(headerType) && (
                <div>
                  <input value={headerMediaUrl} onChange={e => setHeaderMediaUrl(e.target.value)}
                    placeholder={headerType === 'IMAGE' ? 'https://... (URL de la imagen)' : headerType === 'VIDEO' ? 'https://... (URL del video)' : 'https://... (URL del documento PDF)'}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-amber-500/50" />
                  <p className="text-[10px] text-white/25 mt-1">La URL debe ser pública y accesible por Meta. Podés subir el archivo primero.</p>
                </div>
              )}
            </div>

            {/* Cuerpo */}
            <div>
              <label className="block text-xs text-white/40 mb-1.5">
                Cuerpo del mensaje <span className="text-white/20">(usá {'{{1}}'}, {'{{2}}'} para variables)</span>
              </label>
              <textarea value={bodyText} onChange={e => setBodyText(e.target.value)}
                placeholder="¡Hola! 👋 Tenemos entradas disponibles para el próximo evento. ¿Te interesa?" required rows={4}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-amber-500/50 resize-none" />
              <p className="text-[10px] text-white/25 mt-1">{bodyText.length}/1024 caracteres</p>
            </div>

            {/* Avanzado: pie + botones */}
            <div>
              <button type="button" onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-2 text-xs text-white/40 hover:text-white/70 transition-colors">
                {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                Pie de página y botones (opcional)
              </button>

              {showAdvanced && (
                <div className="mt-4 space-y-5">
                  {/* Pie */}
                  <div>
                    <label className="block text-xs text-white/40 mb-1.5">Pie de página</label>
                    <input value={footerText} onChange={e => setFooterText(e.target.value)}
                      placeholder="Ej: Respondé STOP para darte de baja" maxLength={60}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-amber-500/50" />
                  </div>

                  {/* Botones */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs text-white/40">Botones <span className="text-white/20">(máximo 3)</span></label>
                      {buttons.length < 3 && (
                        <button type="button" onClick={addButton}
                          className="flex items-center gap-1 text-[11px] font-bold text-amber-400 hover:text-amber-300 transition-colors">
                          <Plus className="w-3 h-3" /> Agregar botón
                        </button>
                      )}
                    </div>
                    <div className="space-y-3">
                      {buttons.map((btn, i) => (
                        <div key={i} className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
                          <div className="flex items-center gap-2">
                            <select value={btn.type} onChange={e => updateButton(i, { type: e.target.value as ButtonType, url: '', phone_number: '' })}
                              className="bg-[#0B0B12]/80 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none">
                              {(Object.entries(BUTTON_TYPE_META) as [ButtonType, { label: string }][]).map(([v, m]) => (
                                <option key={v} value={v}>{m.label}</option>
                              ))}
                            </select>
                            <input value={btn.text} onChange={e => updateButton(i, { text: e.target.value })}
                              placeholder="Texto del botón" maxLength={20}
                              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/20 focus:outline-none focus:border-amber-500/40" />
                            <button type="button" onClick={() => removeButton(i)} className="text-white/20 hover:text-red-400 transition-colors">
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
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {saveError && <p className="text-xs text-red-400">{saveError}</p>}

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => { setShowForm(false); resetForm() }}
                className="flex-1 py-2.5 rounded-xl text-sm text-white/50 border border-white/10 hover:bg-white/5 transition-all">
                Cancelar
              </button>
              <button type="submit" disabled={saving}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-black flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
                style={{ background: 'linear-gradient(135deg, #FFD700, #FFB800)' }}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {saving ? 'Enviando a Meta...' : 'Enviar a revisión'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Lista de templates ── */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-amber-400" /></div>
      ) : error && !error.includes('WABA ID') ? (
        <div className="rounded-2xl p-5 border border-red-500/20 bg-red-500/5">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      ) : templates.length === 0 ? (
        <div className="rounded-2xl p-10 border border-white/5 bg-white/[0.02] flex flex-col items-center text-center">
          <Sparkles className="w-8 h-8 text-white/10 mb-3" />
          <p className="text-sm text-white/30">No tenés templates creados aún</p>
          <p className="text-xs text-white/20 mt-1">Creá uno arriba y Meta lo revisará en minutos</p>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map(t => {
            const status = STATUS_META[t.status] ?? { label: t.status, color: 'text-white/40', icon: Clock }
            const StatusIcon = status.icon
            const body = getBodyText(t)
            const header = getHeaderText(t)
            const format = getHeaderFormat(t)
            const btns = getButtons(t)
            return (
              <div key={t.id} className="rounded-2xl p-5 border border-white/8 bg-white/[0.03]">
                <div className="flex gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <code className="text-sm font-bold text-amber-400">{t.name}</code>
                      <span className={`flex items-center gap-1 text-xs font-bold ${status.color}`}>
                        <StatusIcon className="w-3 h-3" />{status.label}
                      </span>
                      <span className="text-[10px] text-white/20 uppercase tracking-widest">{t.category}</span>
                      <span className="text-[10px] text-white/20">{t.language}</span>
                    </div>
                    {format && format !== 'TEXT' && (
                      <p className="text-xs text-white/30 mb-1">{headerIcon[format] ?? ''} Encabezado {format.toLowerCase()}</p>
                    )}
                    {header && <p className="text-xs text-white/50 font-bold mb-1">{header}</p>}
                    {body && <p className="text-sm text-white/70 leading-relaxed">{body}</p>}
                    {btns.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {btns.map((b: TemplateButton, i: number) => (
                          <span key={i} className="text-[11px] px-2.5 py-1 rounded-lg border border-white/15 text-white/50 bg-white/5">
                            {b.type === 'URL' ? '🔗' : b.type === 'PHONE_NUMBER' ? '📞' : '↩️'} {b.text}
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
