"use client"

import { useEffect, useState } from 'react'
import { fetchSiteSetting } from '@/lib/supabase/site-settings'

export function SettingsAdminClient() {
  const [allowCreate, setAllowCreate] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetchSiteSetting<boolean>('allow_regular_create_claims').then(v => setAllowCreate(v ?? true))
  }, [])

  const set = async (value: boolean) => {
    setError(null); setSaved(false)
    const prev = allowCreate
    setAllowCreate(value) // optimistic
    const res = await fetch('/api/admin/site-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'allow_regular_create_claims', value }),
    })
    if (!res.ok) {
      setAllowCreate(prev) // revert
      const b = await res.json().catch(() => ({}))
      setError(b.error ?? 'Save failed')
      return
    }
    setSaved(true)
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
      <div className="flex items-start justify-between gap-6">
        <div>
          <div className="text-base font-semibold text-gray-900">Allow appraisers to create claims</div>
          <p className="text-sm text-gray-500 mt-1">
            When off, only admins can create new claims. Enforced server-side (RLS) — hiding
            the button is not the only guard.
          </p>
        </div>
        <button
          onClick={() => allowCreate !== null && set(!allowCreate)}
          disabled={allowCreate === null}
          className={`shrink-0 mt-1 relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            allowCreate ? 'bg-blue-600' : 'bg-gray-300'
          }`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            allowCreate ? 'translate-x-6' : 'translate-x-1'
          }`} />
        </button>
      </div>
      {error && <div className="text-red-600 text-sm">{error}</div>}
      {saved && <div className="text-green-700 text-sm">Saved</div>}
    </div>
  )
}
