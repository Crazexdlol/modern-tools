"use client"

import { useState, useEffect } from 'react'
import type { Profile } from '@/lib/supabase/profiles'

const DASHBOARD_CODES = ['main','qc','billing_delivery','payment'] as const
type DashboardCode = typeof DASHBOARD_CODES[number]
const DASHBOARD_LABELS: Record<DashboardCode, string> = {
  main: 'Appraiser', qc: 'QC', billing_delivery: 'Billing/Delivery', payment: 'Payment',
}

// Claim-type chips exposed to admins when configuring who handles what.
// Codes mirror src/lib/acv/types.ts ClaimType.
const CLAIM_TYPE_OPTIONS: { code: string; label: string }[] = [
  { code: 'acv', label: 'ACV' },
  { code: 'dv', label: 'DV' },
  { code: 'estimate', label: 'Estimate Dispute' },
  { code: 'lou', label: 'LOU' },
  { code: 'storage', label: 'Storage' },
  { code: 'salvage', label: 'Salvage' },
  { code: 'full', label: 'Full' },
  { code: 'desk', label: 'Desk' },
  { code: 'other', label: 'Other' },
]

// Tool-tab codes that can be hidden per-user. Matches TOOL_TABS in
// ClaimWorkspace.tsx. Admin-essential tabs (info, documents, messages,
// activity) are deliberately not togglable.
const TOOL_OPTIONS: { code: string; label: string }[] = [
  { code: 'acv', label: 'ACV Report' },
  { code: 'dv', label: 'Diminished Value' },
  { code: 'estimate', label: 'Estimate Dispute' },
  { code: 'lou', label: 'LOU' },
  { code: 'storage', label: 'Storage Charges' },
  { code: 'award', label: 'Award' },
  { code: 'notes', label: 'Closing Notes' },
  { code: 'summary', label: 'Summary' },
]

type PermField = 'canCreateClaims' | 'canReassignClaims' | 'canEditClaimInfo' | 'autoStatusRequestsOverride' | 'showInNegotiatingAppraiserList' | 'marketingAccess' | 'canSubmitWithoutHandoff' | 'emailNotificationsEnabled'

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
    field: 'canSubmitWithoutHandoff',
    label: 'Submit without handoff',
    description: 'Can submit a claim directly to QC even when they are not the Negotiating Appraiser on the file (skips the Complete Report handoff step).',
  },
  {
    field: 'autoStatusRequestsOverride',
    label: 'Auto status requests',
    description: 'Receive automatic status-request reminders on silent claims (first at 3 days, repeat at 4). After 5 days with no reply the user is locked out of all other claims until they post an update on the overdue one(s). Weekends count the same as weekdays. All users default to ON.',
  },
  {
    field: 'showInNegotiatingAppraiserList',
    label: 'Show in negotiating-appraiser list',
    description: 'Appears in the Claim Info "Negotiating Appraiser" dropdown. Still fully assignable to claims when off.',
  },
  {
    field: 'marketingAccess',
    label: 'Marketing access',
    description: 'Grants access to the Marketing tab and the shared client / contact database. Flag-only — admin role alone does NOT grant access.',
  },
  {
    field: 'emailNotificationsEnabled',
    label: 'System email notifications',
    description: 'Receive system emails for claim assigned, claim removed from queue, and new messages. Admin broadcasts are a separate pathway and are always delivered.',
  },
]

export function PermissionsTab({ profile, onSaved }: { profile: Profile; onSaved: () => void }) {
  const [values, setValues] = useState<Record<PermField, boolean>>({
    canCreateClaims: profile.canCreateClaims,
    canReassignClaims: profile.canReassignClaims,
    canEditClaimInfo: profile.canEditClaimInfo,
    canSubmitWithoutHandoff: profile.canSubmitWithoutHandoff,
    autoStatusRequestsOverride: profile.autoStatusRequestsOverride === true,
    showInNegotiatingAppraiserList: profile.showInNegotiatingAppraiserList,
    marketingAccess: profile.marketingAccess,
    emailNotificationsEnabled: profile.emailNotificationsEnabled,
  })
  const [busyField, setBusyField] = useState<PermField | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dashboards, setDashboards] = useState<Set<DashboardCode>>(new Set())
  const [dashboardsLoaded, setDashboardsLoaded] = useState(false)
  const [busyDashboard, setBusyDashboard] = useState<DashboardCode | null>(null)

  // Claim types this user handles + tools hidden from this user. Both are
  // persisted on profiles via the main PATCH endpoint. Local sets so the
  // chip grid can toggle optimistically without a round-trip per click.
  const [claimTypes, setClaimTypes] = useState<Set<string>>(() => new Set(profile.claimTypes))
  const [disabledTools, setDisabledTools] = useState<Set<string>>(() => new Set(profile.disabledTools))
  const [busyClaimType, setBusyClaimType] = useState<string | null>(null)
  const [busyTool, setBusyTool] = useState<string | null>(null)

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

  const toggleClaimType = async (code: string, next: boolean) => {
    setError(null)
    setBusyClaimType(code)
    const prev = new Set(claimTypes)
    const nextSet = new Set(claimTypes)
    if (next) nextSet.add(code); else nextSet.delete(code)
    setClaimTypes(nextSet)
    const res = await fetch(`/api/admin/users/${profile.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ claimTypes: [...nextSet] }),
    })
    setBusyClaimType(null)
    if (!res.ok) {
      setClaimTypes(prev)
      const b = await res.json().catch(() => ({}))
      setError(b.error ?? 'Save failed')
      return
    }
    onSaved()
  }

  const toggleTool = async (code: string, nextDisabled: boolean) => {
    setError(null)
    setBusyTool(code)
    const prev = new Set(disabledTools)
    const nextSet = new Set(disabledTools)
    if (nextDisabled) nextSet.add(code); else nextSet.delete(code)
    setDisabledTools(nextSet)
    const res = await fetch(`/api/admin/users/${profile.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ disabledTools: [...nextSet] }),
    })
    setBusyTool(null)
    if (!res.ok) {
      setDisabledTools(prev)
      const b = await res.json().catch(() => ({}))
      setError(b.error ?? 'Save failed')
      return
    }
    onSaved()
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

      {/* Claim types this user handles — drives reassign-dropdown filtering.
          Empty selection = "handles everything" (back-compat default for
          existing users). Each chip toggles persistence immediately. */}
      <div className="mt-6">
        <div className="text-sm font-semibold text-gray-900 mb-1">Claim types handled</div>
        <div className="text-xs text-gray-500 mb-3">
          Which claim types this user is qualified to handle. Admins reassigning a claim will only see users whose list overlaps with the claim&apos;s types. Leaving every chip off means &ldquo;handles everything&rdquo; (default for existing users).
        </div>
        <div className="flex flex-wrap gap-2">
          {CLAIM_TYPE_OPTIONS.map(({ code, label }) => {
            const on = claimTypes.has(code)
            return (
              <button
                key={code}
                type="button"
                disabled={busyClaimType !== null}
                onClick={() => toggleClaimType(code, !on)}
                className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-xs font-semibold transition ${
                  on
                    ? 'bg-blue-600 border-blue-600 text-white hover:bg-blue-500'
                    : 'bg-white border-gray-300 text-gray-700 hover:border-gray-400'
                } disabled:opacity-50`}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tool access — admin can hide specific tool tabs from this user.
          Checkbox ON means "user has access"; toggling off adds the code
          to disabled_tools. */}
      <div className="mt-6">
        <div className="text-sm font-semibold text-gray-900 mb-1">Tool access</div>
        <div className="text-xs text-gray-500 mb-3">
          Tool tabs this user can open inside a claim workspace. Turning one off hides the tab for this user only. Admin-essential tabs (Claim Info, Documents, Messages, Activity) are always visible and can&apos;t be toggled.
        </div>
        <div className="space-y-2">
          {TOOL_OPTIONS.map(({ code, label }) => {
            const disabled = disabledTools.has(code)
            const enabled = !disabled
            return (
              <div key={code} className="flex items-start justify-between gap-4 py-2 border-b border-gray-100">
                <div className="text-sm font-semibold text-gray-900">{label}</div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  disabled={busyTool !== null}
                  onClick={() => toggleTool(code, enabled /* flipping enabled→disabled */)}
                  className={`shrink-0 w-11 h-6 rounded-full transition-colors relative ${
                    enabled ? 'bg-blue-600' : 'bg-gray-300'
                  } disabled:opacity-50`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                      enabled ? 'translate-x-5' : ''
                    }`}
                  />
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {error && <div className="p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
    </div>
  )
}
