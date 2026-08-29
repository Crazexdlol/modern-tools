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

  const [emailModalOpen, setEmailModalOpen] = useState(false)
  const [passwordModalOpen, setPasswordModalOpen] = useState(false)

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
        <div className="flex items-center gap-3 py-2">
          <span className="text-sm text-gray-700">{profile.email}</span>
          <button
            type="button"
            onClick={() => setEmailModalOpen(true)}
            className="text-xs font-medium text-blue-600 hover:text-blue-800 underline"
          >
            Change
          </button>
        </div>
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

      <div className="pt-6 border-t border-gray-100 space-y-3">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Account actions</div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setPasswordModalOpen(true)}
            className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-800 text-sm font-medium px-3 py-2 rounded"
          >
            Reset password
          </button>
        </div>
        <p className="text-xs text-gray-500">
          Password reset sets a new password directly — no email link. Communicate the new password to the user out-of-band.
        </p>
      </div>

      {emailModalOpen && (
        <ChangeEmailModal
          userId={profile.id}
          currentEmail={profile.email}
          onClose={() => setEmailModalOpen(false)}
          onSaved={() => { setEmailModalOpen(false); onSaved() }}
        />
      )}
      {passwordModalOpen && (
        <ResetPasswordModal
          userId={profile.id}
          userName={profile.name || profile.email}
          onClose={() => setPasswordModalOpen(false)}
        />
      )}
    </div>
  )
}

function ChangeEmailModal({
  userId, currentEmail, onClose, onSaved,
}: {
  userId: string
  currentEmail: string
  onClose: () => void
  onSaved: () => void
}) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true); setError(null)
    const res = await fetch(`/api/admin/users/${userId}/change-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    setBusy(false)
    if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.error ?? 'Change failed'); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md space-y-4">
        <h2 className="text-lg font-semibold">Change email</h2>
        <div className="text-xs text-gray-500">
          Current: <span className="font-mono text-gray-700">{currentEmail}</span>
        </div>
        <input
          type="email"
          placeholder="new@email.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          autoFocus
        />
        {error && <div className="text-red-600 text-sm">{error}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={onClose} variant="outline" disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !email} className="bg-blue-600 text-white">
            {busy ? 'Saving…' : 'Change email'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function ResetPasswordModal({
  userId, userName, onClose,
}: {
  userId: string
  userName: string
  onClose: () => void
}) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const submit = async () => {
    setError(null)
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setBusy(true)
    const res = await fetch(`/api/admin/users/${userId}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    setBusy(false)
    if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.error ?? 'Reset failed'); return }
    setDone(true)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md space-y-4">
        <h2 className="text-lg font-semibold">Reset password for {userName}</h2>
        {done ? (
          <>
            <div className="p-3 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">
              Password updated. Give the new password to the user through a secure channel.
            </div>
            <div className="flex justify-end">
              <Button onClick={onClose} className="bg-blue-600 text-white">Done</Button>
            </div>
          </>
        ) : (
          <>
            <input
              type="password"
              placeholder="New password (8+ chars)"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            <input
              type="password"
              placeholder="Confirm new password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              className="w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {error && <div className="text-red-600 text-sm">{error}</div>}
            <div className="flex justify-end gap-2 pt-2">
              <Button onClick={onClose} variant="outline" disabled={busy}>Cancel</Button>
              <Button onClick={submit} disabled={busy || !password || !confirm} className="bg-blue-600 text-white">
                {busy ? 'Saving…' : 'Reset password'}
              </Button>
            </div>
          </>
        )}
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
