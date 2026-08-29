"use client"

import { useEffect, useState } from 'react'
import { Check, AlertTriangle, ShieldCheck, Ban } from 'lucide-react'
import { extractLossState } from '@/lib/claim-state'
import { fetchLicensedStates, isLicensedState, isForbiddenState, type LicensedState } from '@/lib/supabase/licensed-states'
import { fetchUserLicenses, fetchAllLicenses, isLicenseValid, type AppraiserLicense } from '@/lib/supabase/appraiser-licenses'
import type { ClaimInfo } from '@/lib/acv/types'
import type { Profile } from '@/lib/supabase/profiles'

interface Props {
  claim: ClaimInfo
  assignedTo: string | null
  profile: Profile | null
  allProfiles: Profile[]
}

export function StateLicensingPanel({ claim, assignedTo, profile, allProfiles }: Props) {
  const [licensedStates, setLicensedStates] = useState<LicensedState[]>([])
  const [allLicenses, setAllLicenses] = useState<AppraiserLicense[]>([])
  const [loading, setLoading] = useState(true)

  const isAdmin = profile?.role === 'admin'

  useEffect(() => {
    Promise.all([
      fetchLicensedStates(),
      isAdmin ? fetchAllLicenses() : (assignedTo && profile?.id === assignedTo
        ? fetchUserLicenses(assignedTo)
        : isAdmin ? fetchAllLicenses() : Promise.resolve<AppraiserLicense[]>([])),
    ]).then(([states, licenses]) => {
      setLicensedStates(states)
      setAllLicenses(licenses)
      setLoading(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignedTo, isAdmin, profile?.id])

  const lossState = extractLossState(claim.ownerAddress)

  // Don't render if no owner address or no licensed states configured
  if (loading || licensedStates.length === 0) return null

  const stateIsForbidden = lossState ? isForbiddenState(lossState, licensedStates) : false
  const stateRequiresLicense = lossState ? isLicensedState(lossState, licensedStates) : false

  // Forbidden state — highest priority, override everything else.
  if (stateIsForbidden) {
    const notes = licensedStates.find(s => s.state === lossState)?.notes
    return (
      <div className="rounded-lg border-2 border-red-500 bg-red-50 p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Ban className="w-5 h-5 text-red-700 shrink-0" />
          <span className="text-red-900 font-bold uppercase text-sm tracking-wide">
            Forbidden state — Modern Appraisers cannot handle {lossState} claims
          </span>
        </div>
        {notes && (
          <div className="text-sm text-red-800 pl-7">
            {notes}
          </div>
        )}
        <div className="text-xs text-red-700 pl-7">
          Reassign or decline this claim.
        </div>
      </div>
    )
  }

  if (!stateRequiresLicense) {
    // Only show if there's a state and it's not required — otherwise hide entirely
    if (!lossState) return null
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
        <ShieldCheck className="w-4 h-4 text-gray-400" />
        <span>
          <span className="font-semibold">{lossState}</span> — no license required for this state.
        </span>
      </div>
    )
  }

  // State requires a license
  const assignedLicenses = assignedTo
    ? allLicenses.filter(l => l.userId === assignedTo && l.state === lossState)
    : []
  const validLicense = assignedLicenses.find(l => isLicenseValid(l))

  // Appraisers licensed in this state — for admin roster
  const licensedAppraisers = isAdmin
    ? allLicenses
        .filter(l => l.state === lossState && isLicenseValid(l))
        .map(l => ({
          license: l,
          name: allProfiles.find(p => p.id === l.userId)?.name ||
                allProfiles.find(p => p.id === l.userId)?.email ||
                'Unknown',
        }))
        .filter((item, idx, arr) => arr.findIndex(x => x.license.userId === item.license.userId) === idx)
    : []

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-gray-500" />
        <span className="text-sm font-semibold text-gray-700">
          State Licensing
        </span>
        <span className="font-mono text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded border border-gray-200">
          {lossState}
        </span>
        <span className="text-xs text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full font-semibold">
          License required
        </span>
      </div>

      {/* Status panel */}
      {!assignedTo ? (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Assign an appraiser licensed in <strong>{lossState}</strong> — this state requires a license.
          </span>
        </div>
      ) : validLicense ? (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">
          <Check className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            <strong>
              {allProfiles.find(p => p.id === assignedTo)?.name || 'Assigned appraiser'}
            </strong>{' '}
            holds license <span className="font-mono">{validLicense.licenseNumber}</span> in{' '}
            {lossState} — expires{' '}
            <span className="font-semibold">{validLicense.expirationDate}</span>.
            {daysUntil(validLicense.expirationDate) <= 30 && (
              <span className="ml-1 text-amber-700 font-semibold">
                ({daysUntil(validLicense.expirationDate)} days remaining)
              </span>
            )}
          </span>
        </div>
      ) : (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            This claim is in a licensed state (<strong>{lossState}</strong>) and the assigned appraiser
            is not licensed in <strong>{lossState}</strong>.
          </span>
        </div>
      )}

      {/* Admin roster of appraisers with valid licenses in this state */}
      {isAdmin && licensedAppraisers.length > 0 && (
        <div className="text-xs text-gray-500">
          <span className="font-semibold">Licensed in {lossState}:</span>{' '}
          {licensedAppraisers.map((item, i) => (
            <span key={item.license.userId}>
              {i > 0 && ', '}
              <span className="text-gray-700 font-medium">{item.name}</span>
              {' '}
              <span className="font-mono text-gray-400">({item.license.licenseNumber})</span>
            </span>
          ))}
        </div>
      )}
      {isAdmin && licensedAppraisers.length === 0 && (
        <div className="text-xs text-amber-600">
          No appraisers currently hold an active {lossState} license.
        </div>
      )}
    </div>
  )
}

function daysUntil(dateStr: string): number {
  const exp = new Date(dateStr + 'T00:00:00')
  const today = new Date()
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.floor((exp.getTime() - t.getTime()) / (1000 * 60 * 60 * 24))
}
