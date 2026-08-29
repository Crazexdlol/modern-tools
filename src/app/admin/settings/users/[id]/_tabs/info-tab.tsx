"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { Profile } from '@/lib/supabase/profiles'

export function InfoTab({ profile, onSaved }: { profile: Profile; onSaved: () => void }) {
  const [name, setName] = useState(profile.name ?? '')
  const [phone, setPhone] = useState(profile.phone ?? '')
  const [street, setStreet] = useState(profile.addressStreet ?? '')
  const [city, setCity] = useState(profile.addressCity ?? '')
  const [state, setState] = useState(profile.addressState ?? '')
  const [zip, setZip] = useState(profile.addressZip ?? '')
  const [isActive, setIsActive] = useState(profile.isActive)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const save = async () => {
    setBusy(true); setError(null); setSaved(false)
    const res = await fetch(`/api/admin/users/${profile.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        phone: phone || null,
        addressStreet: street || null,
        addressCity: city || null,
        addressState: state || null,
        addressZip: zip || null,
        isActive,
      }),
    })
    setBusy(false)
    if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.error ?? 'Save failed'); return }
    setSaved(true)
    onSaved()
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <FieldRow label="Name">
        <input value={name} onChange={e => setName(e.target.value)} className={fieldCls} />
      </FieldRow>
      <FieldRow label="Email">
        <div className="text-sm text-gray-500 py-2">{profile.email} <span className="text-xs">(edit via Supabase dashboard)</span></div>
      </FieldRow>
      <FieldRow label="Phone">
        <input value={phone} onChange={e => setPhone(e.target.value)} className={fieldCls} />
      </FieldRow>

      <div className="pt-4 border-t border-gray-100">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Address</div>
        <FieldRow label="Street">
          <input value={street} onChange={e => setStreet(e.target.value)} className={fieldCls} />
        </FieldRow>
        <div className="grid grid-cols-3 gap-3 mt-3">
          <FieldRow label="City">
            <input value={city} onChange={e => setCity(e.target.value)} className={fieldCls} />
          </FieldRow>
          <FieldRow label="State">
            <input value={state} onChange={e => setState(e.target.value.toUpperCase())} maxLength={2} className={fieldCls} />
          </FieldRow>
          <FieldRow label="ZIP">
            <input value={zip} onChange={e => setZip(e.target.value)} className={fieldCls} />
          </FieldRow>
        </div>
      </div>

      <div className="pt-4 border-t border-gray-100">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
          <span className="font-medium">Active</span>
          <span className="text-gray-500">— when off, this user is hidden from the assignment picker but retains login and history.</span>
        </label>
      </div>

      {error && <div className="p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
      {saved && !error && <div className="text-green-700 text-sm">Saved.</div>}

      <div>
        <Button onClick={save} disabled={busy} className="bg-blue-600 text-white">
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  )
}

const fieldCls = 'w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">{label}</span>
      {children}
    </label>
  )
}
