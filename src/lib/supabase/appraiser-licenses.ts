import { createClient as createBrowserClient } from './client'

export type LicenseAlertLevel = 'none' | 'notice' | 'warning' | 'urgent' | 'expired'

export interface AppraiserLicense {
  id: string
  userId: string
  state: string
  licenseNumber: string
  expirationDate: string   // 'YYYY-MM-DD'
  issuedDate: string | null  // 'YYYY-MM-DD'
  status: 'active' | 'expired' | 'pending'
  notes: string | null
}

interface AppraiserLicenseRow {
  id: string
  user_id: string
  state: string
  license_number: string
  expiration_date: string
  issued_date: string | null
  status: 'active' | 'expired' | 'pending'
  notes: string | null
}

function rowToLicense(row: AppraiserLicenseRow): AppraiserLicense {
  return {
    id: row.id,
    userId: row.user_id,
    state: row.state,
    licenseNumber: row.license_number,
    expirationDate: row.expiration_date,
    issuedDate: row.issued_date ?? null,
    status: row.status ?? 'active',
    notes: row.notes,
  }
}

/**
 * A license is valid iff status === 'active' AND expiration_date is in the future.
 */
export function isLicenseValid(license: AppraiserLicense, today: Date = new Date()): boolean {
  if (license.status !== 'active') return false
  const exp = new Date(license.expirationDate + 'T00:00:00')
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return exp > t
}

/**
 * Live-computed alert level based on days-until-expiration.
 * Cadence:
 *   > 90 days  -> none
 *   31-90      -> notice   (amber dot)
 *   8-30       -> warning  (amber banner + dot)
 *   1-7        -> urgent   (red banner + dot)
 *   <= 0       -> expired  (red banner + dot)
 */
export function getLicenseAlertLevel(expirationDate: string, today: Date = new Date()): LicenseAlertLevel {
  const exp = new Date(expirationDate + 'T00:00:00')
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const msPerDay = 1000 * 60 * 60 * 24
  const days = Math.floor((exp.getTime() - t.getTime()) / msPerDay)
  if (days <= 0) return 'expired'
  if (days <= 7) return 'urgent'
  if (days <= 30) return 'warning'
  if (days <= 90) return 'notice'
  return 'none'
}

/** True if any level except 'none' — used for "any alert" checks. */
export function isAlerting(level: LicenseAlertLevel): boolean {
  return level !== 'none'
}

/** True for warning/urgent/expired — used for banner + name-dot triggers. */
export function isBannerLevel(level: LicenseAlertLevel): boolean {
  return level === 'warning' || level === 'urgent' || level === 'expired'
}

export async function fetchUserLicenses(userId: string): Promise<AppraiserLicense[]> {
  const supabase = createBrowserClient()
  const { data, error } = await supabase
    .from('appraiser_licenses')
    .select('*')
    .eq('user_id', userId)
    .order('expiration_date', { ascending: true })
  if (error) {
    console.error('fetchUserLicenses failed:', error)
    return []
  }
  return (data as AppraiserLicenseRow[]).map(rowToLicense)
}

/** Fetch every license across all users — for admin dashboard banner. */
export async function fetchAllLicenses(): Promise<AppraiserLicense[]> {
  const supabase = createBrowserClient()
  const { data, error } = await supabase
    .from('appraiser_licenses')
    .select('*')
    .order('expiration_date', { ascending: true })
  if (error) {
    console.error('fetchAllLicenses failed:', error)
    return []
  }
  return (data as AppraiserLicenseRow[]).map(rowToLicense)
}
