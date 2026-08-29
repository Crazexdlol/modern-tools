"use client"

import { useState } from 'react'
import type { Profile } from '@/lib/supabase/profiles'

type PermField = 'canCreateClaims' | 'canReassignClaims' | 'canEditClaimInfo' | 'autoStatusRequestsOverride'

const TOGGLES: { field: PermField; label: string; description: string }[] = [
  {
    field: 'canCreateClaims',
    label: 'Create claims',
    description: 'Can create new claims from the Dashboard.',
  },
  {
    field: 'canReassignClaims',
    label: 'Reassign claims',
    description: 'Can reassign a claim they own to another appraiser.',
  },
  {
    field: 'canEditClaimInfo',
    label: 'Edit Claim Info',
    description: 'Can edit the Claim Info form after the claim is created.',
  },
  {
    field: 'autoStatusRequestsOverride',
    label: 'Auto status requests',
    description: 'Receive automatic 48-hour status-request messages on assigned claims.',
  },
]

export function PermissionsTab({ profile, onSaved }: { profile: Profile; onSaved: () => void }) {
  const [values, setValues] = useState<Record<PermField, boolean>>({
    canCreateClaims: profile.canCreateClaims,
    canReassignClaims: profile.canReassignClaims,
    canEditClaimInfo: profile.canEditClaimInfo,
    autoStatusRequestsOverride: profile.autoStatusRequestsOverride === true,
  })
  const [busyField, setBusyField] = useState<PermField | null>(null)
  const [error, setError] = useState<string | null>(null)

  const toggle = async (field: PermField, next: boolean) => {
    setError(null)
    setBusyField(field)
    const prev = values[field]
    setValues(v => ({ ...v, [field]: next }))
    const res = await fetch(`/api/admin/users/${profile.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: next }),
    })
    setBusyField(null)
    if (!res.ok) {
      setValues(v => ({ ...v, [field]: prev }))
      const b = await res.json().catch(() => ({}))
      setError(b.error ?? 'Save failed')
      return
    }
    onSaved()
  }

  return (
    <div className="space-y-3 max-w-2xl">
      {TOGGLES.map(({ field, label, description }) => (
        <div key={field} className="flex items-start justify-between gap-4 py-3 border-b border-gray-100">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-900">{label}</div>
            <div className="text-xs text-gray-500 mt-0.5">{description}</div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={values[field]}
            disabled={busyField !== null}
            onClick={() => toggle(field, !values[field])}
            className={`shrink-0 w-11 h-6 rounded-full transition-colors relative ${
              values[field] ? 'bg-blue-600' : 'bg-gray-300'
            } disabled:opacity-50`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                values[field] ? 'translate-x-5' : ''
              }`}
            />
          </button>
        </div>
      ))}

      {error && <div className="p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
    </div>
  )
}
