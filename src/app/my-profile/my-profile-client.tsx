"use client"

import { useEffect, useState } from 'react'
import { fetchCurrentProfileBrowser, type Profile } from '@/lib/supabase/profiles'
import { fetchFeeCatalog, type FeeCatalogEntry } from '@/lib/supabase/fee-catalog'
import { fetchAppraiserFees } from '@/lib/supabase/appraiser-fees'
import { fetchUserLicenses, getLicenseAlertLevel, type AppraiserLicense, type LicenseAlertLevel } from '@/lib/supabase/appraiser-licenses'
import { fetchUserDocuments, type AppraiserDocument } from '@/lib/supabase/appraiser-documents'
import { Download } from 'lucide-react'

type TabKey = 'info' | 'fees' | 'licenses' | 'documents'
const TABS: { key: TabKey; label: string }[] = [
  { key: 'info',      label: 'Information' },
  { key: 'fees',      label: 'Fees' },
  { key: 'licenses',  label: 'Licenses' },
  { key: 'documents', label: 'Documents' },
]

export function MyProfileClient() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabKey>('info')

  useEffect(() => {
    fetchCurrentProfileBrowser().then(p => { setProfile(p); setLoading(false) })
  }, [])

  if (loading) return <div className="text-sm text-gray-500">Loading…</div>
  if (!profile) return <div className="text-sm text-red-600">Profile not found.</div>

  return (
    <div className="space-y-6">
      <div className="border-b border-gray-200">
        <nav className="flex gap-1 -mb-px">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>
      {tab === 'info'      && <ReadInfo profile={profile} />}
      {tab === 'fees'      && <ReadFees userId={profile.id} />}
      {tab === 'licenses'  && <ReadLicenses userId={profile.id} />}
      {tab === 'documents' && <ReadDocuments userId={profile.id} />}
    </div>
  )
}

function ReadInfo({ profile }: { profile: Profile }) {
  const addr = [profile.addressStreet, profile.addressCity, profile.addressState, profile.addressZip].filter(Boolean).join(', ') || '—'
  return (
    <dl className="space-y-3 max-w-lg">
      <Row label="Name"    value={profile.name || '—'} />
      <Row label="Email"   value={profile.email} />
      <Row label="Phone"   value={profile.phone || '—'} />
      <Row label="Address" value={addr} />
      <Row label="Status"  value={profile.isActive ? 'Active' : 'Inactive'} />
    </dl>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-3 gap-4 py-2 border-b border-gray-100">
      <dt className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</dt>
      <dd className="col-span-2 text-sm text-gray-800">{value}</dd>
    </div>
  )
}

function ReadFees({ userId }: { userId: string }) {
  const [catalog, setCatalog] = useState<FeeCatalogEntry[]>([])
  const [amounts, setAmounts] = useState<Map<string, number | null>>(new Map())
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    Promise.all([fetchFeeCatalog(), fetchAppraiserFees(userId)]).then(([c, a]) => {
      setCatalog(c); setAmounts(a); setLoading(false)
    })
  }, [userId])
  if (loading) return <div className="text-sm text-gray-500">Loading…</div>
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden max-w-2xl">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Fee</th>
            <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-40">Amount ($)</th>
          </tr>
        </thead>
        <tbody>
          {catalog.map(entry => {
            const label = entry.unit === 'per_mile' ? `${entry.label} ($/mile)` : entry.label
            const value = amounts.get(entry.id)
            return (
              <tr key={entry.id} className="border-b border-gray-100 last:border-b-0">
                <td className="px-4 py-2 text-gray-800">{label}</td>
                <td className="px-4 py-2 text-right text-gray-800">{value === null || value === undefined ? <span className="text-gray-400">—</span> : value.toFixed(2)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ReadLicenses({ userId }: { userId: string }) {
  const [rows, setRows] = useState<AppraiserLicense[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => { fetchUserLicenses(userId).then(r => { setRows(r); setLoading(false) }) }, [userId])
  if (loading) return <div className="text-sm text-gray-500">Loading…</div>
  if (rows.length === 0) return <div className="text-sm text-gray-400 italic">No licenses on file. Contact an admin to add one.</div>
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden max-w-3xl">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-20">State</th>
            <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">License #</th>
            <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-40">Expires</th>
            <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-32">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const level = getLicenseAlertLevel(row.expirationDate)
            return (
              <tr key={row.id} className="border-b border-gray-100 last:border-b-0">
                <td className="px-3 py-2 font-mono text-xs">{row.state}</td>
                <td className="px-3 py-2 font-mono text-xs">{row.licenseNumber}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{row.expirationDate}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <SmallStatusPill status={row.status} />
                    <SmallLevelBadge level={level} expiration={row.expirationDate} />
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function SmallStatusPill({ status }: { status: 'active' | 'expired' | 'pending' }) {
  if (status === 'active') return null  // active is the default, no badge needed
  const styles: Record<string, string> = {
    pending: 'text-amber-700 bg-amber-50 border-amber-200',
    expired: 'text-red-700 bg-red-100 border-red-300',
  }
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border capitalize ${styles[status] ?? ''}`}>
      {status}
    </span>
  )
}

function SmallLevelBadge({ level, expiration }: { level: LicenseAlertLevel; expiration: string }) {
  if (level === 'none') return null
  const daysUntil = Math.floor((new Date(expiration + 'T00:00:00').getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  const styles: Record<Exclude<LicenseAlertLevel, 'none'>, { cls: string; text: string }> = {
    notice:  { cls: 'text-amber-700 bg-amber-50 border-amber-200', text: `${daysUntil}d` },
    warning: { cls: 'text-amber-700 bg-amber-100 border-amber-300', text: `${daysUntil}d` },
    urgent:  { cls: 'text-red-700 bg-red-50 border-red-200', text: `${daysUntil}d` },
    expired: { cls: 'text-red-700 bg-red-100 border-red-300', text: 'EXPIRED' },
  }
  const s = styles[level]
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${s.cls}`}>{s.text}</span>
}

function ReadDocuments({ userId }: { userId: string }) {
  const [rows, setRows] = useState<AppraiserDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { fetchUserDocuments(userId).then(r => { setRows(r); setLoading(false) }) }, [userId])

  const download = async (id: string) => {
    const res = await fetch(`/api/appraiser-documents/${id}/download`)
    if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.error ?? 'Download failed'); return }
    const { url } = await res.json()
    window.open(url, '_blank', 'noopener')
  }

  if (loading) return <div className="text-sm text-gray-500">Loading…</div>
  if (rows.length === 0) return <div className="text-sm text-gray-400 italic">No documents on file.</div>
  return (
    <div className="space-y-3 max-w-3xl">
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">Kind</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-40">Uploaded</th>
              <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-16">Get</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(doc => (
              <tr key={doc.id} className="border-b border-gray-100 last:border-b-0">
                <td className="px-3 py-2 text-gray-800">{doc.name}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{doc.kind ?? '—'}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{new Date(doc.uploadedAt).toLocaleDateString()}</td>
                <td className="px-3 py-2 text-right"><button onClick={() => download(doc.id)} className="text-gray-400 hover:text-blue-600" title="Download"><Download className="w-4 h-4" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <div className="p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
    </div>
  )
}
