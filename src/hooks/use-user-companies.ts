'use client'
import { useEffect, useState } from 'react'
import type { ActiveCompany } from './use-active-company'

/**
 * Returns every company the current user has access to (from user_companies),
 * plus the active_company_id. Drives the CompanySwitcher pill.
 */
export function useUserCompanies(): {
  companies: ActiveCompany[]
  activeCompanyId: string | null
  loading: boolean
} {
  const [companies, setCompanies] = useState<ActiveCompany[]>([])
  const [activeCompanyId, setActiveCompanyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch('/api/companies', { cache: 'no-store' })
        if (!r.ok) { if (!cancelled) setLoading(false); return }
        const json = await r.json() as {
          activeCompanyId: string | null
          companies: Array<{ id: string; slug: string; name: string; logo_path: string; brand_color: string }>
        }
        if (cancelled) return
        setActiveCompanyId(json.activeCompanyId)
        setCompanies(json.companies.map(c => ({
          id: c.id, slug: c.slug, name: c.name, logoPath: c.logo_path, brandColor: c.brand_color,
        })))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  return { companies, activeCompanyId, loading }
}
