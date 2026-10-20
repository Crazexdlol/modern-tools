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
import { CompaniesTab } from './_tabs/companies-tab'

type TabKey = 'info' | 'permissions' | 'companies' | 'fees' | 'licenses' | 'documents'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'info',        label: 'Information' },
  { key: 'permissions', label: 'Permissions' },
  { key: 'companies',   label: 'Companies' },
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
    <div className="space-y-5">
      <Link
        href="/admin/settings/users"
        className="hp-btn hp-btn-sm hp-btn-ghost w-fit -ml-2"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Users
      </Link>

      <div>
        <h1 className="hp-display">{profile.name || profile.email}</h1>
        <div className="text-[13px] text-slate-500 mt-1">{profile.email}</div>
      </div>

      <div className="flex items-center flex-wrap gap-1 bg-slate-200/70 p-1 rounded-xl w-fit max-w-full overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`inline-flex items-center h-8 px-3.5 rounded-lg text-[13px] font-semibold transition-colors whitespace-nowrap ${
              tab === t.key
                ? 'bg-white text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.1),0_2px_6px_rgba(15,23,42,0.08)] ring-1 ring-slate-900/10'
                : 'text-slate-500 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div>
        {tab === 'info'        && <InfoTab profile={profile} onSaved={load} />}
        {tab === 'permissions' && <PermissionsTab profile={profile} onSaved={load} />}
        {tab === 'companies'   && <CompaniesTab userId={profile.id} />}
        {tab === 'fees'        && <FeesTab userId={profile.id} />}
        {tab === 'licenses'    && <LicensesTab userId={profile.id} />}
        {tab === 'documents'   && <DocumentsTab userId={profile.id} />}
      </div>
    </div>
  )
}
