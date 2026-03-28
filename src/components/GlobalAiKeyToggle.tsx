'use client'

import { useEffect, useState } from 'react'
import { Sparkles, Loader2, Check, AlertCircle } from 'lucide-react'

export default function GlobalAiKeyToggle() {
    const [useGlobal, setUseGlobal] = useState(false)
    const [available, setAvailable] = useState(false)
    const [credits, setCredits] = useState<number | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

    useEffect(() => {
        Promise.all([
            fetch('/api/user/ai-key-setting').then(r => r.json()),
            fetch('/api/user/credits').then(r => r.ok ? r.json() : null),
        ]).then(([setting, credData]) => {
            setUseGlobal(setting.useGlobalAiKey ?? false)
            setAvailable(setting.globalKeyAvailable ?? false)
            if (credData) setCredits(credData.credits ?? 0)
        }).catch(() => {}).finally(() => setLoading(false))
    }, [])

    async function toggle() {
        setSaving(true)
        setMsg(null)
        const res = await fetch('/api/user/ai-key-setting', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ useGlobalAiKey: !useGlobal }),
        })
        const data = await res.json()
        if (res.ok) {
            setUseGlobal(data.useGlobalAiKey)
            setMsg({ type: 'success', text: data.useGlobalAiKey ? 'Usando API key de la app' : 'Usando tu propia API key' })
        } else {
            setMsg({ type: 'error', text: data.error || 'Error al guardar' })
        }
        setSaving(false)
        setTimeout(() => setMsg(null), 3000)
    }

    if (loading) return null

    return (
        <div className={`rounded-2xl border p-4 space-y-3 ${useGlobal ? 'border-amber-400/25 bg-amber-400/5' : 'border-white/10 bg-white/5'}`}>
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${useGlobal ? 'bg-amber-400/15 border border-amber-400/25' : 'bg-white/5 border border-white/10'}`}>
                        <Sparkles className={`w-4 h-4 ${useGlobal ? 'text-amber-400' : 'text-white/30'}`} />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-white">API key de la app</p>
                        <p className="text-xs text-white/35 mt-0.5">
                            {available
                                ? credits !== null
                                    ? `Créditos disponibles: $${credits.toFixed(3)}`
                                    : 'Configurada por el administrador'
                                : 'No disponible — contacta al administrador'}
                        </p>
                    </div>
                </div>
                <button
                    onClick={toggle}
                    disabled={saving || !available}
                    className={`relative w-11 h-6 rounded-full transition-all duration-200 disabled:opacity-40 ${useGlobal ? 'bg-amber-400' : 'bg-white/15'}`}
                >
                    {saving
                        ? <Loader2 className="w-3 h-3 animate-spin absolute top-1.5 left-1/2 -translate-x-1/2 text-black" />
                        : <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-200 ${useGlobal ? 'left-5' : 'left-0.5'}`} />
                    }
                </button>
            </div>

            {useGlobal && credits !== null && credits <= 0 && (
                <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    Sin créditos — el servicio de IA no funcionará. Contacta al administrador.
                </div>
            )}

            {msg && (
                <div className={`flex items-center gap-2 text-xs rounded-xl px-3 py-2 ${msg.type === 'success' ? 'text-green-400 bg-green-500/10 border border-green-500/20' : 'text-red-400 bg-red-500/10 border border-red-500/20'}`}>
                    {msg.type === 'success' ? <Check className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
                    {msg.text}
                </div>
            )}
        </div>
    )
}
