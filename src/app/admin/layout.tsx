'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  LayoutDashboard,
  Users,
  ShoppingBag,
  Settings,
  Bell,
  ChevronRight,
  ArrowLeft,
  Shield,
  Menu,
  X,
  Coins,
} from 'lucide-react'

const NAV = [
  { href: '/admin', label: 'Resumen', icon: LayoutDashboard, exact: true },
  { href: '/admin/users', label: 'Usuarios', icon: Users },
  { href: '/admin/purchases', label: 'Compras', icon: ShoppingBag },
  { href: '/admin/credits', label: 'Créditos AI', icon: Coins },
  { href: '/admin/notifications', label: 'Notificaciones', icon: Bell },
  { href: '/admin/settings', label: 'Configuración', icon: Settings },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [checking, setChecking] = useState(true)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    fetch('/api/admin/stats')
      .then(r => {
        if (r.status === 403 || r.status === 401) {
          router.replace('/dashboard')
        } else {
          setChecking(false)
        }
      })
      .catch(() => router.replace('/dashboard'))
  }, [router, pathname])

  if (checking) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href
    return pathname.startsWith(href)
  }

  const Sidebar = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center">
            <Shield size={15} className="text-amber-400" />
          </div>
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest text-white/80">Admin</p>
            <p className="text-[9px] text-white/30 uppercase tracking-widest">Panel de control</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV.map(({ href, label, icon: Icon, exact }) => {
          const active = isActive(href, exact)
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                active
                  ? 'bg-amber-500/15 text-amber-300 border border-amber-500/25'
                  : 'text-white/40 hover:text-white/70 hover:bg-white/5'
              }`}
            >
              <Icon size={15} className={active ? 'text-amber-400' : 'text-white/30'} />
              {label}
              {active && <ChevronRight size={12} className="ml-auto text-amber-400/50" />}
            </Link>
          )
        })}
      </nav>

      {/* Back to dashboard */}
      <div className="px-3 py-4 border-t border-white/5">
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs text-white/30 hover:text-white/60 hover:bg-white/5 transition-all"
        >
          <ArrowLeft size={13} />
          Volver al Dashboard
        </Link>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-56 shrink-0 border-r border-white/5 fixed left-0 top-0 bottom-0">
        <Sidebar />
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative w-56 bg-[#0d0d15] border-r border-white/5 flex flex-col z-10">
            <Sidebar />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 lg:pl-56 flex flex-col min-h-screen">
        {/* Mobile topbar */}
        <div className="lg:hidden sticky top-0 z-30 bg-[#0a0a0f]/95 backdrop-blur border-b border-white/5 px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setMobileOpen(true)}
            className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center"
          >
            <Menu size={15} className="text-white/60" />
          </button>
          <div className="flex items-center gap-2">
            <Shield size={13} className="text-amber-400" />
            <span className="text-xs font-bold text-white/60 uppercase tracking-widest">Admin Panel</span>
          </div>
        </div>

        <main className="flex-1 p-4 md:p-6 max-w-6xl mx-auto w-full">
          {children}
        </main>
      </div>
    </div>
  )
}
