'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * Reads the current user's profiles.active_company_id. Client-side write
 * paths must include company_id explicitly to satisfy RLS WITH CHECK; this
 * hook is the source of truth on the browser.
 *
 * Returns null while loading, or if the user hasn't resolved a company
 * yet (multi-company user pre-picker), or pre-migration (column missing).
 */
export function useActiveCompany(): { activeCompanyId: string | null; loading: boolean } {
  const [activeCompanyId, setActiveCompanyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { if (!cancelled) setLoading(false); return }
      const { data, error } = await supabase
        .from('profiles')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select('active_company_id' as any)
        .eq('id', user.id)
        .maybeSingle()
      if (!cancelled) {
        if (error) {
          // 42703 = column doesn't exist yet (pre-migration). Silent — the
          // rest of the app uses fallback code paths.
          setActiveCompanyId(null)
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setActiveCompanyId(((data as any)?.active_company_id ?? null) as string | null)
        }
        setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  return { activeCompanyId, loading }
}
