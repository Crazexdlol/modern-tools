"use client"

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { AlertCircle, X } from 'lucide-react'
import { fetchCurrentProfileBrowser, fetchAllProfilesBrowser } from '@/lib/supabase/profiles'
import { fetchAllLicenses, fetchUserLicenses, getLicenseAlertLevel, isBannerLevel, type AppraiserLicense } from '@/lib/supabase/appraiser-licenses'

/**
 * Dashboard banner shown when the current user has a license expiring soon
 * or expired, OR (for admins) when ANY user does. Dismissed via session key.
 * Cadence semantics: the banner is present whenever a license is in an
 * alerting window. No cron; just live evaluation.
 */
export function LicenseExpirationBanner() {
  const [licenses, setLicenses] = useState<AppraiserLicense[] | null>(null)
  const [nameById, setNameById] = useState<Map<string, string>>(new Map())
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const key = 'license-banner-dismissed'
    if (sessionStorage.getItem(key) === '1') setDismissed(true)

    fetchCurrentProfileBrowser().then(async profile => {
      if (!profile) return
      if (profile.role === 'admin') {
        const [all, allUsers] = await Promise.all([
          fetchAllLicenses(),
          fetchAllProfilesBrowser(),
        ])
        const m = new Map<string, string>()
        for (const p of allUsers) m.set(p.id, p.name || p.email)
        setNameById(m)
        setLicenses(all)
      } else {
        setLicenses(await fetchUserLicenses(profile.id))
      }
    })
  }, [])

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
