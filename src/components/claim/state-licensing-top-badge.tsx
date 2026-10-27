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
 *   - NOT LICENSED (bold red pill) — licensed state, current responsible user is not licensed
 *   - LICENSED (green pill) — licensed state, current responsible user is licensed
 *   - nothing — state doesn't require licensing (or state unknown)
 *
 * License status is based on whoever is RESPONSIBLE FOR THIS CLAIM RIGHT NOW:
 *   1. The current assignee (`assignedTo` → resolved against `allProfiles`)
 *      when the claim has one. The point of the top badge is "whoever is
 *      actively handling this claim this moment — are they licensed?" so the
 *      stage assignee is the right subject.
 *   2. Falls back to the Negotiating Appraiser (claim.negotiatingAppraiser,
 *      resolved by name) when there's no assignee — e.g. QC claims, closed
 *      claims, or admin-paused claims. Without a fallback the badge would
 *      silently disappear on those states; falling back preserves the
 *      "always show licensing status when a loss state requires it" contract.
 *
 * The Negotiating-Appraiser-focused view lives in a separate component on the
 * Claim Info tab (NegotiatingAppraiserLicenseSummary) which lists the roster
 * of appraisers licensed in the loss state regardless of who's currently
 * handling the file.
 */
export function StateLicensingTopBadge({
  claim,
  assignedTo,
  profile,
  allProfiles,
}: {
  claim: ClaimInfo
  /** Current assignee's user id — the stage-level handler. */
  assignedTo?: string | null
  /** Current user's own profile — used as a last-resort match when
   *  assignedTo === profile.id but allProfiles hasn't finished loading. */
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

  // Who's the "responsible user" for this badge?
  //   Primary: the stage assignee (whoever will touch the claim next).
  //   Fallback: the Negotiating Appraiser named on the file (used for QC /
  //   closed / unassigned claims so the badge doesn't vanish on them).
  let responsibleProfileId: string | undefined
  if (assignedTo) {
    responsibleProfileId = assignedTo
  } else {
    const negotiatingName = (claim.negotiatingAppraiser ?? '').trim().toLowerCase()
    if (negotiatingName) {
      const match = allProfiles.find(p => {
        const n = (p.name ?? '').trim().toLowerCase()
        const e = (p.email ?? '').trim().toLowerCase()
        return n === negotiatingName || e === negotiatingName
      })
      responsibleProfileId = match?.id
    }
  }

  // Secondary fallback: if assignedTo was passed but the profile list hasn't
  // finished loading, allow the current user's own profile as the match so
  // the badge is correct on first paint for a user viewing their own claim.
  if (!responsibleProfileId && profile && assignedTo === profile.id) {
    responsibleProfileId = profile.id
  }

  const handlerLicensed = !!responsibleProfileId && licenses.some(
    l => l.userId === responsibleProfileId && l.state === state && isLicenseValid(l)
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
