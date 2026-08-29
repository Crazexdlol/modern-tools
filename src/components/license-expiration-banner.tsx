"use client"

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, X } from 'lucide-react'
import type { Profile } from '@/lib/supabase/profiles'
import { fetchAllLicenses, fetchUserLicenses, getLicenseAlertLevel, isBannerLevel, type AppraiserLicense } from '@/lib/supabase/appraiser-licenses'

/**
 * Dashboard banner shown when the current user has a license expiring soon
 * or expired, OR (for admins) when ANY user does. Dismissed via session key.
 * Cadence semantics: the banner is present whenever a license is in an
 * alerting window. No cron; just live evaluation.
 *
 * Takes profile + allProfiles as props so it doesn't re-run auth.getUser()
 * or refetch the full profiles list the dashboard already loaded.
 */
export function LicenseExpirationBanner({ profile, allProfiles }: { profile: Profile | null; allProfiles: Profile[] }) {
  const [licenses, setLicenses] = useState<AppraiserLicense[] | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const key = 'license-banner-dismissed'
    if (sessionStorage.getItem(key) === '1') setDismissed(true)
  }, [])

  useEffect(() => {
    if (!profile) return
    if (profile.role === 'admin') {
      fetchAllLicenses().then(setLicenses)
    } else {
      fetchUserLicenses(profile.id).then(setLicenses)
    }
  }, [profile])

  const nameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of allProfiles) m.set(p.id, p.name || p.email)
    return m
  }, [allProfiles])

  if (dismissed || !licenses) return null

  const alerting = licenses.filter(l => isBannerLevel(getLicenseAlertLevel(l.expirationDate)))
  if (alerting.length === 0) return null

  const dismiss = () => {
    sessionStorage.setItem('license-banner-dismissed', '1')
    setDismissed(true)
  }

  return (
    <div className="mb-4 p-3 rounded-lg border border-red-200 bg-red-50 flex items-start gap-3">
      <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-red-800">
          {alerting.length === 1 ? 'License alert' : `${alerting.length} license alerts`}
        </div>
        <ul className="text-xs text-red-700 mt-1 space-y-0.5">
          {alerting.slice(0, 4).map(l => {
            const name = nameById.get(l.userId)
            const level = getLicenseAlertLevel(l.expirationDate)
            const isExpired = level === 'expired'
            return (
              <li key={l.id}>
                {name ? <><Link href={`/admin/settings/users/${l.userId}`} className="underline">{name}</Link>: </> : null}
                {l.state} {l.licenseNumber} — {isExpired ? 'EXPIRED' : `expires ${l.expirationDate}`}
              </li>
            )
          })}
          {alerting.length > 4 && <li>…and {alerting.length - 4} more</li>}
        </ul>
      </div>
      <button onClick={dismiss} className="text-red-600 hover:text-red-800 shrink-0" title="Dismiss for this session"><X className="w-4 h-4" /></button>
    </div>
  )
}
