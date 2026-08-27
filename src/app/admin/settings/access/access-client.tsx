"use client"

import { useEffect, useMemo, useState } from 'react'
import { fetchSiteSetting } from '@/lib/supabase/site-settings'
import { fetchAllProfilesBrowser, type Profile } from '@/lib/supabase/profiles'
import { SectionCard, ToggleRow } from '../_shared'

type PermField = 'canCreateClaims' | 'canReassignClaims' | 'canEditClaimInfo'

export function AccessClient() {
  const [allowCreate, setAllowCreate] = useState<boolean | null>(null)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pickerText, setPickerText] = useState('')
  const [busyField, setBusyField] = useState<PermField | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetchSiteSetting<boolean>('allow_regular_create_claims').then(v => setAllowCreate(v ?? true))
    fetchAllProfilesBrowser().then(rows => {
      setProfiles(rows)
      setLoading(false)
    })
  }, [])

  const appraisers = useMemo(
    () => profiles.filter(p => p.role === 'appraiser'),
    [profiles],
  )

  const selected = useMemo(
    () => appraisers.find(p => p.id === selectedId) ?? null,
    [appraisers, selectedId],
  )

  const saveGlobal = async (value: boolean) => {
    setError(null); setSaved(false)
    const prev = allowCreate
    setAllowCreate(value)
    const res = await fetch('/api/admin/site-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'allow_regular_create_claims', value }),
    })
    if (!res.ok) {
      setAllowCreate(prev)
      const b = await res.json().catch(() => ({}))
      setError(b.error ?? 'Save failed')
      return
    }
    setSaved(true)
  }

  const savePerm = async (userId: string, field: PermField, next: boolean) => {
    setError(null); setSaved(false)
    setBusyField(field)
    setProfiles(prev => prev.map(p => p.id === userId ? { ...p, [field]: next } as Profile : p))
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: next }),
    })
    setBusyField(null)
    if (!res.ok) {
      setProfiles(prev => prev.map(p => p.id === userId ? { ...p, [field]: !next } as Profile : p))
      const b = await res.json().catch(() => ({}))
      setError(b.error ?? 'Save failed')
      return
    }
    setSaved(true)
  }

  // When the user types a name/email into the picker and it matches exactly
  // one appraiser's "Name (email)" label, select them. This lets the datalist
  // dropdown act like a single-select combobox without extra chrome.
  const applyPickerText = (text: string) => {
    setPickerText(text)
    const match = appraisers.find(p => `${p.name || p.email} (${p.email})` === text)
    setSelectedId(match?.id ?? null)
  }

  return (
    <div className="space-y-6">
      <SectionCard
        title="Global"
        description="Master switch for appraiser-created claims."
      >
        <ToggleRow
          label="Enable appraiser-created claims"
          description="Master switch. When off, no appraiser can create claims regardless of per-user grants below. Admins can always create. Enforced server-side (RLS) — hiding the button is not the only guard."
          value={allowCreate}
          onChange={saveGlobal}
        />
      </SectionCard>

      <SectionCard
        title="Per-appraiser access"
        description={
          loading
            ? 'Loading users…'
            : `Search by name or email to view and edit an appraiser's permissions. ${appraisers.length} appraiser${appraisers.length === 1 ? '' : 's'} on this team.`
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              Select appraiser
            </label>
            <input
              type="text"
              list="access-appraiser-options"
              value={pickerText}
              onChange={(e) => applyPickerText(e.target.value)}
              placeholder="Type a name or email…"
              disabled={loading}
              className="w-full max-w-md bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm disabled:opacity-50"
            />
            <datalist id="access-appraiser-options">
              {appraisers.map(p => (
                <option key={p.id} value={`${p.name || p.email} (${p.email})`} />
              ))}
            </datalist>
          </div>

          {selected ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
              <div>
                <div className="text-sm font-semibold text-gray-900">
                  {selected.name || <span className="text-gray-400 italic">No name</span>}
                </div>
                <div className="text-xs text-gray-500">{selected.email}</div>
              </div>
              <div className="divide-y divide-gray-100 border-t border-gray-200">
                <PermToggleRow
                  label="Can create claims"
                  description={
                    allowCreate === false
                      ? 'Master switch is off — this permission has no effect until Enable appraiser-created claims is on.'
                      : 'When on, this appraiser sees the New Claim button and can create + fill in a claim.'
                  }
                  value={selected.canCreateClaims}
                  dimmed={allowCreate === false}
                  onChange={(v) => savePerm(selected.id, 'canCreateClaims', v)}
                  busy={busyField === 'canCreateClaims'}
                />
                <PermToggleRow
                  label="Can reassign claims"
                  description="When on, this appraiser can reassign claims that are currently assigned to them (hand-off flow). Admins can always reassign."
                  value={selected.canReassignClaims}
                  onChange={(v) => savePerm(selected.id, 'canReassignClaims', v)}
                  busy={busyField === 'canReassignClaims'}
                />
                <PermToggleRow
                  label="Can edit claim info"
                  description="When on, this appraiser can unlock and edit fields on the Claim Info form (MA #, Insured, VIN, dates, address, etc.). When off, the form is read-only for them — except Handling Appraiser, which anyone can edit since it feeds Award / Closing Notes. Admins can always edit."
                  value={selected.canEditClaimInfo}
                  onChange={(v) => savePerm(selected.id, 'canEditClaimInfo', v)}
                  busy={busyField === 'canEditClaimInfo'}
                />
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-500 italic">
              {loading
                ? 'Loading users…'
                : appraisers.length === 0
                  ? 'No appraisers yet.'
                  : pickerText
                    ? 'No appraiser matches that entry. Pick one from the dropdown.'
                    : 'Select an appraiser to view or edit their permissions.'}
            </div>
          )}
        </div>
      </SectionCard>

      {error && (
        <div className="p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
      )}
      {saved && !error && <div className="text-green-700 text-sm">Saved.</div>}
    </div>
  )
}

function PermToggleRow({
  label,
  description,
  value,
  onChange,
  dimmed = false,
  busy = false,
}: {
  label: string
  description: string
  value: boolean
  onChange: (v: boolean) => void
  dimmed?: boolean
  busy?: boolean
}) {
  return (
    <div className={`flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0 ${dimmed ? 'opacity-60' : ''}`}>
      <div className="flex-1">
        <div className="text-sm font-semibold text-gray-900">{label}</div>
        <div className="text-xs text-gray-500 mt-0.5">{description}</div>
      </div>
      <button
        onClick={() => onChange(!value)}
        disabled={busy}
        title={dimmed ? 'Master switch is off — this permission has no effect' : undefined}
        className={`mt-1 shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
          value ? 'bg-blue-600' : 'bg-gray-300'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            value ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  )
}
