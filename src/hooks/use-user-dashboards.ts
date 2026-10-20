'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// 'new_assignments' and 'all' are virtual tabs — not persisted in the DB.
//   - new_assignments: workflow_stage='main' AND assigned_to IS NULL (claims
//     a dispatcher still needs to route to an appraiser).
//   - all: cross-stage view of every open claim.
// Both are admin-only in the UI (gated below). The real workflow stages
// (main / qc / billing_delivery / payment) still come from dashboard_configs.
export type DashboardCode = 'new_assignments' | 'main' | 'qc' | 'billing_delivery' | 'payment' | 'all'

export const VIRTUAL_DASHBOARD_CODES = new Set<DashboardCode>(['new_assignments', 'all'])

export interface DashboardConfig {
  code: DashboardCode
  label: string
  color: string
  sortOrder: number
  description: string | null
}

interface State {
  dashboards: DashboardConfig[]      // 4 real stages + 2 virtual tabs
  assignedCodes: Set<DashboardCode>  // the subset the current user can see
  loading: boolean
}

const ALL_CONFIG: DashboardConfig = {
  code: 'all',
  label: 'All',
  color: 'slate',
  sortOrder: -1,
  description: 'Every open claim across all stages',
}

const NEW_ASSIGNMENTS_CONFIG: DashboardConfig = {
  code: 'new_assignments',
  label: 'New Assignments',
  color: 'blue',
  sortOrder: 0,
  description: 'Unassigned claims — dispatcher routes them to an appraiser',
}

/**
 * Loads the dashboard enumeration from dashboard_configs + the current user's
 * grants from user_dashboard_access. Both are RLS-gated — appraisers only see
 * their own user_dashboard_access rows; admins see everyone's.
 *
 * The 'new_assignments' and 'all' virtual tabs are prepended / appended in the
 * UI and are not stored in the DB. Admins see them by default; appraisers do
 * not.
 *
 * Returns loading=true until both queries settle. On a 42P01 (table missing,
 * pre-migration) returns the hard-coded stages + a full assignment so the
 * app keeps rendering while the migration lands.
 */
export function useUserDashboards(): State {
  const [state, setState] = useState<State>({ dashboards: [], assignedCodes: new Set(), loading: true })

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    ;(async () => {
      // Fetch dashboards, grants, AND whether the current user is an admin.
      const [{ data: configs, error: cfgErr }, { data: grants, error: grantErr }, { data: userData }] = await Promise.all([
        supabase.from('dashboard_configs').select('code, label, color, sort_order, description').order('sort_order'),
        supabase.from('user_dashboard_access').select('dashboard_code'),
        supabase.auth.getUser(),
      ])
      if (cancelled) return

      // Pre-migration fallback: tables missing → treat as all-assigned Appraiser
      // so the app keeps rendering while the migration lands.
      if ((cfgErr && cfgErr.code === '42P01') || (grantErr && grantErr.code === '42P01')) {
        setState({
          dashboards: [{ code: 'main', label: 'W/Appraiser', color: 'slate', sortOrder: 1, description: 'Active appraisal work' }],
          assignedCodes: new Set(['main']),
          loading: false,
        })
        return
      }

      // Role check — only admins see the virtual New Assignments + All tabs.
      let isAdmin = false
      if (userData?.user) {
        const { data: prof } = await supabase.from('profiles').select('role').eq('id', userData.user.id).maybeSingle()
        isAdmin = prof?.role === 'admin'
      }

      const realDashboards: DashboardConfig[] = (configs ?? []).map(c => ({
        code: c.code as DashboardCode,
        label: c.label as string,
        color: c.color as string,
        sortOrder: c.sort_order as number,
        description: (c.description as string | null) ?? null,
      }))
      // Admins only: All comes first (default landing tab), then New
      // Assignments, then the real workflow stages.
      const dashboards = isAdmin
        ? [ALL_CONFIG, NEW_ASSIGNMENTS_CONFIG, ...realDashboards]
        : realDashboards

      const assigned = new Set<DashboardCode>()
      for (const g of grants ?? []) assigned.add(g.dashboard_code as DashboardCode)
      // Admins always have access to the virtual tabs.
      if (isAdmin) {
        assigned.add('new_assignments')
        assigned.add('all')
      }
      setState({ dashboards, assignedCodes: assigned, loading: false })
    })()
    return () => { cancelled = true }
  }, [])

  return state
}
