'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Brain, Zap, CheckCircle2, AlertCircle, Loader2, Eye, EyeOff, ArrowLeft, Settings2, Link2, Key, Sparkles } from 'lucide-react'
import Link from 'next/link'
import GlobalAiKeyToggle from '@/components/GlobalAiKeyToggle'

const PLATFORMS = [
    { id: 'META', label: 'Meta Ads', sub: 'Facebook & Instagram', color: '#0081FB', letter: 'f', textColor: 'text-amber-400' },
]

export default function SetupPage() {
    return (
        <Suspense fallback={null}>
            <SetupPageInner />
        </Suspense>
    )
}

function SetupPageInner() {
    const searchParams = useSearchParams()
    const [tab, setTab] = useState<'openai' | 'platforms'>('openai')
    const [apiKey, setApiKey] = useState('')
    const [model, setModel] = useState('gpt-5.1')
    const [showKey, setShowKey] = useState(false)
    const [saving, setSaving] = useState(false)
    const [config, setConfig] = useState<any>(null)
    const [integrations, setIntegrations] = useState<any[]>([])
    const [waNumbers, setWaNumbers] = useState<any[]>([])
    const [waLoading, setWaLoading] = useState(false)
    const [waSelecting, setWaSelecting] = useState<string | null>(null)
    const [showWaSelector, setShowWaSelector] = useState(false)
    const [adAccounts, setAdAccounts] = useState<any[]>([])
    const [adAccountsLoading, setAdAccountsLoading] = useState(false)
    const [adAccountSelecting, setAdAccountSelecting] = useState<string | null>(null)
    const [showAdSelector, setShowAdSelector] = useState(false)
    const [pages, setPages] = useState<any[]>([])
    const [pagesLoading, setPagesLoading] = useState(false)
    const [pageSelecting, setPageSelecting] = useState<string | null>(null)
    const [showPagesSelector, setShowPagesSelector] = useState(false)
    const [selectedPage, setSelectedPage] = useState<any>(null)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    useEffect(() => {
        const init = async () => {
            await fetchData()
            if (searchParams.get('connected') === 'meta') {
                setTab('platforms')
                setShowAdSelector(true)
                setShowPagesSelector(true)
                setShowWaSelector(true)
                await Promise.all([loadAdAccounts(), loadPages(), loadWaNumbers()])
            }
        }
        init()
    }, [])

    async function fetchData() {
        const [oaiRes, intRes] = await Promise.all([
            fetch('/api/ads/config/openai'),
            fetch('/api/ads/integrations/status')
        ])
        const [oaiData, intData] = await Promise.all([oaiRes.json(), intRes.json()])
        setConfig(oaiData.config)
        if (oaiData.config?.model) setModel(oaiData.config.model)
        setIntegrations(intData.integrations || [])
    }

    async function loadAdAccounts() {
        setAdAccountsLoading(true)
        try {
            const res = await fetch('/api/ads/integrations/meta/accounts')
            const data = await res.json()
            if (data.error) throw new Error(data.error)
            setAdAccounts(data.accounts || [])
            setShowAdSelector(true)
            if (!data.accounts?.length) setError('No se encontraron cuentas publicitarias. Asegúrate de tener acceso a una cuenta publicitaria en Meta Business.')
        } catch (e: any) { setError(`Cuentas publicitarias: ${e.message}`) }
        finally { setAdAccountsLoading(false) }
    }

    async function selectAdAccount(a: any) {
        setAdAccountSelecting(a.providerAccountId || a.id)
        try {
            const res = await fetch('/api/ads/integrations/meta/accounts/select', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ providerAccountId: a.providerAccountId || a.id, displayName: a.displayName || a.name, currency: a.currency, timezone: a.timezone })
            })
            if (!res.ok) throw new Error('Error al guardar')
            setSuccess(`✓ Cuenta publicitaria "${a.displayName || a.name}" seleccionada`)
            setShowAdSelector(false)
            fetchData()
        } catch { setError('Error al seleccionar cuenta') }
        finally { setAdAccountSelecting(null) }
    }

    async function loadPages() {
        setPagesLoading(true)
        try {
            const res = await fetch('/api/ads/integrations/meta/pages')
            const data = await res.json()
            if (data.error) throw new Error(data.error)
            setPages(data.pages || [])
            setShowPagesSelector(true)
            if (!data.pages?.length) setError('No se encontraron páginas de Facebook. Asegúrate de ser administrador de al menos una Página.')
        } catch (e: any) { setError(`Páginas: ${e.message}`) }
        finally { setPagesLoading(false) }
    }

    async function selectPage(p: any) {
        setPageSelecting(p.id)
        try {
            await fetch('/api/ads/integrations/meta/pages/select', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pageId: p.id, pageName: p.name, pageAccessToken: p.accessToken })
            })
            setSelectedPage(p)
            setSuccess(`✓ Página "${p.name}" seleccionada`)
            setShowPagesSelector(false)
        } catch { setError('Error al seleccionar página') }
        finally { setPageSelecting(null) }
    }

    async function loadWaNumbers() {
        setWaLoading(true)
        try {
            const res = await fetch('/api/ads/integrations/meta/whatsapp-numbers')
            const data = await res.json()
            if (data.error) throw new Error(data.error)
            setWaNumbers(data.phoneNumbers || [])
            setShowWaSelector(true)
        } catch (e: any) { setError(`WhatsApp: ${e.message}`) }
        finally { setWaLoading(false) }
    }

    async function selectWaNumber(n: any) {
        setWaSelecting(n.id)
        try {
            const res = await fetch('/api/ads/integrations/meta/whatsapp-numbers/select', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phoneId: n.id, displayPhone: n.displayPhone, name: n.name })
            })
            if (!res.ok) throw new Error('Error al guardar')
            setSuccess(`✓ Número ${n.displayPhone} seleccionado correctamente`)
            setShowWaSelector(false)
            fetchData()
        } catch { setError('Error al seleccionar número') }
        finally { setWaSelecting(null) }
    }

    async function handleSaveOpenAI(e: React.FormEvent) {
        e.preventDefault()
        if (!apiKey.trim()) return setError('Ingresa tu API Key')
        if (!apiKey.trim().startsWith('sk-')) return setError('La API Key debe empezar con sk-')
        setSaving(true)
        setError(null)
        setSuccess(null)
        try {
            const res = await fetch('/api/ads/config/openai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apiKey: apiKey.trim(), model })
            })
            const data = await res.json()
            if (!res.ok) return setError(data.error || 'Error al guardar')
            setConfig(data.config)
            setApiKey('')
            setSuccess(data.isValid ? '✓ API Key guardada y validada correctamente' : 'API Key guardada pero no validada. Verifica que sea correcta.')
        } catch { setError('Error de conexión') }
        finally { setSaving(false) }
    }

    async function handleDeleteOpenAI() {
        if (!confirm('¿Eliminar la API Key de OpenAI?')) return
        await fetch('/api/ads/config/openai', { method: 'DELETE' })
        setConfig(null)
        setSuccess('API Key eliminada')
    }

    async function handleConnectPlatform(platformId: string) {
        try {
            const res = await fetch(`/api/ads/integrations/${platformId.toLowerCase()}/connect/start`, { method: 'POST' })
            const { authUrl, error: err } = await res.json()
            if (err) return setError(err)
            if (authUrl) window.location.href = authUrl
        } catch { setError('Error al iniciar conexión') }
    }

    return (
        <div className="px-4 md:px-6 pt-6 max-w-3xl mx-auto pb-24 text-white">

            {/* Header */}
            <div className="flex items-center gap-3 mb-7">
                <Link href="/dashboard/services/ads"
                    className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all shrink-0">
                    <ArrowLeft size={15} />
                </Link>
                <div>
                    <h1 className="text-lg md:text-xl font-black uppercase tracking-tighter">Configuración</h1>
                    <p className="text-[11px] text-white/30">API Key de OpenAI y plataformas</p>
                </div>
            </div>

            {/* Alerts */}
            {error && (
                <div className="mb-5 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-start gap-3 text-red-400 text-sm">
                    <AlertCircle size={15} className="shrink-0 mt-0.5" />
                    <p className="flex-1 text-xs md:text-sm">{error}</p>
                    <button onClick={() => setError(null)} className="font-bold text-xs shrink-0">✕</button>
                </div>
            )}
            {success && (
                <div className="mb-5 p-4 bg-green-500/10 border border-green-500/20 rounded-2xl flex items-start gap-3 text-green-400 text-sm">
                    <CheckCircle2 size={15} className="shrink-0 mt-0.5" />
                    <p className="flex-1 text-xs md:text-sm">{success}</p>
                    <button onClick={() => setSuccess(null)} className="font-bold text-xs shrink-0">✕</button>
                </div>
            )}

            {/* Tab switcher */}
            <div className="flex gap-1.5 mb-7 bg-white/4 p-1.5 rounded-2xl border border-white/8">
                {[
                    { id: 'openai' as const, label: 'OpenAI', icon: Brain },
                    { id: 'platforms' as const, label: 'Plataformas', icon: Zap }
                ].map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all ${tab === t.id
                            ? 'bg-white text-black shadow-sm'
                            : 'text-white/40 hover:text-white/70'
                        }`}>
                        <t.icon size={14} />
                        {t.label}
                    </button>
                ))}
            </div>

            {/* OpenAI Tab */}
            {tab === 'openai' && (
                <div className="space-y-5">

                    {/* API key de la app */}
                    <GlobalAiKeyToggle />

                    {/* Current config */}
                    {config && (
                        <div className={`p-4 rounded-2xl border flex items-center gap-3 ${config.isValid
                            ? 'bg-green-500/5 border-green-500/20'
                            : 'bg-yellow-500/5 border-yellow-500/20'
                        }`}>
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${config.isValid ? 'bg-green-500/15' : 'bg-yellow-500/15'}`}>
                                {config.isValid
                                    ? <CheckCircle2 size={17} className="text-green-400" />
                                    : <AlertCircle size={17} className="text-yellow-400" />
                                }
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-bold text-sm">{config.isValid ? 'API Key activa' : 'API Key no validada'}</p>
                                <p className="text-[11px] text-white/40 font-mono truncate">{config.apiKeyMasked} · {config.model}</p>
                            </div>
                            <button onClick={handleDeleteOpenAI} className="text-xs text-red-400 hover:text-red-300 font-bold shrink-0">Eliminar</button>
                        </div>
                    )}

                    {/* Info */}
                    <div className="bg-amber-500/5 border border-amber-500/15 rounded-2xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Sparkles size={13} className="text-amber-400" />
                            <p className="text-xs font-bold text-amber-400 uppercase tracking-widest">¿Por qué tu propia API Key?</p>
                        </div>
                        <ul className="text-xs text-white/45 space-y-1">
                            <li>• Control total de costos — pagas directamente a OpenAI</li>
                            <li>• Sin intermediarios — mayor seguridad y privacidad</li>
                            <li>• Usa el modelo que prefieras (GPT-5.1, GPT-4.1, etc.)</li>
                            <li>• Tu clave se guarda cifrada con AES-256-GCM</li>
                        </ul>
                        <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 mt-3 text-xs text-amber-400 font-bold hover:underline">
                            Obtener API Key en OpenAI →
                        </a>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSaveOpenAI} className="bg-white/3 border border-white/8 rounded-2xl p-5 space-y-4">
                        <div className="flex items-center gap-2 mb-1">
                            <Key size={14} className="text-white/40" />
                            <h3 className="font-bold text-sm">{config ? 'Actualizar API Key' : 'Configurar API Key'}</h3>
                        </div>

                        <div>
                            <label className="text-[11px] font-bold text-white/40 uppercase tracking-widest block mb-2">
                                OpenAI API Key
                            </label>
                            <div className="relative">
                                <input
                                    type={showKey ? 'text' : 'password'}
                                    value={apiKey}
                                    onChange={e => setApiKey(e.target.value)}
                                    placeholder="sk-proj-..."
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-mono text-white pr-12 focus:outline-none focus:border-amber-500/50 placeholder:text-white/20 transition-colors"
                                />
                                <button type="button" onClick={() => setShowKey(!showKey)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors">
                                    {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="text-[11px] font-bold text-white/40 uppercase tracking-widest block mb-2">Modelo de IA</label>
                            <select value={model} onChange={e => setModel(e.target.value)}
                                className="w-full bg-[#0d0d1a] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-colors [&>option]:bg-[#0d0d1a]">
                                <option value="gpt-5.2">GPT-5.2 ⚡ Última generación — ⚠ Mayor costo</option>
                                <option value="gpt-5.1">GPT-5.1 ⚡ Más inteligente — ⚠ Mayor costo</option>
                                <option value="gpt-4.1">GPT-4.1 — Alta calidad</option>
                                <option value="gpt-4.1-mini">GPT-4.1 Mini — Rápido y económico</option>
                                <option value="gpt-4o">GPT-4o — Equilibrado</option>
                                <option value="gpt-4o-mini">GPT-4o Mini — Muy económico</option>
                            </select>
                        </div>

                        <button type="submit" disabled={saving || !apiKey.trim()}
                            className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 active:scale-[0.98]">
                            {saving ? <><Loader2 size={15} className="animate-spin" /> Validando...</> : 'Guardar y validar API Key'}
                        </button>
                    </form>
                </div>
            )}

            {/* Platforms Tab */}
            {tab === 'platforms' && (
                <div className="space-y-3">
                    <p className="text-xs text-white/30 mb-4">Conecta las plataformas donde quieres publicar tus anuncios.</p>
                    {PLATFORMS.map(platform => {
                        const integration = integrations.find(i => i.platform === platform.id)
                        const isConnected = integration?.status === 'CONNECTED'
                        return (
                            <div key={platform.id} className="bg-white/3 border border-white/8 rounded-2xl p-4 md:p-5 hover:border-white/12 transition-all">
                                <div className="flex items-center gap-3">
                                    <div className="relative">
                                        <div className="w-11 h-11 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                                            <span className={`font-black text-xl ${platform.textColor}`}>{platform.letter}</span>
                                        </div>
                                        {isConnected && (
                                            <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-green-400 border-2 border-black" />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-bold text-sm">{platform.label}</h3>
                                        <p className="text-[11px] text-white/30">{platform.sub}</p>
                                        {isConnected && integration?.connectedAccount && (
                                            <p className="text-[11px] text-green-400 mt-0.5 truncate">✓ {integration.connectedAccount.displayName}</p>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => handleConnectPlatform(platform.id)}
                                        className="shrink-0 flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white hover:text-black transition-all active:scale-[0.97]">
                                        {isConnected ? <><Settings2 size={12} /> Reconfigurar</> : <><Link2 size={12} /> Conectar</>}
                                    </button>
                                </div>
                            </div>
                        )
                    })}

                    {/* Ad Accounts */}
                    {integrations.find(i => i.platform === 'META' && i.status === 'CONNECTED') && (
                        <div className="mt-6">
                            <div className="flex items-center justify-between mb-3">
                                <div>
                                    <h3 className="font-bold text-sm">Cuenta Publicitaria</h3>
                                    <p className="text-[11px] text-white/30">
                                        {integrations.find(i => i.platform === 'META')?.connectedAccount?.displayName
                                            ? `Activa: ${integrations.find(i => i.platform === 'META')?.connectedAccount?.displayName}`
                                            : 'Selecciona la cuenta para publicar anuncios'}
                                    </p>
                                </div>
                                <button onClick={loadAdAccounts} disabled={adAccountsLoading}
                                    className="flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all disabled:opacity-40">
                                    {adAccountsLoading ? <><Loader2 size={12} className="animate-spin" /> Cargando...</> : 'Cambiar cuenta'}
                                </button>
                            </div>

                            {showAdSelector && adAccounts.length > 0 && (
                                <div className="space-y-2">
                                    <p className="text-[11px] text-amber-400 font-bold mb-2">Selecciona la cuenta publicitaria:</p>
                                    {adAccounts.map((a: any) => (
                                        <div key={a.providerAccountId || a.id} className="flex items-center gap-3 bg-white/3 border border-white/8 rounded-xl px-4 py-3">
                                            <div className="w-8 h-8 rounded-xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center shrink-0">
                                                <span className="text-blue-400 font-black text-sm">A</span>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-bold text-sm">{a.displayName || a.name}</p>
                                                <p className="text-[11px] text-white/30">{a.providerAccountId || a.id} · {a.currency}</p>
                                            </div>
                                            <button onClick={() => selectAdAccount(a)} disabled={adAccountSelecting === (a.providerAccountId || a.id)}
                                                className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 transition-all disabled:opacity-40 flex items-center gap-1">
                                                {adAccountSelecting === a.id ? <Loader2 size={11} className="animate-spin" /> : null}
                                                Seleccionar
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Facebook Pages */}
                    {integrations.find(i => i.platform === 'META' && i.status === 'CONNECTED') && (
                        <div className="mt-6">
                            <div className="flex items-center justify-between mb-3">
                                <div>
                                    <h3 className="font-bold text-sm">Página de Facebook</h3>
                                    <p className="text-[11px] text-white/30">
                                        {selectedPage ? `Activa: ${selectedPage.name}` : 'Selecciona la página para tus anuncios'}
                                    </p>
                                </div>
                                <button onClick={loadPages} disabled={pagesLoading}
                                    className="flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all disabled:opacity-40">
                                    {pagesLoading ? <><Loader2 size={12} className="animate-spin" /> Cargando...</> : 'Cambiar página'}
                                </button>
                            </div>

                            {showPagesSelector && pages.length > 0 && (
                                <div className="space-y-2">
                                    <p className="text-[11px] text-amber-400 font-bold mb-2">Selecciona la página de Facebook:</p>
                                    {pages.map((p: any) => (
                                        <div key={p.id} className="flex items-center gap-3 bg-white/3 border border-white/8 rounded-xl px-4 py-3">
                                            <div className="w-8 h-8 rounded-xl bg-blue-600/15 border border-blue-600/20 flex items-center justify-center shrink-0">
                                                <span className="text-blue-400 font-black text-sm">f</span>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-bold text-sm">{p.name}</p>
                                                <p className="text-[11px] text-white/30">{p.id}</p>
                                            </div>
                                            <button onClick={() => selectPage(p)} disabled={pageSelecting === p.id}
                                                className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 transition-all disabled:opacity-40 flex items-center gap-1">
                                                {pageSelecting === p.id ? <Loader2 size={11} className="animate-spin" /> : null}
                                                Seleccionar
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* WhatsApp Numbers */}
                    {integrations.find(i => i.platform === 'META' && i.status === 'CONNECTED') && (
                        <div className="mt-6">
                            <div className="flex items-center justify-between mb-3">
                                <div>
                                    <h3 className="font-bold text-sm">Número de WhatsApp</h3>
                                    <p className="text-[11px] text-white/30">
                                        {integrations.find(i => i.platform === 'META')?.connectedAccount?.displayName
                                            ? `Activo: ${integrations.find(i => i.platform === 'META')?.connectedAccount?.displayName}`
                                            : 'Selecciona el número a usar en tus anuncios'}
                                    </p>
                                </div>
                                <button onClick={loadWaNumbers} disabled={waLoading}
                                    className="flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all disabled:opacity-40">
                                    {waLoading ? <><Loader2 size={12} className="animate-spin" /> Cargando...</> : 'Cambiar número'}
                                </button>
                            </div>

                            {showWaSelector && waNumbers.length > 0 && (
                                <div className="space-y-2">
                                    <p className="text-[11px] text-amber-400 font-bold mb-2">Selecciona el número a conectar:</p>
                                    {waNumbers.map(n => (
                                        <div key={n.id} className="flex items-center gap-3 bg-white/3 border border-white/8 rounded-xl px-4 py-3">
                                            <div className="w-8 h-8 rounded-xl bg-green-500/15 border border-green-500/20 flex items-center justify-center shrink-0">
                                                <span className="text-green-400 font-black text-sm">W</span>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-bold text-sm">{n.displayPhone}</p>
                                                <p className="text-[11px] text-white/30">{n.name}</p>
                                            </div>
                                            <button onClick={() => selectWaNumber(n)} disabled={waSelecting === n.id}
                                                className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 transition-all disabled:opacity-40 flex items-center gap-1">
                                                {waSelecting === n.id ? <Loader2 size={11} className="animate-spin" /> : null}
                                                Seleccionar
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

