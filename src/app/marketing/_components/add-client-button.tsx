"use client"

import { useEffect, useState } from 'react'
import { AlertTriangle, Loader2, Plus, X } from 'lucide-react'
import {
  CLIENT_TYPE_LABELS,
  SELECTABLE_CLIENT_TYPES,
  createClient as createClientRecord,
  fuzzyMatchClients,
  type Client,
  type ClientType,
  type FuzzyClientMatch,
} from '@/lib/supabase/clients'

const DUPLICATE_GUARD_THRESHOLD = 0.4

// Standalone "Add client" button + modal for the Marketing tab toolbar.
// Mirrors the modal used by ClientPicker, but is triggered by a button
// instead of the "Add new client" row in the dropdown.
export function AddClientButton({ onCreated }: { onCreated: (c: Client) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded-lg"
      >
        <Plus className="w-4 h-4" /> Add
      </button>
      {open && (
        <AddClientModal
          onCancel={() => setOpen(false)}
          onCreated={(c) => { setOpen(false); onCreated(c) }}
        />
      )}
    </>
  )
}

function AddClientModal({
  onCancel,
  onCreated,
}: {
  onCancel: () => void
  onCreated: (c: Client) => void
}) {
  const [name, setName] = useState('')
  const [type, setType] = useState<ClientType>('tpa')
  const [typeCustom, setTypeCustom] = useState('')
  const [city, setCity] = useState('')
  const [state, setStateCode] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [matches, setMatches] = useState<FuzzyClientMatch[]>([])
  const [checkingMatches, setCheckingMatches] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!name.trim()) { setMatches([]); return }
    setCheckingMatches(true)
    const t = setTimeout(() => {
      fuzzyMatchClients(name, 6).then((rows) => {
        setMatches(rows.filter(r => r.similarity >= DUPLICATE_GUARD_THRESHOLD))
        setCheckingMatches(false)
      })
    }, 300)
    return () => clearTimeout(t)
  }, [name])

  const save = async () => {
    if (!name.trim()) { setError('Name is required.'); return }
    setSaving(true)
    setError(null)
    const created = await createClientRecord({
      name: name.trim(),
      type,
      city: city.trim() || null,
      state: state.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      typeCustom: type === 'other' ? (typeCustom.trim() || null) : null,
    })
    setSaving(false)
    if (!created) { setError('Could not create client. Try again.'); return }
    onCreated(created)
  }

  const pickExisting = (m: FuzzyClientMatch) => {
    onCreated({
      id: m.id,
      name: m.name,
      type: m.type,
      typeCustom: null,
      roughNumbersDefault: false,
      rtaDefault: false,
      addressLine: null, city: m.city, state: m.state, zip: null,
      lat: null, lng: null, phone: null, email: null, website: null, notes: null,
      lastMarketedAt: null, remarketIntervalDays: null, nextRemarketAt: null,
      reminderSentAt: null, archivedAt: null, createdBy: null,
      createdAt: '', updatedAt: '',
    })
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg bg-white rounded-lg shadow-xl border border-gray-200">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Add client</h2>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-700" aria-label="Cancel">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus
                   className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            {matches.length > 0 && (
              <div className="mt-2 flex items-start gap-2 p-2 rounded-lg bg-amber-50 border border-amber-200">
                <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-amber-900">Did you mean:</div>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {matches.map(m => (
                      <button key={m.id} type="button" onClick={() => pickExisting(m)}
                              className="text-xs font-medium px-2 py-1 rounded-full bg-white border border-amber-300 text-amber-900 hover:bg-amber-100">
                        {m.name}{m.city || m.state ? ` · ${[m.city, m.state].filter(Boolean).join(', ')}` : ''}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {checkingMatches && matches.length === 0 && (
              <div className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Checking for duplicates…
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Type</label>
            <select value={type} onChange={(e) => setType(e.target.value as ClientType)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {SELECTABLE_CLIENT_TYPES.map(t => (
                <option key={t} value={t}>{CLIENT_TYPE_LABELS[t]}</option>
              ))}
            </select>
            {type === 'other' && (
              <div className="mt-2">
                <label className="block text-xs font-semibold text-gray-700 mb-1">Custom type label</label>
                <input type="text" value={typeCustom} onChange={(e) => setTypeCustom(e.target.value)} placeholder="e.g. Dealer group"
                       className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">City</label>
              <input type="text" value={city} onChange={(e) => setCity(e.target.value)}
                     className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">State</label>
              <input type="text" value={state} maxLength={2} onChange={(e) => setStateCode(e.target.value.toUpperCase())}
                     className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Phone</label>
              <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)}
                     className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                     className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          {error && <div className="p-2 rounded bg-red-50 border border-red-200 text-red-700 text-xs">{error}</div>}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200 bg-gray-50 rounded-b-lg">
          <button type="button" onClick={onCancel} disabled={saving} className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5">Cancel</button>
          <button type="button" onClick={save} disabled={saving || !name.trim()}
                  className="text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded-lg disabled:opacity-50">
            {saving ? 'Saving…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
