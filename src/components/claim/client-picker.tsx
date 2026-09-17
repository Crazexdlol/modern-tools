"use client"

import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Building2, ChevronDown, Loader2, Plus, X } from 'lucide-react'
import {
  CLIENT_TYPE_LABELS,
  createClient as createClientRecord,
  fuzzyMatchClients,
  searchClientsByName,
  type Client,
  type ClientType,
  type FuzzyClientMatch,
} from '@/lib/supabase/clients'

// Threshold above which we treat a fuzzy match as a likely duplicate. Same
// value the API's search RPC returns candidates against (0.3), just raised
// for the actual duplicate-guard warning shown in the create modal.
const DUPLICATE_GUARD_THRESHOLD = 0.4

export function ClientPicker({
  value,
  valueName,
  onChange,
  placeholder = 'Sedgwick',
  inputClassName,
}: {
  // Currently linked client id (from acv_history.client_id). null when the
  // claim only has the legacy free-text clientName.
  value: string | null
  // Free-text clientName (ClaimInfo.clientName). Shown when no client_id is set
  // so the pre-existing value stays visible until the appraiser picks a client.
  valueName: string
  // Fires whenever the linked client changes. Passes both the id (for
  // acv_history.client_id) and the display name (for ClaimInfo.clientName).
  onChange: (clientId: string | null, clientName: string) => void
  placeholder?: string
  inputClassName?: string
}) {
  // Search box query. Starts equal to valueName so the input shows the
  // current value; typing overwrites it.
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<Client[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(
    value ? { id: value, name: valueName } : null,
  )
  const [addModalOpen, setAddModalOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  // Reset local `selected` when the caller re-hydrates value/valueName (e.g.
  // switching between claims). Only run when the incoming id actually changes.
  useEffect(() => {
    if (value) setSelected({ id: value, name: valueName })
    else setSelected(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  // Debounced search.
  useEffect(() => {
    if (!open) return
    if (!query.trim()) { setResults([]); return }
    setLoading(true)
    const timer = setTimeout(() => {
      searchClientsByName(query, 12).then((rows) => {
        setResults(rows)
        setLoading(false)
      })
    }, 200)
    return () => clearTimeout(timer)
  }, [query, open])

  // Close on outside click.
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const pick = (c: Client) => {
    setSelected({ id: c.id, name: c.name })
    setQuery('')
    setOpen(false)
    onChange(c.id, c.name)
  }

  const clear = () => {
    setSelected(null)
    setQuery('')
    onChange(null, '')
  }

  const openAddModal = () => {
    setAddModalOpen(true)
    setOpen(false)
  }

  // The visible input shows the selected client name (read-only-feel) or the
  // in-progress query. Clicking opens the dropdown; typing starts a search.
  const displayValue = open ? query : (selected?.name ?? '')

  return (
    <>
      <div className="relative" ref={wrapRef}>
        <div className={`relative flex items-center ${inputClassName ?? ''}`}>
          <input
            type="text"
            className="w-full bg-transparent border-none outline-none focus:ring-0 pr-16 truncate"
            placeholder={placeholder}
            value={displayValue}
            onFocus={() => setOpen(true)}
            onChange={(e) => { setQuery(e.target.value); if (!open) setOpen(true) }}
          />
          <div className="absolute right-2 flex items-center gap-1">
            {selected && !open && (
              <button
                type="button"
                onClick={clear}
                className="p-0.5 text-gray-400 hover:text-red-500"
                title="Unlink client"
                aria-label="Unlink client"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <ChevronDown className="w-4 h-4 text-gray-400" />
          </div>
        </div>

        {open && (
          <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-30 max-h-80 overflow-y-auto">
            {loading && (
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-gray-500">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Searching…
              </div>
            )}
            {!loading && query.trim() && results.length === 0 && (
              <div className="px-3 py-2 text-xs text-gray-500">No matches.</div>
            )}
            {results.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => pick(c)}
                className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-blue-50 border-b border-gray-100 last:border-b-0"
              >
                <Building2 className="w-4 h-4 text-blue-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-900 truncate">{c.name}</div>
                  <div className="text-xs text-gray-500">
                    {CLIENT_TYPE_LABELS[c.type]}{c.city || c.state ? ` · ${[c.city, c.state].filter(Boolean).join(', ')}` : ''}
                  </div>
                </div>
              </button>
            ))}
            <button
              type="button"
              onClick={openAddModal}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-blue-600 hover:bg-blue-50 border-t border-gray-200"
            >
              <Plus className="w-4 h-4" />
              Add new client{query.trim() ? `: "${query.trim()}"` : ''}
            </button>
          </div>
        )}
      </div>

      {addModalOpen && (
        <AddClientModal
          initialName={query.trim() || valueName || ''}
          onCancel={() => setAddModalOpen(false)}
          onCreated={(c) => {
            setAddModalOpen(false)
            setSelected({ id: c.id, name: c.name })
            setQuery('')
            onChange(c.id, c.name)
          }}
        />
      )}
    </>
  )
}

function AddClientModal({
  initialName,
  onCancel,
  onCreated,
}: {
  initialName: string
  onCancel: () => void
  onCreated: (c: Client) => void
}) {
  const [name, setName] = useState(initialName)
  const [type, setType] = useState<ClientType>('adjuster')
  const [city, setCity] = useState('')
  const [state, setStateCode] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [matches, setMatches] = useState<FuzzyClientMatch[]>([])
  const [checkingMatches, setCheckingMatches] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fuzzy-match check runs after a short debounce whenever the name changes.
  // Anything with similarity >= DUPLICATE_GUARD_THRESHOLD renders as a "did
  // you mean" chip the user can one-click select instead of creating.
  useEffect(() => {
    if (!name.trim()) { setMatches([]); return }
    setCheckingMatches(true)
    const timer = setTimeout(() => {
      fuzzyMatchClients(name, 6).then((rows) => {
        setMatches(rows.filter((r) => r.similarity >= DUPLICATE_GUARD_THRESHOLD))
        setCheckingMatches(false)
      })
    }, 300)
    return () => clearTimeout(timer)
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
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            {matches.length > 0 && (
              <div className="mt-2 flex items-start gap-2 p-2 rounded-lg bg-amber-50 border border-amber-200">
                <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-amber-900">Did you mean:</div>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {matches.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => pickExisting(m)}
                        className="text-xs font-medium px-2 py-1 rounded-full bg-white border border-amber-300 text-amber-900 hover:bg-amber-100"
                      >
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
            <select
              value={type}
              onChange={(e) => setType(e.target.value as ClientType)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {(Object.keys(CLIENT_TYPE_LABELS) as ClientType[]).map((t) => (
                <option key={t} value={t}>{CLIENT_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">City</label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">State</label>
              <input
                type="text"
                value={state}
                maxLength={2}
                onChange={(e) => setStateCode(e.target.value.toUpperCase())}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Phone</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {error && (
            <div className="p-2 rounded bg-red-50 border border-red-200 text-red-700 text-xs">{error}</div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200 bg-gray-50 rounded-b-lg">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !name.trim()}
            className="text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
