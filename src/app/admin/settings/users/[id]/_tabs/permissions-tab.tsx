"use client"

import { useState, useEffect } from 'react'
import type { Profile } from '@/lib/supabase/profiles'

const DASHBOARD_CODES = ['main','qc','billing','delivery','payment'] as const
type DashboardCode = typeof DASHBOARD_CODES[number]
const DASHBOARD_LABELS: Record<DashboardCode, string> = {
  main: 'Main', qc: 'QC', billing: 'Billing', delivery: 'Delivery', payment: 'Payment',
}

type PermField = 'canCreateClaims' | 'canReassignClaims' | 'canEditClaimInfo' | 'autoStatusRequestsOverride' | 'showInHandlingAppraiserList' | 'marketingAccess'

const TOGGLES: { field: PermField; label: string; description: string }[] = [
  {
    field: 'canCreateClaims',
    label: 'Create claims',
    description: 'Can create new claims from the Dashboard.',
  },
  {
    field: 'canReassignClaims',
    label: 'Reassign claims',
    description: 'Can reassign a claim they own to another appraiser.',
  },
  {
    field: 'canEditClaimInfo',
    label: 'Edit Claim Info',
    description: 'Can edit the Claim Info form after the claim is created.',
  },
  {
    field: 'autoStatusRequestsOverride',
    label: 'Auto status requests',
    description: 'Receive automatic 48-hour status-request messages on assigned claims.',
  },
  {
    field: 'showInHandlingAppraiserList',
    label: 'Show in handling-appraiser list',
    description: 'Appears in the Claim Info "Handling Appraiser" dropdown. Still fully assignable to claims when off.',
  },
  {
    field: 'marketingAccess',
    label: 'Marketing access',
    description: 'Grants access to the Marketing tab and the shared client / contact database. Flag-only — admin role alone does NOT grant access.',
  },
]

export function PermissionsTab({ profile, onSaved }: { profile: Profile; onSaved: () => void }) {
  const [values, setValues] = useState<Record<PermField, boolean>>({
    canCreateClaims: profile.canCreateClaims,
    canReassignClaims: profile.canReassignClaims,
    canEditClaimInfo: profile.canEditClaimInfo,
    autoStatusRequestsOverride: profile.autoStatusRequestsOverride === true,
    showInHandlingAppraiserList: profile.showInHandlingAppraiserList,
    marketingAccess: profile.marketingAccess,
  })
  const [busyField, setBusyField] = useState<PermField | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dashboards, setDashboards] = useState<Set<DashboardCode>>(new Set())
  const [dashboardsLoaded, setDashboardsLoaded] = useState(false)
  const [busyDashboard, setBusyDashboard] = useState<DashboardCode | null>(null)

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/admin/users/${profile.id}/dashboards`, { cache: 'no-store' })
      if (!res.ok) { setDashboardsLoaded(true); return }
      const json = await res.json() as { codes?: string[] }
      setDashboards(new Set((json.codes ?? []).filter((c): c is DashboardCode => (DASHBOARD_CODES as readonly string[]).includes(c))))
      setDashboardsLoaded(true)
    })()
  }, [profile.id])

  const toggleDashboard = async (code: DashboardCode, next: boolean) => {
    setError(null)
    setBusyDashboard(code)
    const prev = new Set(dashboards)
    const nextSet = new Set(dashboards)
    if (next) nextSet.add(code); else nextSet.delete(code)
    setDashboards(nextSet)
    const res = await fetch(`/api/admin/users/${profile.id}/dashboards`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codes: [...nextSet] }),
    })
    setBusyDashboard(null)
    if (!res.ok) {
      setDashboards(prev)
      const b = await res.json().catch(() => ({}))
      setError(b.error ?? 'Save failed')
    }
  }

  const toggle = async (field: PermField, next: boolean) => {
    setError(null)
    setBusyField(field)
    const prev = values[field]
    setValues(v => ({ ...v, [field]: next }))
    const res = await fetch(`/api/admin/users/${profile.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: next }),
    })
    setBusyField(null)
    if (!res.ok) {
      setValues(v => ({ ...v, [field]: prev }))
      const b = await res.json().catch(() => ({}))
      setError(b.error ?? 'Save failed')
      return
    }
    onSaved()
  }

  return (
    <div className="space-y-3 max-w-2xl">
      {TOGGLES.map(({ field, label, description }) => (
        <div key={field} className="flex items-start justify-between gap-4 py-3 border-b border-gray-100">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-900">{label}</div>
            <div className="text-xs text-gray-500 mt-0.5">{description}</div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={values[field]}
            disabled={busyField !== null}
            onClick={() => toggle(field, !values[field])}
            className={`shrink-0 w-11 h-6 rounded-full transition-colors relative ${
              values[field] ? 'bg-blue-600' : 'bg-gray-300'
            } disabled:opacity-50`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                values[field] ? 'translate-x-5' : ''
              }`}
            />
          </button>
        </div>
      ))}

      {/* Dashboard tab access — appraisers only see tabs they're granted here.
          Admins always see all 5 tabs regardless of these toggles, but their
          "primary" ones (visible-by-default accent color) still come from here. */}
      <div className="mt-6">
        <div className="text-sm font-semibold text-gray-900 mb-1">Dashboard access</div>
        <div className="text-xs text-gray-500 mb-3">
          Which workflow dashboards this user sees. Appraisers see only their assigned ones; admins see all tabs but assigned ones take primary focus.
        </div>
        <div className="space-y-2">
          {DASHBOARD_CODES.map(code => (
            <div key={code} className="flex items-start justify-between gap-4 py-2 border-b border-gray-100">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-900">{DASHBOARD_LABELS[code]}</div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={dashboards.has(code)}
                disabled={!dashboardsLoaded || busyDashboard !== null}
                onClick={() => toggleDashboard(code, !dashboards.has(code))}
                className={`shrink-0 w-11 h-6 rounded-full transition-colors relative ${
                  dashboards.has(code) ? 'bg-blue-600' : 'bg-gray-300'
                } disabled:opacity-50`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                    dashboards.has(code) ? 'translate-x-5' : ''
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
      </div>

      {error && <div className="p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
    </div>
  )
}
