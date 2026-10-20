"use client"

import { useEffect, useState } from 'react'
import { extractLossState } from '@/lib/claim-state'
import { fetchLicensedStates, isLicensedState, isForbiddenState, type LicensedState } from '@/lib/supabase/licensed-states'
import { fetchAllLicenses, isLicenseValid, type AppraiserLicense } from '@/lib/supabase/appraiser-licenses'
import type { ClaimInfo } from '@/lib/acv/types'
import type { Profile } from '@/lib/supabase/profiles'

/**
 * Sits above the Negotiating Appraiser field on the Claim Info tab.
 * - If the state doesn't require a license: renders nothing.
 * - If the state is forbidden: renders nothing (the top-of-page badge already
 *   shouts about it).
 * - If handler is licensed: shows "<name> — <license #>".
 * - If handler is NOT licensed (or no handler picked): lists every appraiser
 *   who IS licensed in this state, name + license #, so admin can reassign
 *   or the handler knows who to hand off to.
 */
export function NegotiatingAppraiserLicenseSummary({
  claim,
  negotiatingAppraiserName,
  allProfiles,
}: {
  claim: ClaimInfo
  negotiatingAppraiserName: string
  allProfiles: Profile[]
}) {
  const [licensedStates, setLicensedStates] = useState<LicensedState[]>([])
  const [licenses, setLicenses] = useState<AppraiserLicense[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([fetchLicensedStates(), fetchAllLicenses()]).then(([s, l]) => {
      setLicensedStates(s)
      setLicenses(l)
      setLoading(false)
    })
  }, [])

  if (loading) return null

  const state = extractLossState(claim.ownerAddress)
  if (!state) return null
  if (isForbiddenState(state, licensedStates)) return null
  if (!isLicensedState(state, licensedStates)) return null

  // Every valid license in this state, keyed to the user's display name.
  const licensedForState = licenses
    .filter(l => l.state === state && isLicenseValid(l))
    .map(l => {
      const p = allProfiles.find(x => x.id === l.userId)
      return {
        name: p?.name || p?.email || 'Unknown',
        licenseNumber: l.licenseNumber,
        userId: l.userId,
      }
    })

  // Match handler by NAME (negotiatingAppraiser is a name string, not a user id).
  const handlerName = negotiatingAppraiserName.trim()
  const handlerMatch = handlerName
    ? licensedForState.find(x => x.name.toLowerCase() === handlerName.toLowerCase())
    : undefined

  if (handlerMatch) {
    return (
      <div className="mb-3 text-sm text-emerald-700">
        <strong>{handlerMatch.name}</strong> — {state} License{' '}
        <span className="font-mono">#{handlerMatch.licenseNumber}</span>
      </div>
    )
  }

  // Handler not licensed (or no handler yet). Show the roster.
  return (
    <div className="mb-3 text-sm text-red-700 space-y-1">
      <div className="font-semibold">
        {handlerName ? `${handlerName} is not licensed in ${state}.` : `A ${state} license is required for this claim.`}
      </div>
      {licensedForState.length > 0 ? (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide">
            Licensed in {state}:
          </div>
          <ul className="space-y-0.5 pl-1">
            {licensedForState.map(x => (
              <li key={x.userId}>
                <span className="font-semibold">{x.name}</span>{' '}
                <span className="font-mono text-xs">#{x.licenseNumber}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="text-xs italic">
          No appraisers currently hold an active {state} license.
        </div>
      )}
    </div>
  )
}
