'use client'
import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { Send, Calendar, History, BarChart2, Zap, Image, Video, Sparkles, Wand2, FileText, Trash2, Plus, Loader2, CheckCircle, XCircle, Clock, ExternalLink } from 'lucide-react'

const NETWORKS = [
    { id: 'FACEBOOK', label: 'Facebook', icon: '📘', color: '#1877F2', supportsText: true, supportsImage: true, supportsVideo: true, supportsStory: true },
    { id: 'INSTAGRAM', label: 'Instagram', icon: '📸', color: '#E1306C', supportsText: false, supportsImage: true, supportsVideo: true, supportsStory: true },
    { id: 'TIKTOK', label: 'TikTok', icon: '🎵', color: '#010101', supportsText: false, supportsImage: false, supportsVideo: true, supportsStory: false },
    { id: 'YOUTUBE', label: 'YouTube', icon: '▶️', color: '#FF0000', supportsText: false, supportsImage: false, supportsVideo: true, supportsStory: false },
]

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
    PUBLISHED: { label: 'Publicado', color: '#00FF88', icon: CheckCircle },
    SCHEDULED: { label: 'Programado', color: '#00BFFF', icon: Clock },
    FAILED: { label: 'Fallido', color: '#FF4444', icon: XCircle },
    PARTIAL: { label: 'Parcial', color: '#FFA500', icon: CheckCircle },
    PUBLISHING: { label: 'Publicando...', color: '#888', icon: Loader2 },
    DRAFT: { label: 'Borrador', color: '#888', icon: FileText },
}

function toBold(text: string): string {
    const boldMap: Record<string, string> = { 'a':'𝗮','b':'𝗯','c':'𝗰','d':'𝗱','e':'𝗲','f':'𝗳','g':'𝗴','h':'𝗵','i':'𝗶','j':'𝗷','k':'𝗸','l':'𝗹','m':'𝗺','n':'𝗻','o':'𝗼','p':'𝗽','q':'𝗾','r':'𝗿','s':'𝘀','t':'𝘁','u':'𝘂','v':'𝘃','w':'𝘄','x':'𝘅','y':'𝘆','z':'𝘇','A':'𝗔','B':'𝗕','C':'𝗖','D':'𝗗','E':'𝗘','F':'𝗙','G':'𝗚','H':'𝗛','I':'𝗜','J':'𝗝','K':'𝗞','L':'𝗟','M':'𝗠','N':'𝗡','O':'𝗢','P':'𝗣','Q':'𝗤','R':'𝗥','S':'𝗦','T':'𝗧','U':'𝗨','V':'𝗩','W':'𝗪','X':'𝗫','Y':'𝗬','Z':'𝗭' }
    return text.split('').map(c => boldMap[c] || c).join('')
}

export default function SocialPage() {
    const searchParams = useSearchParams()
    const [tab, setTab] = useState<'create' | 'calendar' | 'history' | 'metrics' | 'connections'>('create')
    const [connections, setConnections] = useState<any[]>([])
    const [posts, setPosts] = useState<any[]>([])
    const [metrics, setMetrics] = useState<any>(null)
    const [usageLimits, setUsageLimits] = useState<{ limits: any; scheduledCount: number; monthlyCount: number } | null>(null)
    const [loading, setLoading] = useState(false)
    const [aiLoading, setAiLoading] = useState(false)

    // Create form state
    const [content, setContent] = useState('')
    const [mediaUrl, setMediaUrl] = useState<string | null>(null)
    const [mediaType, setMediaType] = useState<string | null>(null)
    const [postType, setPostType] = useState<'feed' | 'story'>('feed')
    const [selectedNetworks, setSelectedNetworks] = useState<string[]>([])
    const [scheduledAt, setScheduledAt] = useState('')
    const [fbPages, setFbPages] = useState<any[]>([]) // páginas FB + cuentas IG vinculadas
    const [fbPagesLoading, setFbPagesLoading] = useState(false)
    const [fbPagesError, setFbPagesError] = useState('')
    const [pageSelections, setPageSelections] = useState<Record<string, any>>({})
    // pageSelections: { FACEBOOK?: { pageId, pageAccessToken, pageName }, INSTAGRAM?: { accountId, pageAccessToken, username } }
    const [topic, setTopic] = useState('')
    const [script, setScript] = useState('')
    const [scriptTopic, setScriptTopic] = useState('')
    const [scriptModal, setScriptModal] = useState(false)
    const [scriptLoading, setScriptLoading] = useState(false)
    const [uploadingMedia, setUploadingMedia] = useState(false)
    const [publishResult, setPublishResult] = useState<any>(null)
    const [error, setError] = useState('')

    const fileRef = useRef<HTMLInputElement>(null)
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    useEffect(() => {
        loadConnections()
        loadPosts()
        const connected = searchParams.get('connected')
        const err = searchParams.get('error')
        if (connected) { setError(''); loadConnections() }
        if (err) setError(decodeURIComponent(err))
    }, [])

    async function loadConnections() {
        const res = await fetch('/api/social/connections')
        const data = await res.json()
        setConnections(data.connections || [])
    }

    async function loadPosts(status?: string) {
        const qs = status ? `?status=${status}` : ''
        const res = await fetch(`/api/social/posts${qs}`)
        const data = await res.json()
        setPosts(data.posts || [])
        if (data.limits) setUsageLimits({ limits: data.limits, scheduledCount: data.scheduledCount, monthlyCount: data.monthlyCount })
    }

    async function loadMetrics() {
        const res = await fetch('/api/social/metrics')
        const data = await res.json()
        setMetrics(data)
    }

    useEffect(() => {
        if (tab === 'history') loadPosts()
        if (tab === 'calendar') loadPosts('SCHEDULED')
        if (tab === 'metrics') loadMetrics()
    }, [tab])

    async function toggleNetwork(networkId: string) {
        const willSelect = !selectedNetworks.includes(networkId)
        setSelectedNetworks(prev => prev.includes(networkId) ? prev.filter(x => x !== networkId) : [...prev, networkId])

        // Cargar páginas FB/IG la primera vez que se selecciona cualquiera de las dos
        if (willSelect && (networkId === 'FACEBOOK' || networkId === 'INSTAGRAM') && fbPages.length === 0 && !fbPagesLoading) {
            setFbPagesLoading(true)
            setFbPagesError('')
            try {
                const res = await fetch('/api/social/facebook/pages')
                const data = await res.json()
                if (res.ok) {
                    setFbPages(data.pages || [])
                } else {
                    setFbPagesError(data.error || 'Error al cargar páginas')
                }
            } catch (e: any) {
                setFbPagesError(e.message || 'Error de conexión')
            }
            setFbPagesLoading(false)
        }
    }

    async function handleUpload(file: File) {
        setUploadingMedia(true)
        const fd = new FormData()
        fd.append('file', file)
        const res = await fetch('/api/social/upload', { method: 'POST', body: fd })
        const data = await res.json()
        setUploadingMedia(false)
        if (!res.ok) { setError(data.error); return }
        setMediaUrl(data.mediaUrl)
        setMediaType(data.mediaType)
    }

    async function handleAI(action: string) {
        setAiLoading(true)
        setError('')
        const res = await fetch('/api/social/ai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, content, topic, networks: selectedNetworks })
        })
        const data = await res.json()
        setAiLoading(false)
        if (!res.ok) { setError(data.error); return }
        if (action === 'script') setScript(data.result)
        else setContent(data.result)
    }

    function insertBold() {
        const ta = textareaRef.current
        if (!ta) return
        const start = ta.selectionStart
        const end = ta.selectionEnd
        const selected = content.slice(start, end)
        if (!selected) return
        const bold = toBold(selected)
        setContent(content.slice(0, start) + bold + content.slice(end))
    }

    async function handlePublish() {
        setError('')
        setPublishResult(null)
        if (!content.trim()) { setError('Escribe el contenido del post'); return }
        if (!selectedNetworks.length) { setError('Selecciona al menos una red social'); return }
        setLoading(true)
        const res = await fetch('/api/social/posts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content, mediaUrl, mediaType, postType, scheduledAt: scheduledAt || null, networks: selectedNetworks, pageSelections })
        })
        const data = await res.json()
        setLoading(false)
        if (!res.ok) { setError(data.error); return }
        setPublishResult(data)
        setContent(''); setMediaUrl(null); setMediaType(null); setScheduledAt('')
        // Refresh usage counters
        loadPosts()
    }

    async function handleGenerateScript() {
        if (!scriptTopic.trim()) return
        setScriptLoading(true)
        const res = await fetch('/api/social/ai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'script', topic: scriptTopic, content: '', networks: [] })
        })
        const data = await res.json()
        setScriptLoading(false)
        if (!res.ok) { setError(data.error); return }
        setScript(data.result)
    }

    async function handleDeletePost(id: string) {
        await fetch(`/api/social/posts/${id}`, { method: 'DELETE' })
        loadPosts()
    }

    const connectedNetworks = connections.map(c => c.network)
    const networkConnected = (id: string) => connectedNetworks.includes(id)

    return (
        <div className="p-4 md:p-6 max-w-5xl mx-auto">
            {/* Header */}
            <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="min-w-0">
                    <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
                        <Send size={22} className="text-neon-green flex-shrink-0" /> Publicador Social
                    </h1>
                    <p className="text-dark-400 text-xs sm:text-sm mt-1">Publica en Facebook, Instagram, TikTok y YouTube</p>
                </div>
                <button onClick={() => { setScript(''); setScriptTopic(''); setScriptModal(true) }}
                    className="flex items-center gap-2 px-3 py-2 sm:px-4 rounded-xl bg-blue-500/15 text-blue-300 border border-blue-500/30 hover:bg-blue-500/25 transition-all text-sm font-medium whitespace-nowrap self-start flex-shrink-0">
                    <FileText size={14} /> Guión de video
                </button>
            </div>

            {error && (
                <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{error}</div>
            )}

            {/* Usage limits bar */}
            {usageLimits && (
                <div className="mb-5 grid grid-cols-2 gap-3">
                    <div className="glass-panel p-3 rounded-xl border border-white/10">
                        <div className="flex items-center justify-between mb-1.5">
                            <span className="text-dark-400 text-xs">Publicaciones este mes</span>
                            <span className="text-white text-xs font-semibold">{usageLimits.monthlyCount} / {usageLimits.limits.monthlyPosts}</span>
                        </div>
                        <div className="w-full bg-white/10 rounded-full h-1.5">
                            <div className="h-1.5 rounded-full transition-all"
                                style={{
                                    width: `${Math.min(100, (usageLimits.monthlyCount / usageLimits.limits.monthlyPosts) * 100)}%`,
                                    background: usageLimits.monthlyCount >= usageLimits.limits.monthlyPosts ? '#FF4444' : '#00FF88'
                                }} />
                        </div>
                    </div>
                    <div className="glass-panel p-3 rounded-xl border border-white/10">
                        <div className="flex items-center justify-between mb-1.5">
                            <span className="text-dark-400 text-xs">Programadas activas</span>
                            <span className="text-white text-xs font-semibold">{usageLimits.scheduledCount} / {usageLimits.limits.scheduledSlots}</span>
                        </div>
                        <div className="w-full bg-white/10 rounded-full h-1.5">
                            <div className="h-1.5 rounded-full transition-all"
                                style={{
                                    width: `${Math.min(100, (usageLimits.scheduledCount / usageLimits.limits.scheduledSlots) * 100)}%`,
                                    background: usageLimits.scheduledCount >= usageLimits.limits.scheduledSlots ? '#FF4444' : '#00BFFF'
                                }} />
                        </div>
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
                {[
                    { id: 'create', label: 'Crear', icon: Plus },
                    { id: 'calendar', label: 'Programados', icon: Calendar },
                    { id: 'history', label: 'Historial', icon: History },
                    { id: 'metrics', label: 'Métricas', icon: BarChart2 },
                    { id: 'connections', label: 'Cuentas', icon: Zap },
                ].map(t => (
                    <button key={t.id} onClick={() => setTab(t.id as any)}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${tab === t.id ? 'bg-neon-green text-black' : 'bg-white/5 text-dark-400 hover:bg-white/10'}`}>
                        <t.icon size={14} /> {t.label}
                    </button>
                ))}
            </div>

            {/* CREATE TAB */}
            {tab === 'create' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {/* Left: editor */}
                    <div className="lg:col-span-2 space-y-4">
                        <div className="glass-panel p-4 rounded-2xl border border-white/10">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-white text-sm font-medium">Contenido</span>
                                <div className="flex gap-2">
                                    <button onClick={insertBold} title="Negrita Unicode" className="px-2 py-1 rounded-lg bg-white/10 text-white text-xs hover:bg-white/20 font-bold">𝗕</button>
                                    <button onClick={() => handleAI('improve')} disabled={aiLoading || !content} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-purple-500/20 text-purple-300 text-xs hover:bg-purple-500/30 disabled:opacity-40">
                                        <Wand2 size={11} /> Mejorar
                                    </button>
                                </div>
                            </div>
                            <textarea ref={textareaRef} value={content} onChange={e => setContent(e.target.value)}
                                placeholder="Escribe tu post aquí o genera con IA..."
                                className="w-full bg-transparent text-white placeholder-dark-400 text-sm resize-none focus:outline-none min-h-[160px]" />
                            <div className="text-right text-dark-500 text-xs mt-1">{content.length} caracteres</div>
                        </div>

                        {/* AI Generate */}
                        <div className="glass-panel p-4 rounded-2xl border border-white/10">
                            <p className="text-white text-sm font-medium mb-2 flex items-center gap-1"><Sparkles size={13} className="text-yellow-400" /> Generar con IA</p>
                            <div className="flex flex-col sm:flex-row gap-2">
                                <input value={topic} onChange={e => setTopic(e.target.value)}
                                    placeholder="Tema del post (ej: promoción de verano)"
                                    className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-dark-400 focus:outline-none focus:border-neon-green/50" />
                                <button onClick={() => handleAI('generate')} disabled={aiLoading || !topic}
                                    className="px-4 py-2 bg-neon-green text-black font-bold rounded-xl text-sm disabled:opacity-40 whitespace-nowrap w-full sm:w-auto">
                                    {aiLoading ? <Loader2 size={14} className="animate-spin" /> : 'Generar'}
                                </button>
                            </div>
                        </div>

                        {/* Media */}
                        <div className="glass-panel p-4 rounded-2xl border border-white/10">
                            <p className="text-white text-sm font-medium mb-3">Media</p>
                            {mediaUrl ? (
                                <div className="relative">
                                    {mediaType === 'video'
                                        ? <video src={mediaUrl} className="w-full max-h-48 rounded-xl object-cover" controls />
                                        : <img src={mediaUrl} className="w-full max-h-48 rounded-xl object-cover" alt="" />}
                                    <button onClick={() => { setMediaUrl(null); setMediaType(null) }}
                                        className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white hover:bg-red-500/60">
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            ) : (
                                <button onClick={() => fileRef.current?.click()} disabled={uploadingMedia}
                                    className="w-full border-2 border-dashed border-white/20 rounded-xl p-6 text-dark-400 hover:border-neon-green/40 hover:text-neon-green transition-all flex flex-col items-center gap-2">
                                    {uploadingMedia ? <Loader2 size={20} className="animate-spin" /> : <><Image size={20} /><Video size={20} /></>}
                                    <span className="text-sm">{uploadingMedia ? 'Subiendo...' : 'Subir imagen o video'}</span>
                                </button>
                            )}
                            <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden"
                                onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])} />
                        </div>
                    </div>

                    {/* Right: settings */}
                    <div className="space-y-4">
                        {/* Networks */}
                        <div className="glass-panel p-4 rounded-2xl border border-white/10">
                            <p className="text-white text-sm font-medium mb-3">Redes sociales</p>
                            <div className="space-y-2">
                                {NETWORKS.map(n => {
                                    const isConnected = networkConnected(n.id)
                                    const isSelected = selectedNetworks.includes(n.id)
                                    const isFB = n.id === 'FACEBOOK'
                                    const isIG = n.id === 'INSTAGRAM'
                                    const igPages = fbPages.filter(p => p.instagram)

                                    return (
                                        <div key={n.id}>
                                            <button disabled={!isConnected}
                                                onClick={() => toggleNetwork(n.id)}
                                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left ${isSelected ? 'border-neon-green/50 bg-neon-green/10' : 'border-white/10 bg-white/5'} ${!isConnected ? 'opacity-40 cursor-not-allowed' : 'hover:border-white/20'}`}>
                                                <span className="text-lg">{n.icon}</span>
                                                <div className="flex-1 min-w-0">
                                                    <span className="text-white text-sm font-medium">{n.label}</span>
                                                    {!isConnected && <p className="text-dark-500 text-xs">No conectado</p>}
                                                    {isConnected && !isSelected && <p className="text-neon-green text-xs">Conectado ✓</p>}
                                                    {isConnected && isSelected && (isFB || isIG) && pageSelections[n.id] && (
                                                        <p className="text-neon-green text-xs truncate">
                                                            {isFB ? pageSelections[n.id].pageName : `@${pageSelections[n.id].username}`}
                                                        </p>
                                                    )}
                                                </div>
                                                {isSelected && <CheckCircle size={14} className="text-neon-green flex-shrink-0" />}
                                            </button>

                                            {/* Selector de página Facebook */}
                                            {isSelected && isFB && isConnected && (
                                                <div className="mt-1.5 ml-2">
                                                    {fbPagesLoading ? (
                                                        <p className="text-dark-400 text-xs px-2 py-1">Cargando páginas...</p>
                                                    ) : fbPagesError ? (
                                                        <p className="text-red-400 text-xs px-2 py-1">⚠ {fbPagesError}</p>
                                                    ) : fbPages.length === 0 ? (
                                                        <p className="text-dark-400 text-xs px-2 py-1">No se encontraron páginas de Facebook. Asegúrate de ser admin de alguna Página.</p>
                                                    ) : (
                                                        <select
                                                            value={pageSelections.FACEBOOK?.pageId || ''}
                                                            onChange={e => {
                                                                const page = fbPages.find(p => p.pageId === e.target.value)
                                                                if (page) setPageSelections(prev => ({ ...prev, FACEBOOK: { pageId: page.pageId, pageAccessToken: page.pageAccessToken, pageName: page.pageName } }))
                                                            }}
                                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-neon-green/50 [&>option]:bg-[#0d0d1a]">
                                                            <option value="">— Selecciona una página —</option>
                                                            {fbPages.map(p => (
                                                                <option key={p.pageId} value={p.pageId}>{p.pageName}</option>
                                                            ))}
                                                        </select>
                                                    )}
                                                </div>
                                            )}

                                            {/* Selector de cuenta Instagram */}
                                            {isSelected && isIG && isConnected && (
                                                <div className="mt-1.5 ml-2">
                                                    {fbPagesLoading ? (
                                                        <p className="text-dark-400 text-xs px-2 py-1">Cargando cuentas...</p>
                                                    ) : fbPagesError ? (
                                                        <p className="text-red-400 text-xs px-2 py-1">⚠ {fbPagesError}</p>
                                                    ) : igPages.length === 0 ? (
                                                        <p className="text-yellow-400 text-xs px-2 py-1">⚠ No hay cuentas de Instagram Business vinculadas a tus páginas de Facebook</p>
                                                    ) : (
                                                        <select
                                                            value={pageSelections.INSTAGRAM?.accountId || ''}
                                                            onChange={e => {
                                                                const page = igPages.find(p => p.instagram?.accountId === e.target.value)
                                                                if (page) setPageSelections(prev => ({ ...prev, INSTAGRAM: { accountId: page.instagram.accountId, pageAccessToken: page.pageAccessToken, username: page.instagram.username } }))
                                                            }}
                                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-neon-green/50 [&>option]:bg-[#0d0d1a]">
                                                            <option value="">— Selecciona una cuenta —</option>
                                                            {igPages.map(p => (
                                                                <option key={p.instagram.accountId} value={p.instagram.accountId}>@{p.instagram.username} ({p.pageName})</option>
                                                            ))}
                                                        </select>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>

                        {/* Post type */}
                        <div className="glass-panel p-4 rounded-2xl border border-white/10">
                            <p className="text-white text-sm font-medium mb-3">Tipo de publicación</p>
                            <div className="grid grid-cols-2 gap-2">
                                <button onClick={() => setPostType('feed')}
                                    className={`py-2 rounded-xl text-sm font-medium border transition-all ${postType === 'feed' ? 'bg-neon-green text-black border-neon-green' : 'border-white/10 text-dark-400 hover:border-white/20'}`}>
                                    Feed
                                </button>
                                <button onClick={() => setPostType('story')}
                                    className={`py-2 rounded-xl text-sm font-medium border transition-all ${postType === 'story' ? 'bg-neon-green text-black border-neon-green' : 'border-white/10 text-dark-400 hover:border-white/20'}`}>
                                    Story
                                </button>
                            </div>
                        </div>

                        {/* Schedule */}
                        <div className="glass-panel p-4 rounded-2xl border border-white/10">
                            <p className="text-white text-sm font-medium mb-3 flex items-center gap-1"><Calendar size={13} /> Programar</p>
                            <input
                                type="datetime-local"
                                value={scheduledAt}
                                min={(() => {
                                    const d = new Date(Date.now() + 5 * 60 * 1000)
                                    return d.toISOString().slice(0, 16)
                                })()}
                                onChange={e => setScheduledAt(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-neon-green/50" />
                            {scheduledAt && <p className="text-dark-400 text-xs mt-1">Se publicará automáticamente</p>}
                        </div>

                        {/* Publish button */}
                        <button onClick={handlePublish} disabled={loading || !content.trim() || !selectedNetworks.length}
                            className="w-full py-3 bg-neon-green text-black font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-40 hover:brightness-110 transition-all">
                            {loading ? <><Loader2 size={16} className="animate-spin" /> Publicando...</>
                                : scheduledAt ? <><Calendar size={16} /> Programar</> : <><Send size={16} /> Publicar ahora</>}
                        </button>

                        {/* Result */}
                        {publishResult && (
                            <div className="glass-panel p-4 rounded-2xl border border-neon-green/30">
                                <p className="text-neon-green text-sm font-medium mb-2">
                                    {publishResult.scheduled ? '✅ Programado' : '✅ Publicado'}
                                </p>
                                {publishResult.results?.map((r: any) => (
                                    <div key={r.network} className="flex items-start gap-2 text-xs text-dark-400 mt-1 min-w-0">
                                        <span className="flex-shrink-0 mt-0.5">{r.success ? <CheckCircle size={11} className="text-neon-green" /> : <XCircle size={11} className="text-red-400" />}</span>
                                        <span className="break-words min-w-0">{r.network}: {r.success ? 'OK' : r.error}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* CALENDAR TAB */}
            {tab === 'calendar' && (
                <div className="space-y-3">
                    <p className="text-dark-400 text-sm">Posts programados pendientes</p>
                    {posts.length === 0 ? (
                        <div className="glass-panel p-8 rounded-2xl border border-white/10 text-center text-dark-400">
                            No hay posts programados
                        </div>
                    ) : posts.map(post => (
                        <PostCard key={post.id} post={post} onDelete={handleDeletePost} />
                    ))}
                </div>
            )}

            {/* HISTORY TAB */}
            {tab === 'history' && (
                <div className="space-y-3">
                    {posts.length === 0 ? (
                        <div className="glass-panel p-8 rounded-2xl border border-white/10 text-center text-dark-400">
                            No hay publicaciones todavía
                        </div>
                    ) : posts.map(post => (
                        <PostCard key={post.id} post={post} onDelete={handleDeletePost} />
                    ))}
                </div>
            )}

            {/* METRICS TAB */}
            {tab === 'metrics' && (
                <MetricsPanel metrics={metrics} onAiAnalyze={() => handleAI('analyze')} aiLoading={aiLoading} />
            )}

            {/* CONNECTIONS TAB */}
            {tab === 'connections' && (
                <ConnectionsPanel connections={connections} onRefresh={loadConnections} />
            )}

            {/* SCRIPT MODAL */}
            {scriptModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) setScriptModal(false) }}>
                    <div className="w-full max-w-lg bg-dark-900 border border-white/15 rounded-2xl shadow-2xl overflow-hidden">
                        {/* Modal header */}
                        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
                            <h2 className="text-white font-semibold flex items-center gap-2">
                                <FileText size={16} className="text-blue-400" /> Guión de video
                            </h2>
                            <button onClick={() => setScriptModal(false)} className="text-dark-400 hover:text-white transition-colors text-xl leading-none">&times;</button>
                        </div>
                        {/* Modal body */}
                        <div className="p-5 space-y-4">
                            <div className="flex flex-col sm:flex-row gap-2">
                                <input
                                    value={scriptTopic}
                                    onChange={e => setScriptTopic(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleGenerateScript()}
                                    placeholder="Describe el tema de tu video..."
                                    className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-dark-400 focus:outline-none focus:border-blue-400/50"
                                />
                                <button onClick={handleGenerateScript} disabled={scriptLoading || !scriptTopic.trim()}
                                    className="px-4 py-2.5 bg-blue-500 text-white font-semibold rounded-xl text-sm disabled:opacity-40 hover:bg-blue-400 transition-colors whitespace-nowrap w-full sm:w-auto">
                                    {scriptLoading ? <Loader2 size={14} className="animate-spin" /> : 'Generar'}
                                </button>
                            </div>
                            {script ? (
                                <>
                                    <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-sm text-dark-200 whitespace-pre-wrap max-h-72 overflow-y-auto leading-relaxed">
                                        {script}
                                    </div>
                                    <button
                                        onClick={() => navigator.clipboard.writeText(script)}
                                        className="w-full py-2 rounded-xl border border-white/10 text-dark-400 hover:text-white hover:border-white/20 text-sm transition-colors">
                                        Copiar guión
                                    </button>
                                </>
                            ) : (
                                <p className="text-dark-500 text-sm text-center py-6">El guión aparecerá aquí</p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

function PostCard({ post, onDelete }: { post: any; onDelete: (id: string) => void }) {
    const cfg = STATUS_CONFIG[post.status] || STATUS_CONFIG.DRAFT
    const Icon = cfg.icon
    return (
        <div className="glass-panel p-4 rounded-2xl border border-white/10">
            <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                    <p className="text-white text-sm line-clamp-2">{post.content}</p>
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                        <span className="flex items-center gap-1 text-xs" style={{ color: cfg.color }}>
                            <Icon size={11} /> {cfg.label}
                        </span>
                        {post.scheduledAt && (
                            <span className="text-dark-400 text-xs flex items-center gap-1">
                                <Clock size={10} /> {new Date(post.scheduledAt).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })}
                            </span>
                        )}
                        <div className="flex gap-1">
                            {post.networks?.map((n: any) => (
                                <span key={n.id} className={`text-xs px-1.5 py-0.5 rounded-md ${n.status === 'PUBLISHED' ? 'bg-neon-green/10 text-neon-green' : n.status === 'FAILED' ? 'bg-red-500/10 text-red-400' : 'bg-white/5 text-dark-400'}`}>
                                    {n.network}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
                {post.mediaUrl && (
                    <div className="w-16 h-16 flex-shrink-0 rounded-xl overflow-hidden bg-white/5">
                        {post.mediaType === 'video'
                            ? <video src={post.mediaUrl} className="w-full h-full object-cover" />
                            : <img src={post.mediaUrl} className="w-full h-full object-cover" alt="" />}
                    </div>
                )}
            </div>
            <div className="mt-3 flex justify-end">
                <button onClick={() => onDelete(post.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-dark-400 hover:text-red-400 transition-all">
                    <Trash2 size={13} />
                </button>
            </div>
        </div>
    )
}

function MetricsPanel({ metrics, onAiAnalyze, aiLoading }: { metrics: any; onAiAnalyze: () => void; aiLoading: boolean }) {
    if (!metrics) return (
        <div className="glass-panel p-8 rounded-2xl border border-white/10 text-center text-dark-400">
            Cargando métricas...
        </div>
    )

    const postStats: Record<string, number> = {}
    for (const s of metrics.postStats || []) postStats[s.status] = s._count.id

    return (
        <div className="space-y-4">
            {/* Post stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                    { label: 'Publicados', value: postStats.PUBLISHED || 0, color: '#00FF88' },
                    { label: 'Programados', value: postStats.SCHEDULED || 0, color: '#00BFFF' },
                    { label: 'Fallidos', value: postStats.FAILED || 0, color: '#FF4444' },
                    { label: 'Total', value: Object.values(postStats).reduce((a, b) => a + b, 0), color: '#888' },
                ].map(stat => (
                    <div key={stat.label} className="glass-panel p-4 rounded-2xl border border-white/10 text-center">
                        <p className="text-2xl font-bold" style={{ color: stat.color }}>{stat.value}</p>
                        <p className="text-dark-400 text-xs mt-1">{stat.label}</p>
                    </div>
                ))}
            </div>

            {/* Platform metrics */}
            {metrics.metrics && Object.entries(metrics.metrics).map(([network, data]: [string, any]) => (
                <div key={network} className="glass-panel p-4 rounded-2xl border border-white/10">
                    <h3 className="text-white font-medium mb-3">{network}</h3>
                    {data.error ? (
                        <p className="text-red-400 text-sm">{data.error}</p>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {Object.entries(data).slice(0, 8).map(([k, v]: [string, any]) => (
                                <div key={k} className="bg-white/5 rounded-xl p-3">
                                    <p className="text-white font-bold">{typeof v === 'number' ? v.toLocaleString() : String(v)}</p>
                                    <p className="text-dark-400 text-xs mt-0.5">{k}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ))}

            <button onClick={onAiAnalyze} disabled={aiLoading}
                className="w-full py-3 border border-purple-500/30 rounded-xl text-purple-300 text-sm flex items-center justify-center gap-2 hover:bg-purple-500/10 disabled:opacity-40">
                {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                Analizar con IA y obtener recomendaciones
            </button>
        </div>
    )
}

function ConnectionsPanel({ connections, onRefresh }: { connections: any[]; onRefresh: () => void }) {
    const [oaiConfig, setOaiConfig] = useState<{ apiKeyMasked: string; model: string; isValid: boolean } | null>(null)
    const [oaiKey, setOaiKey] = useState('')
    const [oaiModel, setOaiModel] = useState('gpt-4o')
    const [oaiLoading, setOaiLoading] = useState(false)
    const [oaiMsg, setOaiMsg] = useState('')

    useEffect(() => {
        fetch('/api/ads/config/openai').then(r => r.json()).then(d => {
            if (d.config) { setOaiConfig(d.config); setOaiModel(d.config.model || 'gpt-4o') }
        })
    }, [])

    async function saveOaiKey() {
        if (!oaiKey.trim()) return
        setOaiLoading(true); setOaiMsg('')
        const res = await fetch('/api/ads/config/openai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiKey: oaiKey.trim(), model: oaiModel })
        })
        const data = await res.json()
        setOaiLoading(false)
        if (res.ok) {
            setOaiConfig(data.config)
            setOaiKey('')
            setOaiMsg(data.isValid ? '✓ API Key válida y guardada' : '⚠ Key guardada pero no pudo validarse')
        } else {
            setOaiMsg('Error: ' + data.error)
        }
    }

    async function removeOaiKey() {
        await fetch('/api/ads/config/openai', { method: 'DELETE' })
        setOaiConfig(null); setOaiMsg('')
    }

    async function disconnect(network: string) {
        await fetch('/api/social/connections', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ network })
        })
        onRefresh()
    }

    const connectedMap: Record<string, any> = {}
    for (const c of connections) connectedMap[c.network] = c

    return (
        <div className="space-y-4">
            {/* OpenAI API Key */}
            <div className="glass-panel p-4 rounded-2xl border border-yellow-500/20 bg-yellow-500/5">
                <div className="flex items-center gap-2 mb-3">
                    <Sparkles size={15} className="text-yellow-400" />
                    <p className="text-white font-medium text-sm">API Key de OpenAI (IA)</p>
                    {oaiConfig?.isValid && <span className="text-xs text-neon-green bg-neon-green/10 px-2 py-0.5 rounded-full">Activa ✓</span>}
                </div>
                <p className="text-dark-400 text-xs mb-3">Necesaria para generar texto, mejorar posts y crear guiones de video con IA.</p>
                {/* Model selector — shared between both states */}
                <div className="mb-3">
                    <label className="text-dark-400 text-xs mb-1.5 block">Modelo</label>
                    <select value={oaiModel} onChange={e => setOaiModel(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-400/50 [&>option]:bg-[#0d0d1a]">
                        <option value="gpt-5.2">GPT-5.2 ⚡ Última generación — ⚠ Mayor costo</option>
                        <option value="gpt-5.1">GPT-5.1 ⭐ Más inteligente — ⚠ Mayor costo</option>
                        <option value="gpt-4.1">GPT-4.1 — Alta calidad — ⚠ Mayor costo</option>
                        <option value="gpt-4.1-mini">GPT-4.1 Mini — Rápido y económico</option>
                        <option value="gpt-4o">GPT-4o — Equilibrado (Recomendado)</option>
                        <option value="gpt-4o-mini">GPT-4o Mini — Muy económico</option>
                    </select>
                    {(oaiModel === 'gpt-5.2' || oaiModel === 'gpt-5.1' || oaiModel === 'gpt-4.1') && (
                        <p className="text-orange-400 text-xs mt-1.5">⚠ Este modelo consume más créditos de OpenAI. Cada llamada puede costar 5–10× más que gpt-4o.</p>
                    )}
                </div>

                {oaiConfig ? (
                    <div className="flex items-center justify-between gap-2 min-w-0">
                        <span className="text-dark-300 text-xs sm:text-sm font-mono truncate min-w-0">{oaiConfig.apiKeyMasked}</span>
                        <button onClick={removeOaiKey} className="flex-shrink-0 text-xs text-red-400 hover:text-red-300 px-3 py-1.5 rounded-lg border border-red-500/20 hover:bg-red-500/10">Eliminar</button>
                    </div>
                ) : (
                    <div className="flex flex-col sm:flex-row gap-2">
                        <input value={oaiKey} onChange={e => setOaiKey(e.target.value)}
                            placeholder="sk-proj-..."
                            type="password"
                            className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-dark-400 focus:outline-none focus:border-yellow-400/50" />
                        <button onClick={saveOaiKey} disabled={oaiLoading || !oaiKey.trim()}
                            className="px-3 py-2 bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 rounded-xl text-sm disabled:opacity-40 hover:bg-yellow-500/30 whitespace-nowrap w-full sm:w-auto">
                            {oaiLoading ? <Loader2 size={13} className="animate-spin" /> : 'Guardar'}
                        </button>
                    </div>
                )}
                {oaiMsg && <p className={`text-xs mt-2 ${oaiMsg.startsWith('✓') ? 'text-neon-green' : 'text-yellow-400'}`}>{oaiMsg}</p>}
            </div>

            <p className="text-dark-400 text-sm">Conecta tus cuentas para publicar desde aquí</p>

            {/* Facebook + Instagram (same OAuth) */}
            <div className="glass-panel p-4 rounded-2xl border border-white/10">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <span className="text-2xl flex-shrink-0">📘</span>
                        <div className="min-w-0">
                            <p className="text-white font-medium">Facebook + Instagram</p>
                            {connectedMap.FACEBOOK
                                ? <p className="text-neon-green text-xs truncate">✓ {connectedMap.FACEBOOK.pageName || connectedMap.FACEBOOK.accountName}</p>
                                : <p className="text-dark-400 text-xs">No conectado</p>}
                        </div>
                    </div>
                    {connectedMap.FACEBOOK
                        ? <button onClick={() => disconnect('FACEBOOK')} className="flex-shrink-0 text-xs text-red-400 hover:text-red-300 px-3 py-1.5 rounded-lg border border-red-500/20 hover:bg-red-500/10">Desconectar</button>
                        : <a href="/api/social/oauth/facebook" className="flex-shrink-0 text-xs bg-blue-500/20 text-blue-300 border border-blue-500/30 px-3 py-1.5 rounded-lg hover:bg-blue-500/30 flex items-center gap-1"><ExternalLink size={11} /> Conectar</a>}
                </div>
            </div>

            {/* TikTok */}
            <div className="glass-panel p-4 rounded-2xl border border-white/10">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <span className="text-2xl flex-shrink-0">🎵</span>
                        <div className="min-w-0">
                            <p className="text-white font-medium">TikTok</p>
                            {connectedMap.TIKTOK
                                ? <p className="text-neon-green text-xs truncate">✓ {connectedMap.TIKTOK.accountName}</p>
                                : <p className="text-dark-400 text-xs">No conectado</p>}
                        </div>
                    </div>
                    {connectedMap.TIKTOK
                        ? <button onClick={() => disconnect('TIKTOK')} className="flex-shrink-0 text-xs text-red-400 hover:text-red-300 px-3 py-1.5 rounded-lg border border-red-500/20 hover:bg-red-500/10">Desconectar</button>
                        : <a href="/api/social/oauth/tiktok" className="flex-shrink-0 text-xs bg-black/40 text-white border border-white/20 px-3 py-1.5 rounded-lg hover:bg-white/10 flex items-center gap-1"><ExternalLink size={11} /> Conectar</a>}
                </div>
            </div>

            {/* YouTube */}
            <div className="glass-panel p-4 rounded-2xl border border-white/10">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <span className="text-2xl flex-shrink-0">▶️</span>
                        <div className="min-w-0">
                            <p className="text-white font-medium">YouTube</p>
                            {connectedMap.YOUTUBE
                                ? <p className="text-neon-green text-xs truncate">✓ {connectedMap.YOUTUBE.accountName}</p>
                                : <p className="text-dark-400 text-xs">No conectado</p>}
                        </div>
                    </div>
                    {connectedMap.YOUTUBE
                        ? <button onClick={() => disconnect('YOUTUBE')} className="flex-shrink-0 text-xs text-red-400 hover:text-red-300 px-3 py-1.5 rounded-lg border border-red-500/20 hover:bg-red-500/10">Desconectar</button>
                        : <a href="/api/social/oauth/youtube" className="flex-shrink-0 text-xs bg-red-500/20 text-red-300 border border-red-500/30 px-3 py-1.5 rounded-lg hover:bg-red-500/30 flex items-center gap-1"><ExternalLink size={11} /> Conectar</a>}
                </div>
            </div>
        </div>
    )
}
