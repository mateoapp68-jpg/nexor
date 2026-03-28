'use client'

import { useEffect, useState } from 'react'
import { Coins, Key, Plus, Minus, Check, Loader2, ChevronDown, ChevronUp, Search } from 'lucide-react'

interface UserRow {
  id: string
  username: string
  fullName: string
  email: string
  aiCreditsUsd: number
  plan: string
}

interface UsageLog {
  id: string
  service: string
  model: string
  promptTokens: number
  completionTokens: number
  costUsd: number
  createdAt: string
}

interface UserDetail {
  user: UserRow
  summary: { totalSpent: number; byService: Record<string, number>; callCount: number }
  logs: UsageLog[]
}

export default function AdminCreditsPage() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [globalKeySet, setGlobalKeySet] = useState(false)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [globalKey, setGlobalKey] = useState('')
  const [savingKey, setSavingKey] = useState(false)
  const [keySaved, setKeySaved] = useState(false)

  const [selectedUser, setSelectedUser] = useState<UserDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  const [creditAmount, setCreditAmount] = useState('')
  const [savingCredits, setSavingCredits] = useState(false)
  const [creditMsg, setCreditMsg] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/credits')
      .then(r => r.json())
      .then(d => {
        setUsers(d.users ?? [])
        setGlobalKeySet(d.globalKeySet ?? false)
      })
      .finally(() => setLoading(false))
  }, [])

  async function saveGlobalKey() {
    if (!globalKey.startsWith('sk-')) return
    setSavingKey(true)
    const res = await fetch('/api/admin/credits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set_global_key', apiKey: globalKey }),
    })
    if (res.ok) {
      setKeySaved(true)
      setGlobalKeySet(true)
      setGlobalKey('')
      setTimeout(() => setKeySaved(false), 3000)
    }
    setSavingKey(false)
  }

  async function loadUserDetail(userId: string) {
    if (selectedUser?.user.id === userId) { setSelectedUser(null); return }
    setLoadingDetail(true)
    const res = await fetch(`/api/admin/credits?userId=${userId}`)
    if (res.ok) setSelectedUser(await res.json())
    setLoadingDetail(false)
  }

  async function handleCredits(action: 'add_credits' | 'set_credits') {
    if (!selectedUser || !creditAmount) return
    const amount = parseFloat(creditAmount)
    if (isNaN(amount)) return
    setSavingCredits(true)
    setCreditMsg(null)
    const res = await fetch('/api/admin/credits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, userId: selectedUser.user.id, amount }),
    })
    const data = await res.json()
    if (res.ok) {
      setCreditMsg(`Saldo actualizado: $${data.newBalance.toFixed(4)}`)
      setUsers(prev => prev.map(u => u.id === selectedUser.user.id ? { ...u, aiCreditsUsd: data.newBalance } : u))
      setSelectedUser(prev => prev ? { ...prev, user: { ...prev.user, aiCreditsUsd: data.newBalance } } : null)
      setCreditAmount('')
    } else {
      setCreditMsg(data.error || 'Error')
    }
    setSavingCredits(false)
  }

  const filtered = users.filter(u =>
    !search || u.username.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.fullName.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return (
    <div className="flex items-center justify-center min-h-[300px]">
      <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
    </div>
  )

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center">
          <Coins className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Créditos AI</h1>
          <p className="text-xs text-white/40">Gestiona la API key global y los créditos por usuario</p>
        </div>
      </div>

      {/* API Key Global */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Key className="w-4 h-4 text-amber-400" />
          <h2 className="text-sm font-bold text-white">API Key Global de OpenAI</h2>
          {globalKeySet && (
            <span className="ml-auto text-[11px] bg-green-500/10 text-green-400 border border-green-500/20 px-2 py-0.5 rounded-full">
              ✓ Configurada
            </span>
          )}
        </div>
        <p className="text-xs text-white/40">
          Esta key se usará para todos los usuarios que tengan créditos asignados. Los usuarios con su propia key la seguirán usando.
        </p>
        <div className="flex gap-2">
          <input
            type="password"
            value={globalKey}
            onChange={e => setGlobalKey(e.target.value)}
            placeholder="sk-..."
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/25 outline-none focus:border-amber-400/40"
          />
          <button
            onClick={saveGlobalKey}
            disabled={savingKey || !globalKey.startsWith('sk-')}
            className="flex items-center gap-2 px-4 py-2 bg-amber-400/10 border border-amber-400/30 text-amber-400 hover:bg-amber-400/20 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
          >
            {savingKey ? <Loader2 className="w-4 h-4 animate-spin" /> : keySaved ? <Check className="w-4 h-4" /> : <Key className="w-4 h-4" />}
            {keySaved ? 'Guardada' : 'Guardar'}
          </button>
        </div>
      </div>

      {/* Lista de usuarios */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-white/10 flex items-center gap-3">
          <Search className="w-4 h-4 text-white/30" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar usuario..."
            className="flex-1 bg-transparent text-sm text-white placeholder-white/25 outline-none"
          />
          <span className="text-xs text-white/30">{filtered.length} usuarios</span>
        </div>
        <div className="divide-y divide-white/5">
          {filtered.map(user => (
            <div key={user.id}>
              <button
                onClick={() => loadUserDetail(user.id)}
                className="w-full flex items-center gap-3 p-4 hover:bg-white/3 transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-full bg-amber-400/10 border border-amber-400/20 flex items-center justify-center text-xs font-bold text-amber-400 shrink-0">
                  {user.username.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate">{user.fullName || user.username}</div>
                  <div className="text-xs text-white/35 truncate">{user.email}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`text-sm font-bold ${user.aiCreditsUsd <= 0 ? 'text-red-400' : user.aiCreditsUsd < 1 ? 'text-yellow-400' : 'text-green-400'}`}>
                    ${user.aiCreditsUsd.toFixed(2)}
                  </div>
                  <div className="text-[10px] text-white/25">{user.plan}</div>
                </div>
                {selectedUser?.user.id === user.id
                  ? <ChevronUp className="w-4 h-4 text-white/30 shrink-0" />
                  : <ChevronDown className="w-4 h-4 text-white/30 shrink-0" />}
              </button>

              {/* Panel expandido */}
              {selectedUser?.user.id === user.id && (
                <div className="bg-white/3 border-t border-white/5 p-4 space-y-4">
                  {loadingDetail ? (
                    <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-amber-400" /></div>
                  ) : (
                    <>
                      {/* Estadísticas */}
                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-white/5 rounded-xl p-3 text-center">
                          <div className="text-xs text-white/40">Saldo</div>
                          <div className="text-base font-bold text-amber-400">${selectedUser.user.aiCreditsUsd.toFixed(4)}</div>
                        </div>
                        <div className="bg-white/5 rounded-xl p-3 text-center">
                          <div className="text-xs text-white/40">Gastado</div>
                          <div className="text-base font-bold text-white">${selectedUser.summary.totalSpent.toFixed(4)}</div>
                        </div>
                        <div className="bg-white/5 rounded-xl p-3 text-center">
                          <div className="text-xs text-white/40">Llamadas</div>
                          <div className="text-base font-bold text-white">{selectedUser.summary.callCount}</div>
                        </div>
                      </div>

                      {/* Por servicio */}
                      {Object.keys(selectedUser.summary.byService).length > 0 && (
                        <div className="space-y-1">
                          <div className="text-xs text-white/40 font-medium">Gasto por servicio</div>
                          {Object.entries(selectedUser.summary.byService).map(([svc, cost]) => (
                            <div key={svc} className="flex justify-between text-xs">
                              <span className="text-white/60 capitalize">{svc}</span>
                              <span className="text-white/80">${(cost as number).toFixed(4)}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Asignar créditos */}
                      <div className="space-y-2">
                        <div className="text-xs text-white/40 font-medium">Gestionar créditos</div>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={creditAmount}
                            onChange={e => setCreditAmount(e.target.value)}
                            placeholder="Cantidad USD (ej: 5.00)"
                            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/25 outline-none focus:border-amber-400/40"
                          />
                          <button
                            onClick={() => handleCredits('add_credits')}
                            disabled={savingCredits || !creditAmount}
                            className="flex items-center gap-1 px-3 py-2 bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20 rounded-xl text-xs font-medium transition-colors disabled:opacity-50"
                          >
                            <Plus className="w-3.5 h-3.5" /> Añadir
                          </button>
                          <button
                            onClick={() => handleCredits('set_credits')}
                            disabled={savingCredits || !creditAmount}
                            className="flex items-center gap-1 px-3 py-2 bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 rounded-xl text-xs font-medium transition-colors disabled:opacity-50"
                          >
                            <Minus className="w-3.5 h-3.5" /> Fijar
                          </button>
                        </div>
                        {creditMsg && <p className="text-xs text-amber-400">{creditMsg}</p>}
                      </div>

                      {/* Últimas llamadas */}
                      {selectedUser.logs.length > 0 && (
                        <div className="space-y-1">
                          <div className="text-xs text-white/40 font-medium">Últimas llamadas</div>
                          <div className="space-y-1 max-h-40 overflow-y-auto">
                            {selectedUser.logs.map((log: UsageLog) => (
                              <div key={log.id} className="flex items-center justify-between text-xs bg-white/3 rounded-lg px-3 py-1.5">
                                <span className="text-white/60 capitalize">{log.service}</span>
                                <span className="text-white/40">{log.model}</span>
                                <span className="text-white/40">{log.promptTokens + log.completionTokens} tok</span>
                                <span className="text-amber-400">${log.costUsd.toFixed(5)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
