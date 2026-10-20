"use client"

import { useEffect, useState } from 'react'
import { Lock } from 'lucide-react'
import { AppHeader } from '@/components/app-header'
import { ClaimsTable } from '@/components/claims-table'
import { fetchACVHistory, type ACVHistoryEntry } from '@/lib/supabase/history'
import { fetchAllProfilesBrowser, type Profile } from '@/lib/supabase/profiles'
import { fetchStatusPhaseConfigs, type StatusPhaseConfig } from '@/lib/supabase/status-phase-configs'
import { fetchLicensedStates, type LicensedState } from '@/lib/supabase/licensed-states'
import { fetchUserLicenses, type AppraiserLicense } from '@/lib/supabase/appraiser-licenses'

// Full-page gate shown to appraisers who've been locked out of the dashboard
// and their non-overdue claims because they've gone 5+ business days silent
// on one or more of their assignments. The overdue claims themselves remain
// accessible (via a click into the ClaimsTable row); every other nav target
// is inert.
export function LockoutGate({
  overdueClaimIds,
  userName,
  userId,
}: {
  overdueClaimIds: string[]
  userName: string | null
  userId: string
}) {
  const [entries, setEntries] = useState<ACVHistoryEntry[] | null>(null)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [statusPhaseConfigs, setStatusPhaseConfigs] = useState<StatusPhaseConfig[]>([])
  const [licensedStates, setLicensedStates] = useState<LicensedState[]>([])
  const [licensesByUser, setLicensesByUser] = useState<Map<string, AppraiserLicense[]>>(new Map())

  useEffect(() => {
    const overdueSet = new Set(overdueClaimIds)
    fetchACVHistory().then(all => {
      if (!all) { setEntries([]); return }
      setEntries(all.filter(e => overdueSet.has(e.id)))
    })
    fetchAllProfilesBrowser().then(setProfiles)
    fetchStatusPhaseConfigs().then(setStatusPhaseConfigs)
    fetchLicensedStates().then(setLicensedStates)
    fetchUserLicenses(userId).then(licenses => {
      const byUser = new Map<string, AppraiserLicense[]>()
      for (const lic of licenses) {
        const arr = byUser.get(lic.userId) ?? []
        arr.push(lic)
        byUser.set(lic.userId, arr)
      }
      setLicensesByUser(byUser)
    })
  }, [overdueClaimIds, userId])

  // Poll the server for lockout state every 15s. The gate is rendered from
  // a server-rendered snapshot of `overdueClaimIds`; the DB trigger clears
  // status_lockout_at when the appraiser posts a non-auto message on the
  // overdue claim (or on reassign). Without polling, the user has to hard-
  // refresh to leave the gate even after they've done the unlock action in
  // another tab.
  useEffect(() => {
    const tick = async () => {
      try {
        const r = await fetch('/api/profile/lockout-state', { cache: 'no-store' })
        if (!r.ok) return
        const j = await r.json() as { isLocked: boolean; overdueClaimIds: string[] }
        if (!j.isLocked) window.location.reload()
      } catch { /* silent — next tick retries */ }
    }
    const id = setInterval(tick, 15_000)
    return () => clearInterval(id)
  }, [])

  const count = overdueClaimIds.length

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <AppHeader locked />
      <main className="max-w-[1920px] mx-auto px-6 py-7 space-y-5">
        <div className="bg-white border border-gray-200 shadow-sm rounded-lg px-6 py-5">
          <div className="flex items-center gap-4">
            <div className="shrink-0 w-11 h-11 rounded-full bg-red-50 border border-red-200 flex items-center justify-center">
              <Lock className="w-5 h-5 text-red-600" />
            </div>
            <div className="min-w-0">
              <h1 className="text-black text-lg font-bold tracking-tight leading-tight">
                Status update required
              </h1>
              <p className="text-sm text-gray-600 leading-snug mt-1">
                {userName ? `${userName}, you` : 'You'} have{' '}
                <span className="font-semibold text-gray-900">
                  {count} claim{count === 1 ? '' : 's'}
                </span>{' '}
                silent for 5+ days. Your other claims and the dashboard are
                temporarily locked.
              </p>
            </div>
          </div>
        </div>

        {entries === null ? (
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-8 flex items-center justify-center gap-3 text-gray-500">
            <span className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-medium">Loading claims…</span>
          </div>
        ) : (
          <ClaimsTable
            entries={entries}
            emptyText="No overdue claims found."
            profiles={profiles}
            statusPhaseConfigs={statusPhaseConfigs}
            licensedStates={licensedStates}
            licensesByUser={licensesByUser}
          />
        )}
      </main>
    </div>
  )
}
