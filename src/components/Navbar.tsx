'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import NotificationBell from './NotificationBell'

const navItems = [
  { href: '/dashboard', iconClass: 'fa-solid fa-house', label: 'Inicio' },
  { href: '/dashboard/services/whatsapp', iconClass: 'fa-solid fa-robot', label: 'Agentes AI' },
  { href: '/dashboard/crm', iconClass: 'fa-solid fa-bullhorn', label: 'CRM' },
  { href: '/dashboard/credits', iconClass: 'fa-solid fa-bolt', label: 'Créditos' },
  { href: '/dashboard/services/social', iconClass: 'fa-solid fa-satellite-dish', label: 'Publisher' },
  { href: '/dashboard/services/ads', iconClass: 'fa-solid fa-chart-line', label: 'Ads' },
]

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' })
  window.location.href = '/login'
}

export default function Navbar() {
  const pathname = usePathname()

  return (
    <>
      {/* ── SIDEBAR DESKTOP ── */}
      <aside className="sidebar hidden lg:flex" aria-label="Barra lateral">
        <Link href="/dashboard" className="sidebar__logo">
          <div className="sidebar__logo-ring">
            <img src="/logo.png" alt="Nexor" />
          </div>
          <div className="sidebar__logo-info">
            <span className="sidebar__logo-jd">NEXOR</span>
            <span className="sidebar__logo-intl">PLATFORM</span>
            <span className="sidebar__logo-badge"><span className="u-live-dot"></span>&nbsp;Premium</span>
          </div>
        </Link>

        <nav className="sidebar__nav" aria-label="Menú">
          {navItems.map(item => {
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-item ${isActive ? 'nav-item--active' : ''}`}
              >
                <span className="nav-item__icon"><i className={item.iconClass}></i></span>
                <span className="nav-item__label">{item.label}</span>
                <span className="nav-item__dot"></span>
              </Link>
            )
          })}
          <div className="sidebar__nav-sep"></div>
          <Link href="/dashboard/settings" className={`nav-item ${pathname === '/dashboard/settings' ? 'nav-item--active' : ''}`}>
            <span className="nav-item__icon"><i className="fa-solid fa-gear"></i></span>
            <span className="nav-item__label">Configuración</span>
            <span className="nav-item__dot"></span>
          </Link>
          <button onClick={logout} className="nav-item" style={{ width:'100%', background:'none', border:'none', cursor:'pointer', color:'rgba(255,100,100,0.8)' }}>
            <span className="nav-item__icon"><i className="fa-solid fa-right-from-bracket"></i></span>
            <span className="nav-item__label">Salir</span>
          </button>
        </nav>

        <div className="sidebar__user">
          <NotificationBell />
          <div className="sidebar__user-av" id="dAvatar"><i className="fa-solid fa-user"></i></div>
          <div>
            <p className="sidebar__user-name">Usuario</p>
            <p className="sidebar__user-role">@user · <span style={{ color: 'var(--clr-accent-lt)' }}>Activo</span></p>
          </div>
        </div>
      </aside>

      {/* ── BARRA MÓVIL ── */}
      <nav className="bottom-nav lg:hidden" aria-label="Navegación principal">
        {navItems.map(item => {
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`bnav__item ${isActive ? 'bnav__item--active' : ''}`}
            >
              <i className={item.iconClass}></i>
              {item.label}
            </Link>
          )
        })}
      </nav>
    </>
  )
}

