'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'

export default function PlanGuard() {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    // Free navigation inside dashboard — each service page handles its own plan gating
    // Redirect only applies outside the dashboard (edge case)
    if (pathname.startsWith('/dashboard')) return

    fetch('/api/plan-status')
      .then(r => r.json())
      .then(data => {
        if (data.expired) router.replace('/dashboard/planes')
      })
      .catch(() => {})
  }, [pathname, router])

  return null
}
