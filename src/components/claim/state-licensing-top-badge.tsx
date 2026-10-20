"use client"

import { useEffect, useState } from 'react'
import { extractLossState } from '@/lib/claim-state'
import { fetchLicensedStates, isLicensedState, isForbiddenState, type LicensedState } from '@/lib/supabase/licensed-states'
import { fetchAllLicenses, isLicenseValid, type AppraiserLicense } from '@/lib/supabase/appraiser-licenses'
import type { ClaimInfo } from '@/lib/acv/types'
import type { Profile } from '@/lib/supabase/profiles'

/**
 * Compact but LOUD state-licensing status badge for the top toolbar of the
 * claim workspace. Sits next to the Print button. Renders one of:
 *   - FORBIDDEN (bold red bar) — highest priority, cannot be missed
 *   - NOT LICENSED (bold red pill) — licensed state, negotiating appraiser not licensed
 *   - LICENSED (green pill) — licensed state, negotiating appraiser licensed
 *   - nothing — state doesn't require licensing (or state unknown)
 *
 * License status is based on the NEGOTIATING APPRAISER
 * (claim.negotiatingAppraiser, resolved by name against allProfiles) — NOT
 * the current assignee. QC claims have no assignee but still need to show
 * the correct status for the negotiating appraiser named on the file.
 */
export function StateLicensingTopBadge({
  claim,
  allProfiles,
}: {
  claim: ClaimInfo
  // Legacy props kept for callers; no longer used.
  assignedTo?: string | null
  profile?: Profile | null
  allProfiles: Profile[]
}) {
  const [licensedStates, setLicensedStates] = useState<LicensedState[]>([])
  const [licenses, setLicenses] = useState<AppraiserLicense[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetchLicensedStates(),
      fetchAllLicenses(),
    ]).then(([states, lics]) => {
      setLicensedStates(states)
      setLicenses(lics)
      setLoading(false)
    })
  }, [])

  if (loading) return null

  const state = extractLossState(claim.ownerAddress)
  if (!state) return null

  if (isForbiddenState(state, licensedStates)) {
    return (
      <div className="inline-flex items-center px-4 py-2 rounded-lg bg-red-600 text-white shadow-md border-2 border-red-700">
        <span className="font-black uppercase tracking-wider text-base">
          FORBIDDEN
        </span>
      </div>
    )
  }

  if (!isLicensedState(state, licensedStates)) return null

  // Resolve the negotiating appraiser's name (free-text) to a profile id,
  // then check whether that user has a valid license in the loss state.
  const negotiatingName = (claim.negotiatingAppraiser ?? '').trim().toLowerCase()
  const negotiatingProfile = negotiatingName
    ? allProfiles.find(p => {
        const n = (p.name ?? '').trim().toLowerCase()
        const e = (p.email ?? '').trim().toLowerCase()
        return n === negotiatingName || e === negotiatingName
      })
    : undefined
  const handlerLicensed = !!negotiatingProfile && licenses.some(
    l => l.userId === negotiatingProfile.id && l.state === state && isLicenseValid(l)
  )

  if (handlerLicensed) {
    return (
      <div className="inline-flex items-center px-4 py-2 rounded-lg bg-emerald-600 text-white shadow-md border-2 border-emerald-700">
        <span className="font-black uppercase tracking-wider text-base">
          LICENSED
        </span>
      </div>
    )
  }

  return (
    <div className="inline-flex items-center px-4 py-2 rounded-lg bg-red-600 text-white shadow-md border-2 border-red-700">
      <span className="font-black uppercase tracking-wider text-base">
        NOT LICENSED
      </span>
    </div>
  )
}
