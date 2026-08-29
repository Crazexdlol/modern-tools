"use client"

import { useEffect, useState } from 'react'
import { Ban, Check, AlertTriangle } from 'lucide-react'
import { extractLossState } from '@/lib/claim-state'
import { fetchLicensedStates, isLicensedState, isForbiddenState, type LicensedState } from '@/lib/supabase/licensed-states'
import { fetchAllLicenses, fetchUserLicenses, isLicenseValid, type AppraiserLicense } from '@/lib/supabase/appraiser-licenses'
import type { ClaimInfo } from '@/lib/acv/types'
import type { Profile } from '@/lib/supabase/profiles'

/**
 * Compact but LOUD state-licensing status badge for the top toolbar of the
 * claim workspace. Sits next to the Print button. Renders one of:
 *   - FORBIDDEN (bold red bar) — highest priority, cannot be missed
 *   - NOT LICENSED (bold red pill) — licensed state, handler not licensed
 *   - LICENSED (green pill) — licensed state, handler licensed
 *   - nothing — state doesn't require licensing (or state unknown)
 */
export function StateLicensingTopBadge({
  claim,
  assignedTo,
  profile,
}: {
  claim: ClaimInfo
  assignedTo: string | null
  profile: Profile | null
}) {
  const [licensedStates, setLicensedStates] = useState<LicensedState[]>([])
  const [licenses, setLicenses] = useState<AppraiserLicense[]>([])
  const [loading, setLoading] = useState(true)

  const isAdmin = profile?.role === 'admin'

  useEffect(() => {
    Promise.all([
      fetchLicensedStates(),
      isAdmin
        ? fetchAllLicenses()
        : profile?.id === assignedTo
          ? fetchUserLicenses(profile.id)
          : Promise.resolve<AppraiserLicense[]>([]),
    ]).then(([states, lics]) => {
      setLicensedStates(states)
      setLicenses(lics)
      setLoading(false)
    })
  }, [assignedTo, isAdmin, profile?.id])

  if (loading) return null

  const state = extractLossState(claim.ownerAddress)
  if (!state) return null

  if (isForbiddenState(state, licensedStates)) {
    return (
      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white shadow-md border-2 border-red-700">
        <Ban className="w-5 h-5" />
        <span className="font-black uppercase tracking-wider text-base">
          FORBIDDEN
        </span>
      </div>
    )
  }

  if (!isLicensedState(state, licensedStates)) return null

  const handlerLicensed = !!assignedTo && licenses.some(
    l => l.userId === assignedTo && l.state === state && isLicenseValid(l)
  )

  if (handlerLicensed) {
    return (
      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white shadow-md border-2 border-emerald-700">
        <Check className="w-5 h-5" />
        <span className="font-black uppercase tracking-wider text-base">
          LICENSED
        </span>
      </div>
    )
  }

  return (
    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white shadow-md border-2 border-red-700">
      <AlertTriangle className="w-5 h-5" />
      <span className="font-black uppercase tracking-wider text-base">
        NOT LICENSED
      </span>
    </div>
  )
}
