'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export type DashboardCode = 'main' | 'qc' | 'billing' | 'delivery' | 'payment'

export interface DashboardConfig {
  code: DashboardCode
  label: string
  color: string
  sortOrder: number
  description: string | null
}

interface State {
  dashboards: DashboardConfig[]      // all 5 configured stages (static enum)
  assignedCodes: Set<DashboardCode>  // the subset granted to the current user
  loading: boolean
}

/**
 * Loads the dashboard enumeration from dashboard_configs + the current user's
 * grants from user_dashboard_access. Both are RLS-gated — appraisers only see
 * their own user_dashboard_access rows; admins see everyone's.
 *
 * Returns loading=true until both queries settle. On a 42P01 (table missing,
 * pre-migration) returns the hard-coded stages + a full assignment so the
 * app keeps rendering while Henry runs the migration.
 */
export function useUserDashboards(): State {
  const [state, setState] = useState<State>({ dashboards: [], assignedCodes: new Set(), loading: true })

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    ;(async () => {
      // Grab the enumeration + the caller's grants in parallel.
      const [{ data: configs, error: cfgErr }, { data: grants, error: grantErr }] = await Promise.all([
        supabase.from('dashboard_configs').select('code, label, color, sort_order, description').order('sort_order'),
        supabase.from('user_dashboard_access').select('dashboard_code'),
      ])
      if (cancelled) return

      // Pre-migration fallback: tables missing → treat as all-assigned Main so
      // the app keeps rendering while Henry applies the migration.
      if ((cfgErr && cfgErr.code === '42P01') || (grantErr && grantErr.code === '42P01')) {
        setState({
          dashboards: [{ code: 'main', label: 'Main', color: 'slate', sortOrder: 1, description: 'Active appraisal work' }],
          assignedCodes: new Set(['main']),
          loading: false,
        })
        return
      }

      const dashboards: DashboardConfig[] = (configs ?? []).map(c => ({
        code: c.code as DashboardCode,
        label: c.label as string,
        color: c.color as string,
        sortOrder: c.sort_order as number,
        description: (c.description as string | null) ?? null,
      }))
      const assigned = new Set<DashboardCode>()
      for (const g of grants ?? []) assigned.add(g.dashboard_code as DashboardCode)
      setState({ dashboards, assignedCodes: assigned, loading: false })
    })()
    return () => { cancelled = true }
  }, [])

  return state
}
