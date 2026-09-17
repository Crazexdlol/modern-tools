'use client'
import { useEffect, useState } from 'react'

export interface ActiveCompany {
  id: string
  slug: string
  name: string
  logoPath: string
  brandColor: string
}

/**
 * Fetches /api/companies once on mount and exposes the caller's active
 * company row. Returns { activeCompanyId, activeCompany, loading }.
 *
 * Pre-migration this returns nulls — the endpoint returns activeCompanyId=null
 * and an empty companies list.
 */
export function useActiveCompany(): {
  activeCompanyId: string | null
  activeCompany: ActiveCompany | null
  loading: boolean
} {
  const [activeCompanyId, setActiveCompanyId] = useState<string | null>(null)
  const [activeCompany, setActiveCompany] = useState<ActiveCompany | null>(null)
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
        const active = json.companies.find(c => c.id === json.activeCompanyId) ?? null
        setActiveCompany(active ? {
          id: active.id, slug: active.slug, name: active.name,
          logoPath: active.logo_path, brandColor: active.brand_color,
        } : null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  return { activeCompanyId, activeCompany, loading }
}
