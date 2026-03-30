'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import {
    ArrowLeft, Loader2, Sparkles, Upload, CheckCircle2, AlertCircle,
    RefreshCw, MapPin, DollarSign, Settings2, Phone, Rocket,
    Image as ImageIcon, Video, Zap, Eye, X,
    ChevronLeft, ChevronRight, Globe, Wand2, Star, Gauge, Trophy
} from 'lucide-react'
import Link from 'next/link'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import LocationSelector from '@/components/ads/LocationSelector'

function CampaignPageInner() {
    const router = useRouter()
    const { strategyId } = useParams() as { strategyId: string }
    const searchParams = useSearchParams()
    const editCampaignId = searchParams.get('edit')

    // Data
    const [strategy, setStrategy] = useState<any>(null)
    const [brief, setBrief] = useState<any>(null)
    const [accounts, setAccounts] = useState<any[]>([])
    const [pages, setPages] = useState<any[]>([])
    const [pixels, setPixels] = useState<any[]>([])
    const [waNumbers, setWaNumbers] = useState<any[]>([])
    const [campaign, setCampaign] = useState<any>(null)
    const [creatives, setCreatives] = useState<any[]>([])

    // UI state
    const [loading, setLoading] = useState(true)
    const [savingConfig, setSavingConfig] = useState(false)
    const [generatingCopies, setGeneratingCopies] = useState(false)
    const [publishing, setPublishing] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const [configSaved, setConfigSaved] = useState(false)
    const [copiesGenerated, setCopiesGenerated] = useState(false)
    const [showPreview, setShowPreview] = useState(false)
    const [previewIdx, setPreviewIdx] = useState(0)

    // AI image generation per slot
    const [generatingImages, setGeneratingImages] = useState<Record<number, boolean>>({})
    const [imageGenPanel, setImageGenPanel] = useState<number | null>(null)
    const [imageQuality, setImageQuality] = useState<'fast' | 'standard' | 'premium'>('standard')
    const [imageFormat, setImageFormat] = useState<'square' | 'vertical' | 'horizontal'>('square')
    const [imageCustomPrompts, setImageCustomPrompts] = useState<Record<number, string>>({})

    // Form
    const [form, setForm] = useState({
        name: '',
        providerAccountId: '',
        providerAccountName: '',
        pageId: '',
        whatsappNumber: '',
        welcomeMessage: '',
        pixelId: '',
        destinationUrl: '',
        dailyBudgetUSD: '8',
        locations: [] as string[]
    })

    const fileRefs = useRef<Record<number, HTMLInputElement | null>>({})
    const creativesRef = useRef<HTMLDivElement>(null)
    const copiesRef = useRef<HTMLDivElement>(null)

    function generateSmartPrompt(slotIndex: number, hasUploadedImage: boolean): string {
        const name = brief?.name || 'la marca'
        const industry = brief?.industry || 'negocio'
        const colors = Array.isArray(brief?.brandColors)
            ? brief.brandColors.slice(0, 3).join(', ')
            : (brief?.brandColors || 'colores neutros')
        const style = Array.isArray(brief?.visualStyle)
            ? brief.visualStyle.slice(0, 3).join(', ')
            : (brief?.visualStyle || 'moderno, profesional')
        const themes = Array.isArray(brief?.contentThemes)
            ? brief.contentThemes.slice(0, 2).join(' y ')
            : (brief?.contentThemes || 'producto destacado')
        const value = brief?.valueProposition?.substring(0, 120) || ''
        const keyMsg = Array.isArray(brief?.keyMessages)
            ? (brief.keyMessages[slotIndex] || brief.keyMessages[0] || '')
            : ''
        const msg = keyMsg || value

        if (hasUploadedImage) {
            return `Professional high-impact advertising photo for ${name}, premium ${industry} brand. Feature the uploaded product/subject prominently as the hero element. Visual style: ${style}. Brand color palette: ${colors}. Scene context: ${themes}. Core message: "${msg}". Composition: rule-of-thirds, professional studio lighting, razor-sharp product focus, aspirational mood. Commercial photography quality, magazine-worthy, no text overlays, no watermarks, no logos, no borders.`
        }

        const even = slotIndex % 2 === 0
        if (even) {
            return `Award-winning advertising visual for ${name}, premium ${industry} brand. Style: ${style}, emotionally compelling and visually arresting. Exact brand colors: ${colors}. Scene: ${themes} — aspirational lifestyle setting. Visual message: "${msg}". Perfect composition, cinematic studio lighting, shallow depth of field. High-end commercial photography, magazine quality, photorealistic, no text, no watermarks.`
        }
        return `Cinematic product advertisement for ${name} (${industry}). Aesthetic: ${style}. Color story: ${colors}. Visual concept: ${themes}. Brand promise shown visually: "${msg}". Stunning hero composition, award-winning photography direction, golden-hour light, perfect exposure. Ultra-realistic, commercial quality, no text overlays, no watermarks.`
    }

    const WA_PREFS_KEY = 'wa_page_prefs'
    function getWaPrefs(): Record<string, string> {
        try { return JSON.parse(localStorage.getItem(WA_PREFS_KEY) || '{}') } catch { return {} }
    }
    function saveWaPref(pageId: string, phone: string) {
        const prefs = getWaPrefs()
        prefs[pageId] = phone
        localStorage.setItem(WA_PREFS_KEY, JSON.stringify(prefs))
    }

    useEffect(() => { fetchAll() }, [strategyId])

    async function fetchPixels(accountId: string) {
        if (!accountId) { setPixels([]); return }
        try {
            const res = await fetch(`/api/ads/integrations/meta/pixels?adAccountId=${accountId}`)
            if (res.ok) {
                const data = await res.json()
                setPixels(data.pixels || [])
            }
        } catch { /* silent */ }
    }

    async function fetchAll() {
        setLoading(true)
        try {
            const [strRes, briefRes] = await Promise.all([
                fetch('/api/ads/strategies'),
                fetch('/api/ads/brief')
            ])
            const [strData, briefData] = await Promise.all([strRes.json(), briefRes.json()])
            const strat = strData.strategies?.find((s: any) => s.id === strategyId)
            if (!strat) { router.push('/dashboard/services/ads/strategies'); return }
            setStrategy(strat)
            setBrief(briefData.brief)

            // Load existing campaign if ?edit=id was passed (from wizard)
            let existingCampaign: any = null
            if (editCampaignId) {
                const campRes = await fetch(`/api/ads/campaign/${editCampaignId}`)
                if (campRes.ok) {
                    const campData = await campRes.json()
                    existingCampaign = campData.campaign
                    setCampaign(existingCampaign)
                    // Use campaign's own brief (more reliable than user's first brief)
                    if (existingCampaign.brief) setBrief(existingCampaign.brief)
                    // Pre-fill form from existing campaign
                    setForm(f => ({
                        ...f,
                        name: existingCampaign.name || f.name,
                        dailyBudgetUSD: String(existingCampaign.dailyBudgetUSD ?? f.dailyBudgetUSD),
                        locations: existingCampaign.locations || [],
                        pageId: existingCampaign.pageId || '',
                        whatsappNumber: existingCampaign.whatsappNumber || '',
                        welcomeMessage: existingCampaign.welcomeMessage || '',
                        pixelId: existingCampaign.pixelId || '',
                        destinationUrl: existingCampaign.destinationUrl || '',
                    }))
                    // Load existing creatives
                    if (existingCampaign.creatives?.length > 0) {
                        setCreatives(existingCampaign.creatives)
                        const hasCopies = existingCampaign.creatives.some((c: any) => c.primaryText)
                        if (hasCopies) setCopiesGenerated(true)
                    } else {
                        const slots = Array.from({ length: strat.mediaCount }, (_, i) => ({
                            id: null, slotIndex: i, primaryText: '', headline: '', description: '', hook: '',
                            mediaUrl: null, mediaType: strat.mediaType, aiGenerated: false, isApproved: false
                        }))
                        setCreatives(slots)
                    }
                    setConfigSaved(true)
                }
            }

            // Fall back to user's first brief if not set from campaign
            if (!existingCampaign?.brief && briefData.brief) {
                setBrief(briefData.brief)
                setForm(f => ({ ...f, name: `${briefData.brief.name} — ${strat.name}` }))
            } else if (!existingCampaign && briefData.brief) {
                setForm(f => ({ ...f, name: `${briefData.brief.name} — ${strat.name}` }))
            }

            const platformId = strat.platform.toLowerCase()
            const accRes = await fetch(`/api/ads/integrations/${platformId}/accounts`)
            let firstAccountId = ''
            if (accRes.ok) {
                const accData = await accRes.json()
                const liveAccounts = accData.accounts || []
                setAccounts(liveAccounts)
                if (liveAccounts.length > 0) {
                    firstAccountId = existingCampaign?.connectedAccount?.providerAccountId
                        || liveAccounts[0].providerAccountId
                    const sel = liveAccounts.find((a: any) => a.providerAccountId === firstAccountId) || liveAccounts[0]
                    setForm(f => ({
                        ...f,
                        providerAccountId: sel.providerAccountId,
                        providerAccountName: sel.displayName
                    }))
                }
            }

            if (strat.platform === 'META') {
                const [pagesRes, pixelsRes, waRes] = await Promise.all([
                    fetch('/api/ads/integrations/meta/pages'),
                    firstAccountId
                        ? fetch(`/api/ads/integrations/meta/pixels?adAccountId=${firstAccountId}`)
                        : Promise.resolve(new Response(JSON.stringify({ pixels: [] }))),
                    fetch('/api/ads/integrations/meta/whatsapp-numbers')
                ])
                const [pData, pxData, waData] = await Promise.all([
                    pagesRes.json(), pixelsRes.json(), waRes.json()
                ])
                setPages(pData.pages || [])
                setPixels(pxData.pixels || [])
                setWaNumbers(waData.phoneNumbers || [])
            }
        } catch (e) { console.error(e) }
        finally { setLoading(false) }
    }

    async function saveConfig() {
        if (!form.name.trim() || !form.providerAccountId) {
            return setError('Nombre y cuenta publicitaria son requeridos')
        }
        if (!brief) return setError('Crea tu Business Brief primero')
        if (strategy?.destination === 'whatsapp' && !form.whatsappNumber) {
            return setError('Selecciona o ingresa un número de WhatsApp Business')
        }
        if (['whatsapp', 'messenger', 'instagram'].includes(strategy?.destination) && !form.pageId) {
            return setError('Selecciona una Página de Facebook')
        }
        if (strategy?.destination === 'website' && !form.destinationUrl) {
            return setError('Ingresa la URL de destino')
        }
        setSavingConfig(true)
        setError(null)
        try {
            const payload = {
                briefId: brief.id,
                strategyId,
                name: form.name.trim(),
                providerAccountId: form.providerAccountId,
                providerAccountName: form.providerAccountName,
                dailyBudgetUSD: parseFloat(form.dailyBudgetUSD || '8'),
                locations: form.locations,
                pageId: form.pageId || null,
                whatsappNumber: form.whatsappNumber || null,
                welcomeMessage: form.welcomeMessage.trim() || null,
                pixelId: form.pixelId || null,
                destinationUrl: form.destinationUrl || null
            }
            // PATCH if campaign already exists (e.g. came from wizard), otherwise POST
            const res = campaign
                ? await fetch(`/api/ads/campaign/${campaign.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                })
                : await fetch('/api/ads/campaign', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                })
            const data = await res.json()
            if (!res.ok) return setError(data.error || 'Error al guardar')
            setCampaign(data.campaign)
            // Only reset creatives if we're creating a new campaign (not editing existing)
            if (!campaign) {
                const slots = Array.from({ length: strategy.mediaCount }, (_, i) => ({
                    id: null, slotIndex: i, primaryText: '', headline: '', description: '', hook: '',
                    mediaUrl: null, mediaType: strategy.mediaType, aiGenerated: false, isApproved: false
                }))
                setCreatives(slots)
            }
            setConfigSaved(true)
            setSuccess('✓ Configuración guardada')
            setTimeout(() => setSuccess(null), 3000)
            setTimeout(() => creativesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
        } catch { setError('Error de conexión') }
        finally { setSavingConfig(false) }
    }

    async function handleFileUpload(slotIndex: number, file: File) {
        if (!campaign) return
        const blobUrl = URL.createObjectURL(file)
        setCreatives(prev => prev.map(c =>
            c.slotIndex === slotIndex ? { ...c, mediaUrl: blobUrl, mediaType: file.type.startsWith('video') ? 'video' : 'image', uploading: true } : c
        ))
        try {
            const creative = creatives.find(c => c.slotIndex === slotIndex)
            const fd = new FormData()
            fd.append('file', file)
            fd.append('slotIndex', String(slotIndex))
            if (creative?.id) fd.append('creativeId', creative.id)
            const res = await fetch(`/api/ads/campaign/${campaign.id}/upload`, { method: 'POST', body: fd })
            const data = await res.json()
            if (res.ok && data.mediaUrl) {
                setCreatives(prev => prev.map(c =>
                    c.slotIndex === slotIndex
                        ? { ...c, mediaUrl: data.mediaUrl, mediaType: file.type.startsWith('video') ? 'video' : 'image', uploading: false }
                        : c
                ))
                URL.revokeObjectURL(blobUrl)
            } else {
                setError(data.error || 'Error al subir archivo')
                setCreatives(prev => prev.map(c => c.slotIndex === slotIndex ? { ...c, mediaUrl: null, uploading: false } : c))
                URL.revokeObjectURL(blobUrl)
            }
        } catch (err: any) {
            console.error('[Upload] frontend error:', err)
            setError('Error de conexión al subir archivo')
            setCreatives(prev => prev.map(c => c.slotIndex === slotIndex ? { ...c, mediaUrl: null, uploading: false } : c))
            URL.revokeObjectURL(blobUrl)
        }
    }

    async function generateCopies() {
        if (!campaign) return
        setGeneratingCopies(true)
        setError(null)
        try {
            const res = await fetch(`/api/ads/campaign/${campaign.id}/copies`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            })
            const data = await res.json()
            if (!res.ok) return setError(data.error || 'Error al generar copies')
            // Preserve mediaUrl/mediaType from current state — DB may not have the latest generated image yet
            setCreatives(prev => {
                const prevBySlot = new Map(prev.map((c: any) => [c.slotIndex, c]))
                return data.creatives.map((c: any) => {
                    const existing = prevBySlot.get(c.slotIndex)
                    return {
                        ...c,
                        mediaUrl: existing?.mediaUrl || c.mediaUrl || null,
                        mediaType: existing?.mediaType || c.mediaType || null,
                    }
                })
            })
            setCopiesGenerated(true)
            setTimeout(() => copiesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
        } catch { setError('Error de conexión') }
        finally { setGeneratingCopies(false) }
    }

    async function generateImage(slotIndex: number) {
        if (!campaign) return
        const sizeMap: Record<string, string> = {
            square: '1024x1024',
            vertical: '1024x1792',
            horizontal: '1792x1024',
        }
        setGeneratingImages(prev => ({ ...prev, [slotIndex]: true }))
        setImageGenPanel(null)
        setError(null)
        try {
            const creative = creatives.find(c => c.slotIndex === slotIndex)
            const res = await fetch(`/api/ads/campaign/${campaign.id}/images`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    slotIndex,
                    creativeId: creative?.id || undefined,
                    quality: imageQuality,
                    size: sizeMap[imageFormat] || '1024x1024',
                    customPrompt: imageCustomPrompts[slotIndex]?.trim() || undefined,
                    referenceImageUrl: creative?.mediaUrl || undefined,
                })
            })
            const data = await res.json()
            if (!res.ok) { setError(data.error || 'Error al generar imagen'); return }
            setCreatives(prev => prev.map(c =>
                c.slotIndex === slotIndex
                    ? { ...c, id: data.creativeId || c.id, mediaUrl: data.imageUrl, mediaType: 'image', aiGenerated: true }
                    : c
            ))
        } catch { setError('Error al generar imagen con IA') }
        finally { setGeneratingImages(prev => ({ ...prev, [slotIndex]: false })) }
    }

    async function saveCopies() {
        if (!campaign) return
        try {
            await fetch(`/api/ads/campaign/${campaign.id}/copies`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ creatives: creatives.filter(c => c.id) })
            })
        } catch { /* silent */ }
    }

    async function publish() {
        if (!campaign) return
        await saveCopies()
        setPublishing(true)
        setError(null)
        try {
            const res = await fetch(`/api/ads/campaign/${campaign.id}/publish`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            })
            const data = await res.json()
            if (!res.ok) return setError(data.error || 'Error al publicar')
            setSuccess('¡Campaña publicada! Disponible en tu Ads Manager en estado PAUSADO.')
            setTimeout(() => router.push('/dashboard/services/ads'), 2500)
        } catch { setError('Error al publicar') }
        finally { setPublishing(false) }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="animate-spin text-amber-400" size={32} />
            </div>
        )
    }

    if (!strategy) return null

    const needsPage = strategy.platform === 'META'
    const needsWhatsApp = strategy.destination === 'whatsapp'
    const needsPixel = strategy.destination === 'website'
    const needsUrl = strategy.destination === 'website'
    const creativesReady = creatives.filter(c => c.mediaUrl).length
    const canPublish = campaign && copiesGenerated && creatives.some(c => c.primaryText) && campaign.status !== 'PUBLISHED' && campaign.status !== 'PUBLISHING'

    return (
        <div className="px-4 md:px-6 pt-6 max-w-4xl mx-auto pb-32 text-white">

            {/* Header */}
            <div className="flex items-center gap-4 mb-6">
                <Link href="/dashboard/services/ads/strategies" className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all">
                    <ArrowLeft size={16} />
                </Link>
                <div className="flex-1 min-w-0">
                    <h1 className="text-xl font-black uppercase tracking-tighter truncate">{strategy.name}</h1>
                    <p className="text-xs text-white/30">{brief?.name || 'Business Brief requerido'}</p>
                </div>
                {/* Progress pills */}
                <div className="hidden md:flex items-center gap-1.5 shrink-0">
                    {[
                        { label: 'Config', done: configSaved },
                        { label: 'Creativos', done: creativesReady > 0 },
                        { label: 'Copies', done: copiesGenerated }
                    ].map((s, i) => (
                        <span key={i} className={`text-[10px] font-bold px-2.5 py-1 rounded-full border transition-all ${s.done ? 'bg-green-500/15 border-green-500/25 text-green-400' : 'bg-white/5 border-white/10 text-white/25'}`}>
                            {s.done ? '✓ ' : ''}{s.label}
                        </span>
                    ))}
                </div>
            </div>

            {/* Strategy badges */}
            <div className="flex flex-wrap items-center gap-2 mb-6 px-4 py-3 bg-dark-900/40 border border-white/5 rounded-2xl">
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400">{strategy.platform}</span>
                <span className="text-xs text-white/40 flex items-center gap-1">
                    {strategy.mediaType === 'video' ? <Video size={11} /> : <ImageIcon size={11} />}
                    {strategy.mediaCount} {strategy.mediaType === 'video' ? 'videos' : 'imágenes'}
                </span>
                <span className="text-white/15">·</span>
                <span className="text-xs text-white/40 capitalize">{strategy.destination}</span>
                <span className="text-white/15">·</span>
                <span className="text-xs text-white/40">desde ${strategy.minBudgetUSD}/día</span>
            </div>

            {/* Alerts */}
            {error && (
                <div className="mb-5 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex gap-3 text-red-400 text-sm">
                    <AlertCircle size={16} className="shrink-0 mt-0.5" />
                    <p>{error}</p>
                    <button onClick={() => setError(null)} className="ml-auto text-xs font-bold">✕</button>
                </div>
            )}
            {success && (
                <div className="mb-5 p-4 bg-green-500/10 border border-green-500/20 rounded-2xl flex gap-3 text-green-400 text-sm">
                    <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
                    <p>{success}</p>
                </div>
            )}

            {/* ──────── SECTION 1: CONFIG ──────── */}
            <div className={`mb-4 rounded-2xl border transition-all ${configSaved ? 'border-green-500/20 bg-green-500/3' : 'border-white/8 bg-dark-900/40'}`}>
                <div className="p-4 md:p-5">
                    <div className="flex items-center justify-between mb-4">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 flex items-center gap-2">
                            <Settings2 size={12} />
                            Configuración
                            {configSaved && <span className="text-green-400 flex items-center gap-1"><CheckCircle2 size={11} /> Guardada</span>}
                        </p>
                    </div>

                    <div className="space-y-4">
                        {/* Campaign name */}
                        <div>
                            <label className="text-xs font-bold text-white/40 uppercase tracking-widest block mb-2">Nombre de la campaña</label>
                            <input
                                value={form.name}
                                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50"
                            />
                        </div>

                        {/* 2-col grid for account + page */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Ad account */}
                            {accounts.length > 0 ? (
                                <div>
                                    <label className="text-xs font-bold text-white/40 uppercase tracking-widest block mb-2">Cuenta Publicitaria</label>
                                    <select
                                        value={form.providerAccountId}
                                        onChange={e => {
                                            const sel = accounts.find((a: any) => a.providerAccountId === e.target.value)
                                            setForm(f => ({ ...f, providerAccountId: e.target.value, providerAccountName: sel?.displayName || '', pixelId: '' }))
                                            if (strategy?.platform === 'META') fetchPixels(e.target.value)
                                        }}
                                        className="w-full bg-[#0d0d1a] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50 [&>option]:bg-[#0d0d1a]"
                                    >
                                        {accounts.map((a: any) => (
                                            <option key={a.providerAccountId} value={a.providerAccountId}>{a.displayName}</option>
                                        ))}
                                    </select>
                                </div>
                            ) : (
                                <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-xs text-yellow-400">
                                    Sin cuenta conectada. <Link href="/dashboard/services/ads/setup?tab=platforms" className="underline font-bold">Conectar</Link>
                                </div>
                            )}

                            {/* Facebook page */}
                            {needsPage && pages.length > 0 && (
                                <div>
                                    <label className="text-xs font-bold text-white/40 uppercase tracking-widest block mb-2">Página de Facebook</label>
                                    <select
                                        value={form.pageId}
                                        onChange={e => {
                                            const pid = e.target.value
                                            const selectedPage = pages.find((p: any) => p.id === pid)
                                            const saved = pid ? getWaPrefs()[pid] : ''
                                            setForm(f => ({
                                                ...f,
                                                pageId: pid,
                                                whatsappNumber: selectedPage?.whatsappNumber || saved || ''
                                            }))
                                        }}
                                        className="w-full bg-[#0d0d1a] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50 [&>option]:bg-[#0d0d1a]"
                                    >
                                        <option value="">Seleccionar página...</option>
                                        {pages.map((p: any) => (
                                            <option key={p.id} value={p.id}>{p.name}{p.whatsappNumber ? ` | ${p.whatsappNumber}` : ''}</option>
                                        ))}
                                    </select>
                                    {/* Instagram badge */}
                                    {form.pageId && pages.find((p: any) => p.id === form.pageId)?.instagramUsername && (
                                        <div className="mt-1.5 flex items-center gap-2 px-2.5 py-1.5 bg-pink-500/5 border border-pink-500/15 rounded-xl">
                                            <span className="text-[10px] font-bold text-pink-400 uppercase">Instagram</span>
                                            <span className="text-xs text-white/50">@{pages.find((p: any) => p.id === form.pageId)?.instagramUsername}</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* WhatsApp picker */}
                        {needsWhatsApp && (
                            <div>
                                <label className="text-xs font-bold text-white/40 uppercase tracking-widest flex items-center gap-1.5 mb-2">
                                    <Phone size={11} /> Cuenta de WhatsApp Business
                                </label>
                                {form.whatsappNumber ? (
                                    <div className="flex items-center justify-between px-3 py-2.5 bg-green-500/5 border border-green-500/20 rounded-xl">
                                        <div className="flex items-center gap-2">
                                            <Phone size={13} className="text-green-400" />
                                            <span className="text-sm text-green-300 font-mono">{form.whatsappNumber}</span>
                                        </div>
                                        <button onClick={() => setForm(f => ({ ...f, whatsappNumber: '' }))} className="text-[11px] text-white/30 hover:text-white">Cambiar</button>
                                    </div>
                                ) : (
                                    <div className="space-y-1.5">
                                        {(() => {
                                            const selPage = pages.find((p: any) => p.id === form.pageId)
                                            const pageNums: string[] = selPage?.whatsappNumbers?.length ? selPage.whatsappNumbers : selPage?.whatsappNumber ? [selPage.whatsappNumber] : []
                                            const nums = pageNums.length > 0 ? pageNums.map((ph: string) => ({ displayPhone: ph, name: '', id: ph })) : waNumbers
                                            if (nums.length > 0) return nums.map((n: any) => (
                                                <button key={n.id || n.displayPhone} type="button"
                                                    onClick={() => { setForm(f => ({ ...f, whatsappNumber: n.displayPhone })); if (form.pageId) saveWaPref(form.pageId, n.displayPhone) }}
                                                    className="w-full flex items-center justify-between px-3 py-2.5 bg-white/3 border border-white/8 hover:border-green-500/40 hover:bg-green-500/5 rounded-xl transition-all text-left">
                                                    <div className="flex items-center gap-2">
                                                        <Phone size={13} className="text-green-400/60" />
                                                        <span className="text-sm font-mono text-white/90">{n.displayPhone}</span>
                                                        {n.name && <span className="text-[11px] text-white/35">{n.name}</span>}
                                                    </div>
                                                    {n.status && <span className={`text-[10px] font-bold uppercase ${n.status === 'CONNECTED' ? 'text-green-400' : 'text-yellow-400'}`}>{n.status}</span>}
                                                </button>
                                            ))
                                            return null
                                        })()}
                                        <input
                                            value={form.whatsappNumber}
                                            onChange={e => setForm(f => ({ ...f, whatsappNumber: e.target.value }))}
                                            onBlur={e => { if (form.pageId && e.target.value) saveWaPref(form.pageId, e.target.value) }}
                                            placeholder="+573001234567"
                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-green-500/50 placeholder:text-white/20"
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Welcome message (WhatsApp only) */}
                        {needsWhatsApp && (
                            <div>
                                <label className="text-xs font-bold text-white/40 uppercase tracking-widest flex items-center gap-1.5 mb-1">
                                    <Phone size={11} /> Mensaje de plantilla (opcional)
                                </label>
                                <p className="text-[11px] text-white/25 mb-2">Este texto aparecerá pre-escrito en el WhatsApp del usuario cuando haga clic en el anuncio. Configúralo también en Meta Business Manager → Configuración de Página → WhatsApp.</p>
                                <textarea
                                    value={form.welcomeMessage}
                                    onChange={e => setForm(f => ({ ...f, welcomeMessage: e.target.value }))}
                                    placeholder="Ej: Hola, me interesa saber más sobre sus productos 👋"
                                    rows={2}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-green-500/50 placeholder:text-white/20 resize-none"
                                />
                            </div>
                        )}

                        {/* Pixel + URL */}
                        {needsPixel && pixels.length > 0 && (
                            <div>
                                <label className="text-xs font-bold text-white/40 uppercase tracking-widest block mb-2">Pixel de seguimiento</label>
                                <select value={form.pixelId} onChange={e => setForm(f => ({ ...f, pixelId: e.target.value }))}
                                    className="w-full bg-[#0d0d1a] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50 [&>option]:bg-[#0d0d1a]">
                                    <option value="">Sin pixel</option>
                                    {pixels.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            </div>
                        )}
                        {needsUrl && (
                            <div>
                                <label className="text-xs font-bold text-white/40 uppercase tracking-widest block mb-2">URL de destino</label>
                                <input value={form.destinationUrl} onChange={e => setForm(f => ({ ...f, destinationUrl: e.target.value }))}
                                    placeholder="https://tusitio.com"
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50 placeholder:text-white/20" />
                            </div>
                        )}

                        {/* Budget + Locations row */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Budget with slider */}
                            <div>
                                <label className="text-xs font-bold text-white/40 uppercase tracking-widest flex items-center gap-1 mb-2">
                                    <DollarSign size={11} /> Presupuesto diario
                                </label>
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-2xl font-black text-white">${form.dailyBudgetUSD}</span>
                                        <span className="text-xs text-white/30">USD/día</span>
                                    </div>
                                    <input
                                        type="range"
                                        min={strategy.minBudgetUSD}
                                        max={Math.max(100, strategy.minBudgetUSD * 10)}
                                        step="0.5"
                                        value={form.dailyBudgetUSD}
                                        onChange={e => setForm(f => ({ ...f, dailyBudgetUSD: e.target.value }))}
                                        className="w-full accent-amber-500"
                                    />
                                    <div className="flex justify-between text-[10px] text-white/20">
                                        <span>Mín ${strategy.minBudgetUSD}</span>
                                        <span>Máx ${Math.max(100, strategy.minBudgetUSD * 10)}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Locations */}
                            <div>
                                <label className="text-xs font-bold text-white/40 uppercase tracking-widest flex items-center gap-1 mb-2">
                                    <MapPin size={11} /> Ubicaciones objetivo
                                    <span className="text-white/20 font-normal normal-case tracking-normal ml-1">(opcional)</span>
                                </label>
                                <LocationSelector
                                    selected={form.locations}
                                    onChange={locs => setForm(f => ({ ...f, locations: locs }))}
                                    platform={strategy?.platform || 'META'}
                                />
                            </div>
                        </div>

                        {/* Save config button */}
                        <button
                            onClick={saveConfig}
                            disabled={savingConfig || !form.providerAccountId || !form.name.trim()}
                            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-amber-600 to-amber-600 text-white font-bold py-3.5 rounded-2xl hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-[0_0_20px_rgba(139,92,246,0.25)]"
                        >
                            {savingConfig ? <><Loader2 size={16} className="animate-spin" /> Guardando...</> : configSaved ? <><CheckCircle2 size={16} /> Actualizar configuración</> : <><Zap size={16} /> Guardar y continuar</>}
                        </button>
                    </div>
                </div>
            </div>

            {/* ──────── SECTION 2: CREATIVES ──────── */}
            <div ref={creativesRef} className={`mb-4 rounded-2xl border transition-all relative ${!configSaved ? 'border-white/5 bg-dark-900/20' : 'border-white/8 bg-dark-900/40'}`}>
            {!configSaved && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-2xl">
                    <div className="px-4 py-2.5 rounded-xl bg-black/60 border border-white/10 backdrop-blur-sm flex items-center gap-2">
                        <Settings2 size={13} className="text-white/40" />
                        <span className="text-xs text-white/50 font-bold">Guarda la configuración primero</span>
                    </div>
                </div>
            )}
            <div className={!configSaved ? 'opacity-30 pointer-events-none' : ''}>
                <div className="p-4 md:p-5">
                    <div className="flex items-center justify-between mb-4">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 flex items-center gap-2">
                            <ImageIcon size={12} />
                            Creativos
                            {configSaved && <span className="text-white/30">({creativesReady}/{strategy.mediaCount} subidos)</span>}
                        </p>
                        <span className="text-[10px] text-white/20">Opcional — puedes continuar sin subir</span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                        {(configSaved ? creatives : Array.from({ length: strategy.mediaCount }, (_, i) => ({ slotIndex: i, mediaUrl: null }))).map((creative: any, i: number) => (
                            <div key={i} className="flex flex-col gap-2">
                                {/* Image slot */}
                                <div className="aspect-square bg-dark-900/60 border border-white/8 rounded-2xl overflow-hidden relative group">
                                    {(generatingImages[i]) ? (
                                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-amber-900/20">
                                            <Loader2 size={22} className="animate-spin text-amber-400" />
                                            <span className="text-[10px] text-amber-300 font-bold">Generando...</span>
                                        </div>
                                    ) : creative.mediaUrl ? (
                                        <>
                                            {creative.mediaType === 'video'
                                                ? <video src={creative.mediaUrl} className="w-full h-full object-cover" />
                                                : <img src={creative.mediaUrl} alt="" className="w-full h-full object-cover" />
                                            }
                                                                    {creative.uploading ? (
                                                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                                    <Loader2 size={20} className="animate-spin text-white/70" />
                                                </div>
                                            ) : (
                                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-all hidden md:flex items-center justify-center gap-2">
                                                    <button onClick={() => fileRefs.current[i]?.click()} className="p-2 rounded-xl bg-white/20 hover:bg-white/40" title="Cambiar imagen">
                                                        <Upload size={13} />
                                                    </button>
                                                    <button onClick={() => {
                                                        setImageGenPanel(imageGenPanel === i ? null : i)
                                                        if (imageGenPanel !== i) {
                                                            setImageCustomPrompts(prev => ({ ...prev, [i]: generateSmartPrompt(i, true) }))
                                                        }
                                                    }} className="p-2 rounded-xl bg-amber-500/40 hover:bg-amber-500/60" title="Mejorar/Regenerar con IA">
                                                        <Wand2 size={13} />
                                                    </button>
                                                </div>
                                            )}
                                            <div className="absolute bottom-2 left-2 flex items-center gap-1">
                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-black/60 text-white/60">#{i + 1}</span>
                                                {creative.aiGenerated && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/70 text-white">IA</span>}
                                            </div>
                                        </>
                                    ) : (
                                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5">
                                            <span className="text-xs text-white/15 font-bold">#{i + 1}</span>
                                            {configSaved && (
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => fileRefs.current[i]?.click()}
                                                        className="flex flex-col items-center gap-1 p-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/15 transition-all"
                                                        title="Subir archivo"
                                                    >
                                                        <Upload size={13} className="text-white/40" />
                                                        <span className="text-[9px] text-white/25">Subir</span>
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            setImageGenPanel(imageGenPanel === i ? null : i)
                                                            if (imageGenPanel !== i) {
                                                                setImageCustomPrompts(prev => ({ ...prev, [i]: generateSmartPrompt(i, false) }))
                                                            }
                                                        }}
                                                        className="flex flex-col items-center gap-1 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 hover:bg-amber-500/20 transition-all"
                                                        title="Generar con IA"
                                                    >
                                                        <Wand2 size={13} className="text-amber-400" />
                                                        <span className="text-[9px] text-amber-400">IA</span>
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    {configSaved && (
                                        <input
                                            ref={el => { fileRefs.current[i] = el }}
                                            type="file"
                                            accept={strategy.mediaType === 'video' ? 'video/*' : 'image/*,video/*'}
                                            className="hidden"
                                            onChange={e => { if (e.target.files?.[0]) handleFileUpload(i, e.target.files[0]) }}
                                        />
                                    )}
                                </div>

                                {/* Mobile-only action buttons (hover not available on touch) */}
                                {creative.mediaUrl && !creative.uploading && configSaved && (
                                    <div className="flex md:hidden gap-1.5">
                                        <button
                                            onClick={() => fileRefs.current[i]?.click()}
                                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-white/5 border border-white/10 text-[10px] font-bold text-white/50 active:bg-white/15"
                                        >
                                            <Upload size={11} /> Cambiar
                                        </button>
                                        <button
                                            onClick={() => {
                                                setImageGenPanel(imageGenPanel === i ? null : i)
                                                if (imageGenPanel !== i) setImageCustomPrompts(prev => ({ ...prev, [i]: generateSmartPrompt(i, true) }))
                                            }}
                                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-amber-500/10 border border-amber-500/25 text-[10px] font-bold text-amber-400 active:bg-amber-500/20"
                                        >
                                            <Wand2 size={11} /> IA
                                        </button>
                                    </div>
                                )}

                                {/* AI Generation Panel (inline, per slot) */}
                                {imageGenPanel === i && configSaved && (
                                    <div className="bg-[#0d0d1f] border border-amber-500/25 rounded-2xl p-3 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-400 flex items-center gap-1.5">
                                                <Wand2 size={10} /> {creatives.find(c => c.slotIndex === i)?.mediaUrl ? 'Editar imagen con IA' : 'Generar con IA'}
                                            </p>
                                            <button onClick={() => setImageGenPanel(null)} className="text-white/30 hover:text-white">
                                                <X size={12} />
                                            </button>
                                        </div>
                                        {creatives.find(c => c.slotIndex === i)?.mediaUrl && (
                                            <div className="flex items-center gap-2 px-2.5 py-1.5 bg-green-500/8 border border-green-500/20 rounded-xl">
                                                <CheckCircle2 size={10} className="text-green-400 shrink-0" />
                                                <p className="text-[9px] text-green-300 leading-tight">
                                                    <span className="font-bold">gpt-image-1</span> usará tu imagen subida como base y la mejorará con IA
                                                </p>
                                            </div>
                                        )}

                                        {/* Quality */}
                                        <div>
                                            <p className="text-[9px] text-white/25 uppercase font-bold mb-1.5">Calidad</p>
                                            <div className="grid grid-cols-3 gap-1.5">
                                                {([
                                                    { key: 'fast', label: 'Rápida', icon: Gauge, color: 'text-green-400', border: 'border-green-500/30', bg: 'bg-green-500/10' },
                                                    { key: 'standard', label: 'Estándar', icon: Star, color: 'text-amber-400', border: 'border-amber-500/30', bg: 'bg-amber-500/10' },
                                                    { key: 'premium', label: 'Premium', icon: Trophy, color: 'text-yellow-400', border: 'border-yellow-500/30', bg: 'bg-yellow-500/10' },
                                                ] as const).map(q => (
                                                    <button
                                                        key={q.key}
                                                        onClick={() => setImageQuality(q.key)}
                                                        className={`flex flex-col items-center gap-1 py-2 rounded-xl border text-[9px] font-bold transition-all ${imageQuality === q.key ? `${q.bg} ${q.border} ${q.color}` : 'bg-white/3 border-white/8 text-white/30 hover:border-white/20'}`}
                                                    >
                                                        <q.icon size={12} />
                                                        {q.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Format */}
                                        <div>
                                            <p className="text-[9px] text-white/25 uppercase font-bold mb-1.5">Formato</p>
                                            <div className="grid grid-cols-3 gap-1.5">
                                                {([
                                                    { key: 'square', label: 'Feed', ratio: '1:1' },
                                                    { key: 'vertical', label: 'Reels', ratio: '9:16' },
                                                    { key: 'horizontal', label: 'Banner', ratio: '16:9' },
                                                ] as const).map(f => (
                                                    <button
                                                        key={f.key}
                                                        onClick={() => setImageFormat(f.key)}
                                                        className={`flex flex-col items-center gap-0.5 py-2 rounded-xl border text-[9px] font-bold transition-all ${imageFormat === f.key ? 'bg-amber-500/15 border-amber-500/40 text-amber-300' : 'bg-white/3 border-white/8 text-white/30 hover:border-white/20'}`}
                                                    >
                                                        <div className={`border-2 rounded-sm ${imageFormat === f.key ? 'border-amber-400' : 'border-white/20'} ${f.key === 'square' ? 'w-4 h-4' : f.key === 'vertical' ? 'w-3 h-5' : 'w-5 h-3'}`} />
                                                        <span>{f.label}</span>
                                                        <span className={`text-[8px] ${imageFormat === f.key ? 'text-amber-400' : 'text-white/20'}`}>{f.ratio}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* AI-suggested prompt */}
                                        <div>
                                            <div className="flex items-center justify-between mb-1.5">
                                                <p className="text-[9px] text-white/25 uppercase font-bold flex items-center gap-1">
                                                    <Sparkles size={8} className="text-amber-400" />
                                                    Prompt IA <span className="normal-case font-normal text-amber-400/60">— edita si quieres</span>
                                                </p>
                                                <button
                                                    onClick={() => setImageCustomPrompts(prev => ({ ...prev, [i]: generateSmartPrompt(i, !!(creatives.find(c => c.slotIndex === i)?.mediaUrl)) }))}
                                                    className="text-[9px] text-amber-400/60 hover:text-amber-400 flex items-center gap-1 transition-colors"
                                                    title="Regenerar sugerencia"
                                                >
                                                    <RefreshCw size={8} /> Nueva sugerencia
                                                </button>
                                            </div>
                                            <textarea
                                                value={imageCustomPrompts[i] || ''}
                                                onChange={e => setImageCustomPrompts(prev => ({ ...prev, [i]: e.target.value }))}
                                                placeholder="La IA sugerirá un prompt basado en tu brief..."
                                                rows={3}
                                                className="w-full bg-white/5 border border-amber-500/20 rounded-xl px-2.5 py-2 text-[10px] text-white/70 resize-none focus:outline-none focus:border-amber-500/50 placeholder:text-white/15 leading-relaxed"
                                            />
                                            <p className="text-[8px] text-white/15 mt-1 leading-relaxed">
                                                {creatives.find(c => c.slotIndex === i)?.mediaUrl
                                                    ? 'gpt-image-1 tomará tu imagen como base y la editará según este prompt — ideal para mejorar fotos de producto.'
                                                    : 'DALL-E 3 generará una imagen nueva desde cero usando este prompt y el brief de tu negocio.'}
                                            </p>
                                        </div>

                                        <button
                                            onClick={() => generateImage(i)}
                                            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-amber-600 text-white text-xs font-bold hover:opacity-90 transition-all"
                                        >
                                            <Sparkles size={12} />
                                            {creatives.find(c => c.slotIndex === i)?.mediaUrl ? 'Editar imagen con gpt-image-1' : 'Generar imagen con DALL-E 3'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Generate copies button */}
                    {configSaved && (
                        <button
                            onClick={generateCopies}
                            disabled={generatingCopies}
                            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-amber-600 to-amber-600 text-white font-bold py-3.5 rounded-2xl hover:opacity-90 disabled:opacity-40 transition-all shadow-[0_0_20px_rgba(139,92,246,0.25)]"
                        >
                            {generatingCopies
                                ? <><Loader2 size={16} className="animate-spin" /> Generando copies con IA...</>
                                : <><Sparkles size={16} /> {copiesGenerated ? 'Regenerar Copies IA' : 'Generar Copies con IA'}</>
                            }
                        </button>
                    )}
                </div>
            </div>
            </div>

            {/* ──────── GENERATING COPIES SKELETON ──────── */}
            {generatingCopies && !copiesGenerated && (
                <div className="mb-4 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5 space-y-3">
                    <div className="flex items-center gap-2 mb-4">
                        <Loader2 size={14} className="animate-spin text-amber-400" />
                        <p className="text-xs font-bold text-amber-400 uppercase tracking-widest">Generando copies con IA...</p>
                    </div>
                    {Array.from({ length: Math.min(strategy.mediaCount, 3) }).map((_, i) => (
                        <div key={i} className="bg-white/3 border border-white/6 rounded-2xl p-4 space-y-3 animate-pulse">
                            <div className="h-3 w-24 bg-white/10 rounded-full" />
                            <div className="h-16 bg-white/5 rounded-xl" />
                            <div className="grid grid-cols-2 gap-3">
                                <div className="h-8 bg-white/5 rounded-xl" />
                                <div className="h-8 bg-white/5 rounded-xl" />
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* ──────── SECTION 3: COPIES ──────── */}
            {copiesGenerated && (
                <div ref={copiesRef} className={`mb-4 rounded-2xl border border-white/8 bg-dark-900/40 transition-opacity ${generatingCopies ? 'opacity-40 pointer-events-none' : ''}`}>
                    <div className="p-4 md:p-5">
                        <div className="flex items-center justify-between mb-4">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 flex items-center gap-2">
                                <Sparkles size={12} />
                                Copies IA — {creatives.length} anuncios
                            </p>
                            <button
                                onClick={generateCopies}
                                disabled={generatingCopies}
                                className="text-xs font-bold px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 hover:bg-amber-500/20 flex items-center gap-1.5 transition-all"
                            >
                                {generatingCopies ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                                Regenerar
                            </button>
                        </div>

                        <div className="space-y-4">
                            {creatives.map((creative, i) => (
                                <div key={i} className="bg-white/3 border border-white/6 rounded-2xl p-4">
                                    <div className="flex flex-wrap items-center gap-1.5 mb-3">
                                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-white/5 text-white/30">Anuncio #{i + 1}</span>
                                        {creative.aiGenerated && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">IA</span>}
                                        {creative.mediaUrl && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 flex items-center gap-1"><CheckCircle2 size={9} /> Creativo</span>}
                                    </div>
                                    {creative.hook && (
                                        <div className="mb-3 p-2.5 bg-amber-500/5 border border-amber-500/15 rounded-xl">
                                            <p className="text-[10px] text-amber-400 font-bold uppercase mb-1">Hook</p>
                                            <p className="text-xs text-white/60 italic">"{creative.hook}"</p>
                                        </div>
                                    )}
                                    <div className="space-y-3">
                                        <div>
                                            <label className="text-[10px] font-bold text-white/25 uppercase tracking-widest block mb-1">Texto Principal</label>
                                            <textarea
                                                value={creative.primaryText}
                                                onChange={e => setCreatives(prev => prev.map((c, j) => j === i ? { ...c, primaryText: e.target.value } : c))}
                                                rows={5}
                                                className="w-full bg-white/5 border border-white/8 rounded-xl px-3 py-2 text-xs text-white/80 resize-none focus:outline-none focus:border-amber-500/50 leading-relaxed"
                                            />
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            <div>
                                                <label className="text-[10px] font-bold text-white/25 uppercase tracking-widest block mb-1">Titular</label>
                                                <input value={creative.headline} onChange={e => setCreatives(prev => prev.map((c, j) => j === i ? { ...c, headline: e.target.value } : c))}
                                                    className="w-full bg-white/5 border border-white/8 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50" />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-bold text-white/25 uppercase tracking-widest block mb-1">Descripción</label>
                                                <input value={creative.description || ''} onChange={e => setCreatives(prev => prev.map((c, j) => j === i ? { ...c, description: e.target.value } : c))}
                                                    className="w-full bg-white/5 border border-white/8 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50" />
                                            </div>
                                        </div>
                                        {/* Hashtags section */}
                                        {creative.hashtags && (
                                            <div className="p-2.5 bg-amber-500/5 border border-amber-500/15 rounded-xl">
                                                <div className="flex items-center justify-between mb-2">
                                                    <p className="text-[9px] font-bold text-amber-400 uppercase tracking-widest">Hashtags ganadores</p>
                                                    <button
                                                        onClick={() => {
                                                            const appended = creative.primaryText
                                                                ? `${creative.primaryText}\n\n${creative.hashtags}`
                                                                : creative.hashtags
                                                            setCreatives(prev => prev.map((c, j) => j === i ? { ...c, primaryText: appended } : c))
                                                        }}
                                                        className="text-[9px] text-amber-400/60 hover:text-amber-400 flex items-center gap-1 transition-colors"
                                                    >
                                                        <Sparkles size={8} /> Agregar al texto
                                                    </button>
                                                </div>
                                                <div className="flex flex-wrap gap-1">
                                                    {creative.hashtags.split(' ').filter(Boolean).map((tag: string, ti: number) => (
                                                        <button
                                                            key={ti}
                                                            onClick={() => {
                                                                const text = creative.primaryText || ''
                                                                if (!text.includes(tag)) {
                                                                    setCreatives(prev => prev.map((c, j) => j === i ? { ...c, primaryText: text ? `${text} ${tag}` : tag } : c))
                                                                }
                                                            }}
                                                            className="text-[9px] font-bold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 px-2 py-0.5 rounded-full transition-all"
                                                        >
                                                            {tag}
                                                        </button>
                                                    ))}
                                                </div>
                                                <p className="text-[8px] text-white/15 mt-1.5">Haz clic en un hashtag para agregarlo al texto, o usa "Agregar al texto" para incluirlos todos</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ──────── FLOATING PUBLISH BAR ──────── */}
            {campaign && (
                <div className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-6 pt-4 bg-gradient-to-t from-[#060610] via-[#060610]/95 to-transparent">
                    <div className="max-w-4xl mx-auto flex items-center gap-3">
                        <div className="flex-1 min-w-0 hidden sm:block">
                            <p className="text-xs font-bold text-white/60 truncate">{form.name}</p>
                            <p className="text-[11px] text-white/30">
                                {!copiesGenerated ? 'Genera los copies para continuar' : canPublish ? 'Revisa el preview antes de publicar' : 'Completa los copies'}
                            </p>
                        </div>
                        <button
                            onClick={() => { setPreviewIdx(0); setShowPreview(true) }}
                            disabled={!canPublish || publishing}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 sm:px-5 py-3 rounded-2xl font-bold text-sm bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-[0_0_25px_rgba(16,185,129,0.35)]"
                        >
                            {publishing
                                ? <><Loader2 size={15} className="animate-spin" /> <span>Publicando...</span></>
                                : <><Eye size={15} /> <span className="hidden sm:inline">Ver preview y </span>Publicar</>
                            }
                        </button>
                    </div>
                </div>
            )}

            {/* ──────── PREVIEW MODAL ──────── */}
            {showPreview && creatives.length > 0 && (() => {
                const c = creatives[previewIdx]
                const pageName = pages.find((p: any) => p.id === form.pageId)?.name || form.name
                return (
                    <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/80 backdrop-blur-sm">
                        <div className="flex min-h-full items-center justify-center p-4">
                        <div className="relative w-full max-w-sm py-10">
                            {/* Close */}
                            <button onClick={() => setShowPreview(false)}
                                className="absolute top-0 right-0 text-white/50 hover:text-white flex items-center gap-1.5 text-xs font-bold">
                                <X size={14} /> Cerrar
                            </button>

                            {/* Ad counter */}
                            <p className="text-center text-[11px] text-white/40 mb-3 font-bold">
                                Anuncio {previewIdx + 1} de {creatives.length}
                            </p>

                            {/* Simulated Facebook ad card */}
                            <div className="bg-white rounded-2xl overflow-hidden shadow-2xl">
                                {/* Page header */}
                                <div className="flex items-center gap-2.5 px-3 pt-3 pb-2">
                                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center text-white text-xs font-black shrink-0">
                                        {pageName.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[13px] font-bold text-gray-900 leading-tight truncate">{pageName}</p>
                                        <p className="text-[11px] text-gray-400 flex items-center gap-1">Patrocinado · <Globe size={9} /></p>
                                    </div>
                                </div>

                                {/* Primary text */}
                                {c?.primaryText && (
                                    <div className="px-3 pb-2">
                                        <p className="text-[13px] text-gray-800 leading-snug line-clamp-3">{c.primaryText}</p>
                                    </div>
                                )}

                                {/* Creative image — capped height so button stays visible */}
                                <div className="h-52 bg-gray-100 w-full overflow-hidden">
                                    {c?.mediaUrl ? (
                                        c.mediaType === 'video'
                                            ? <video src={c.mediaUrl} className="w-full h-full object-cover" controls />
                                            : <img src={c.mediaUrl} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-gray-300">
                                            <ImageIcon size={32} />
                                            <p className="text-xs">Sin imagen</p>
                                        </div>
                                    )}
                                </div>

                                {/* Headline + CTA bar */}
                                <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50 border-t border-gray-100">
                                    <div className="flex-1 min-w-0 pr-3">
                                        {form.destinationUrl && (
                                            <p className="text-[10px] text-gray-400 uppercase tracking-wide truncate">{form.destinationUrl.replace(/^https?:\/\//, '').split('/')[0]}</p>
                                        )}
                                        <p className="text-[13px] font-bold text-gray-900 truncate">{c?.headline || form.name}</p>
                                        {c?.description && <p className="text-[11px] text-gray-500 truncate">{c.description}</p>}
                                    </div>
                                    <div className="shrink-0">
                                        <span className="text-[12px] font-bold px-3 py-1.5 rounded-md bg-gray-200 text-gray-700 whitespace-nowrap">
                                            {strategy?.destination === 'whatsapp' ? 'Enviar mensaje' : 'Más información'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Nav prev/next (inline, no overflow) */}
                            {creatives.length > 1 && (
                                <div className="flex items-center justify-between mt-3 mb-1">
                                    <button onClick={() => setPreviewIdx(i => (i - 1 + creatives.length) % creatives.length)}
                                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold transition-all">
                                        <ChevronLeft size={14} /> Anterior
                                    </button>
                                    <button onClick={() => setPreviewIdx(i => (i + 1) % creatives.length)}
                                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold transition-all">
                                        Siguiente <ChevronRight size={14} />
                                    </button>
                                </div>
                            )}

                            {/* Publish from preview */}
                            <button
                                onClick={() => { setShowPreview(false); publish() }}
                                disabled={publishing}
                                className="mt-3 w-full flex items-center justify-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:opacity-90 disabled:opacity-50 transition-all shadow-[0_0_25px_rgba(16,185,129,0.4)]"
                            >
                                {publishing ? <><Loader2 size={15} className="animate-spin" /> Publicando...</> : <><Rocket size={15} /> Publicar Campaña</>}
                            </button>
                        </div>
                        </div>
                    </div>
                )
            })()}
        </div>
    )
}

export default function CampaignPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="animate-spin text-amber-400" size={32} />
            </div>
        }>
            <CampaignPageInner />
        </Suspense>
    )
}
