"use client"

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, MessageSquare } from 'lucide-react'
import { MigrateData } from "@/components/migrate-data"
import { AppHeader } from "@/components/app-header"
import { ClaimsTable } from "@/components/claims-table"
import { fetchACVHistory, type ACVHistoryEntry } from '@/lib/supabase/history'
import { useCurrentProfile, fetchAllProfilesBrowser, type Profile } from '@/lib/supabase/profiles'
import { fetchUnreadCount } from '@/lib/supabase/messages'
import { LicenseExpirationBanner } from '@/components/license-expiration-banner'
import { fetchLicensedStates, type LicensedState } from '@/lib/supabase/licensed-states'
import { fetchAllLicenses, type AppraiserLicense } from '@/lib/supabase/appraiser-licenses'
import { fetchStatusPhaseConfigs, phaseColorClasses, type StatusPhaseConfig } from '@/lib/supabase/status-phase-configs'
import { DashboardTabs } from '@/components/dashboard-tabs'
import { useUserDashboards, type DashboardCode } from '@/hooks/use-user-dashboards'

export function DashboardClient() {
  const router = useRouter()
  const { profile } = useCurrentProfile()
  const { dashboards, assignedCodes, loading: dashboardsLoading } = useUserDashboards()
  const [entries, setEntries] = useState<ACVHistoryEntry[]>([])
  const [claimsLoading, setClaimsLoading] = useState(true)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [fetchError, setFetchError] = useState(false)
  const [unreadMessages, setUnreadMessages] = useState(0)
  const [licensedStates, setLicensedStates] = useState<LicensedState[]>([])
  const [licensesByUser, setLicensesByUser] = useState<Map<string, AppraiserLicense[]>>(new Map())
  const [statusPhaseConfigs, setStatusPhaseConfigs] = useState<StatusPhaseConfig[]>([])
  const [phaseFilter, setPhaseFilter] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<DashboardCode>('main')
  const [didInitActiveTab, setDidInitActiveTab] = useState(false)

  // Independent fetches — each logs its own timing. Nothing blocks the others.
  const load = () => {
    const time = <T,>(label: string, fn: () => Promise<T>) => {
      const start = performance.now()
      return fn().then(result => {
        console.log(`[dashboard perf] ${label}: ${Math.round(performance.now() - start)}ms`)
        return result
      })
    }
    setClaimsLoading(true)
    time('fetchACVHistory', fetchACVHistory).then(claims => {
      if (claims === null) setFetchError(true); else setEntries(claims)
      setClaimsLoading(false)
    })
    time('fetchAllProfilesBrowser', fetchAllProfilesBrowser).then(setProfiles)
    time('fetchUnreadCount', fetchUnreadCount).then(setUnreadMessages)
    time('fetchLicensedStates', fetchLicensedStates).then(setLicensedStates)
    time('fetchStatusPhaseConfigs', fetchStatusPhaseConfigs).then(setStatusPhaseConfigs)
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-load pattern; setState fires only after the async fetch resolves
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fetch all licenses once the profile is known. Keyed by user id so the
  // claims-table license dot can resolve the NEGOTIATING appraiser's
  // licenses — not just the current user's. Licenses are team-visible by
  // design (admin roster, in-claim summary) so no privacy concern.
  useEffect(() => {
    if (!profile) return
    const start = performance.now()
    fetchAllLicenses().then(licenses => {
      console.log(`[dashboard perf] fetchLicenses: ${Math.round(performance.now() - start)}ms`)
      const byUser = new Map<string, AppraiserLicense[]>()
      for (const lic of licenses) {
        const arr = byUser.get(lic.userId) ?? []
        arr.push(lic)
        byUser.set(lic.userId, arr)
      }
      setLicensesByUser(byUser)
    })
  }, [profile?.id, profile?.role])

  const isAdmin = profile?.role === 'admin'
  // Every non-closed claim shows on the dashboard now — the workflow_stage
  // field determines which top-level tab it appears under (Main / QC /
  // Billing/Delivery / Payment). The status_phase chip row inside each tab
  // is a secondary orthogonal filter (Rush / Umpire / Hold / DV Response).
  const openClaims = entries.filter(e => e.status !== 'closed')
  // Per-tab counts. 'new_assignments' = main-stage + unassigned; 'main'
  // ("Appraiser") = main-stage + assigned; 'all' = every open claim. The
  // other stages count claims matching their workflow_stage straight up.
  const countsByCode: Record<DashboardCode, number> = {
    new_assignments: 0, main: 0, qc: 0, billing_delivery: 0, payment: 0, all: 0,
  }
  for (const e of openClaims) {
    const stage = (e.workflowStage ?? 'main') as 'main' | 'qc' | 'billing_delivery' | 'payment'
    countsByCode.all += 1
    if (stage === 'main') {
      // New Assignments = newly-created, UNASSIGNED, main-stage claims only.
      // Once an appraiser is assigned, the claim leaves this tab and lands in
      // W/Appraiser (the 'main' code). Claims that have moved past main stage
      // (QC / Billing/Delivery / Payment) aren't here regardless of assignment.
      if (e.assignedTo) countsByCode.main += 1
      else countsByCode.new_assignments += 1
    } else {
      countsByCode[stage] += 1
    }
  }
  // Claims rendered in the ClaimsTable are scoped to the active tab.
  const claimsForActiveTab = openClaims.filter(e => {
    const stage = (e.workflowStage ?? 'main') as string
    if (activeTab === 'all') return true
    if (activeTab === 'new_assignments') return stage === 'main' && !e.assignedTo
    if (activeTab === 'main') return stage === 'main' && !!e.assignedTo
    return stage === activeTab
  })
  // Chip row: admins see every configured non-archived phase; non-admins only
  // see chips that actually appear in their queue (within the active tab).
  const visiblePhaseConfigs = isAdmin
    ? statusPhaseConfigs
    : statusPhaseConfigs.filter(cfg => claimsForActiveTab.some(e => e.statusPhase === cfg.code))
  // Admins always; non-admins need their per-user grant (profile.canCreateClaims).
  const canCreate = isAdmin || profile?.canCreateClaims === true

  // Initialize activeTab from ?tab= URL (if present) or first assigned
  // dashboard. One-shot on mount — the popstate listener below handles the
  // "browser back from /claims/[id]" case so we don't need reactive URL
  // tracking (which previously conflicted with Link navigation).
  const readTabFromUrl = (): DashboardCode | null => {
    if (typeof window === 'undefined') return null
    const t = new URL(window.location.href).searchParams.get('tab')
    const isValid = (c: string | null): c is DashboardCode =>
      !!c && (dashboards.some(d => d.code === c) || c === 'new_assignments' || c === 'all')
    return isValid(t) ? t : null
  }
  useEffect(() => {
    if (dashboardsLoading || didInitActiveTab) return
    const urlTab = readTabFromUrl()
    if (urlTab) {
      setActiveTab(urlTab)
    } else {
      const firstAssigned = dashboards.find(d => assignedCodes.has(d.code))
      if (firstAssigned) setActiveTab(firstAssigned.code)
    }
    setDidInitActiveTab(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboardsLoading, didInitActiveTab, dashboards, assignedCodes])

  // Browser back-nav from /claims/[id] restores the URL to /?tab=X. Next's
  // App Router keeps the dashboard mounted (route cache), so without this
  // listener the UI would still show whatever tab was last selected before
  // leaving. popstate fires on back/forward navigation; we re-read ?tab= and
  // snap the tab back.
  useEffect(() => {
    const onPop = () => {
      const t = readTabFromUrl()
      if (t) setActiveTab(t)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- readTabFromUrl captures dashboards; re-registering on dashboards change is fine but unnecessary
  }, [dashboards])

  // Mirror activeTab back to the URL via replaceState (never pushState) so
  // tab-switching doesn't flood history AND Next.js Link navigation isn't
  // confused by a URL that doesn't match what it just pushed. Guarded by a
  // pathname check so we never scribble ?tab= onto other routes after
  // navigation starts.
  useEffect(() => {
    if (!didInitActiveTab) return
    if (typeof window === 'undefined') return
    if (window.location.pathname !== '/') return
    const url = new URL(window.location.href)
    if (url.searchParams.get('tab') === activeTab) return
    url.searchParams.set('tab', activeTab)
    window.history.replaceState(null, '', url.toString())
  }, [activeTab, didInitActiveTab])

  const startNewClaim = () => {
    localStorage.removeItem('modern-tools-comp-finder-draft')
    localStorage.removeItem('modern-tools-auto-acv-draft')
    sessionStorage.removeItem('modern-tools-comp-finder-draft')
    sessionStorage.removeItem('modern-tools-auto-acv-draft')
    sessionStorage.removeItem('modern-tools-acv-edit')
    router.push('/claims/new')
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <MigrateData />
      <AppHeader />
      <main className="max-w-[1920px] mx-auto px-6 py-7 space-y-6">
        <LicenseExpirationBanner profile={profile ?? null} allProfiles={profiles} />
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="flex items-baseline gap-3">
              <h1 className="hp-display">Dashboard</h1>
              <span className="inline-flex items-baseline gap-1.5 text-slate-500 text-[13px] font-medium tabular-nums">
                <span className="text-slate-900 font-semibold">{openClaims.length}</span>
                open
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/messages" className="hp-btn hp-btn-secondary">
                <MessageSquare className="w-4 h-4 text-slate-500" />
                Messages
                {unreadMessages > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-slate-900 text-white text-[11px] font-semibold tabular-nums">
                    {unreadMessages}
                  </span>
                )}
              </Link>
              {visiblePhaseConfigs.length > 0 && (
                <>
                  <span className="h-6 w-px bg-slate-200 mx-1" aria-hidden />
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {visiblePhaseConfigs.map(cfg => {
                      const active = phaseFilter === cfg.code
                      return (
                        <button
                          key={cfg.code}
                          type="button"
                          onClick={() => setPhaseFilter(active ? null : cfg.code)}
                          className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-md border text-[13px] font-semibold transition-colors ${phaseColorClasses(cfg.color)} ${
                            active ? 'ring-2 ring-offset-1 ring-current/40' : 'hover:brightness-95'
                          }`}
                          title={active ? `Clear ${cfg.label} filter` : `Show only ${cfg.label}`}
                        >
                          {cfg.label}
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canCreate && (
              <button onClick={startNewClaim} className="hp-btn hp-btn-primary">
                <Plus className="w-4 h-4" />
                New Claim
              </button>
            )}
          </div>
        </div>

        {fetchError && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            Could not load claims from the database. Check your connection, then refresh.
          </div>
        )}

        {/* Dashboard tabs — sits above the ClaimsTable, over the MA# column.
            Each tab represents a workflow stage. Appraisers see assigned ones
            only; admins see all 5 with unassigned ones dimmed. */}
        {!dashboardsLoading && (
          <DashboardTabs
            dashboards={dashboards}
            assignedCodes={assignedCodes}
            activeTab={activeTab}
            isAdmin={isAdmin}
            countsByCode={countsByCode}
            onTabChange={(code) => { setActiveTab(code); setPhaseFilter(null) }}
          />
        )}

        {claimsLoading ? (
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-8 flex items-center justify-center gap-3 text-gray-500">
            <span className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-medium">Loading claims…</span>
          </div>
        ) : (
          <ClaimsTable
            entries={claimsForActiveTab}
            emptyText={isAdmin ? 'No claims in this stage.' : 'No claims assigned to you in this stage.'}
            adminView={isAdmin}
            profiles={profiles}
            workflowStage={
              // ClaimsTable only cares about real stages (QC-column swap +
              // bulk-action gating). Virtual tabs map accordingly:
              //   new_assignments → 'main' (same stage, dispatcher subset)
              //   all → undefined (hides Advance / Send-Back bulk actions)
              activeTab === 'new_assignments' ? 'main'
                : activeTab === 'all' ? undefined
                : activeTab
            }
            onAssignmentChanged={load}
            licensedStates={licensedStates}
            licensesByUser={licensesByUser}
            statusPhaseConfigs={statusPhaseConfigs}
            phaseFilter={phaseFilter}
            onPhaseChanged={(id, phase, setAt) => setEntries(prev =>
              prev.map(e => e.id === id ? { ...e, statusPhase: phase, statusPhaseSetAt: setAt } : e)
            )}
            onStarChanged={(id, starred) => setEntries(prev =>
              prev.map(e => e.id === id ? { ...e, starred } : e)
            )}
          />
        )}
      </main>
    </div>
  )
}
