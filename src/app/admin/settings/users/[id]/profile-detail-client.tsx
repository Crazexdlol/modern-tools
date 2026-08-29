"use client"

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { fetchAllProfilesBrowser, type Profile } from '@/lib/supabase/profiles'
import { InfoTab } from './_tabs/info-tab'
import { PermissionsTab } from './_tabs/permissions-tab'
import { FeesTab } from './_tabs/fees-tab'
import { LicensesTab } from './_tabs/licenses-tab'
import { DocumentsTab } from './_tabs/documents-tab'

type TabKey = 'info' | 'permissions' | 'fees' | 'licenses' | 'documents'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'info',        label: 'Information' },
  { key: 'permissions', label: 'Permissions' },
  { key: 'fees',        label: 'Fees' },
  { key: 'licenses',    label: 'Licenses' },
  { key: 'documents',   label: 'Documents' },
]

export function ProfileDetailClient({ userId }: { userId: string }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabKey>('info')

  const load = async () => {
    const all = await fetchAllProfilesBrowser()
    setProfile(all.find(p => p.id === userId) ?? null)
    setLoading(false)
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-load pattern
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  if (loading) return <div className="text-sm text-gray-500">Loading…</div>
  if (!profile) return <div className="text-sm text-red-600">User not found.</div>

  return (
    <div className="space-y-6">
      <Link
        href="/admin/settings/users"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Users
      </Link>

      <div>
        <h1 className="text-2xl font-bold">{profile.name || profile.email}</h1>
        <div className="text-sm text-gray-500">{profile.email}</div>
      </div>

      <div className="border-b border-gray-200">
        <nav className="flex gap-1 -mb-px">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      <div>
        {tab === 'info'        && <InfoTab profile={profile} onSaved={load} />}
        {tab === 'permissions' && <PermissionsTab profile={profile} onSaved={load} />}
        {tab === 'fees'        && <FeesTab userId={profile.id} />}
        {tab === 'licenses'    && <LicensesTab userId={profile.id} />}
        {tab === 'documents'   && <DocumentsTab userId={profile.id} />}
      </div>
    </div>
  )
}
