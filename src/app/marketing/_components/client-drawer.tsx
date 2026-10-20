"use client"

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Archive, ExternalLink, Loader2, Star, StarOff, Trash2, X } from 'lucide-react'
import {
  archiveClient,
  CLIENT_TYPE_LABELS,
  SELECTABLE_CLIENT_TYPES,
  createContact,
  deleteContact,
  deleteLogEntry,
  fetchClaimsForClient,
  fetchClient,
  fetchContacts,
  fetchMarketingLog,
  logTouch,
  updateClient,
  updateContact,
  type Client,
  type ClientClaim,
  type ClientContact,
  type ClientMarketingLog,
  type ClientType,
  type MarketingMethod,
} from '@/lib/supabase/clients'
import { confirmDialog } from '@/components/ui/dialog-service'
import { geocodeAddress } from '@/lib/mapbox/geocode'

const METHOD_LABEL: Record<MarketingMethod, string> = {
  visit: 'Visit',
  call: 'Call',
  email: 'Email',
  mail: 'Mail',
  other: 'Other',
}

const INTERVAL_PRESETS: { label: string; value: number | null }[] = [
  { label: 'Not scheduled', value: null },
  { label: '30 days', value: 30 },
  { label: '60 days', value: 60 },
  { label: '90 days', value: 90 },
  { label: '180 days', value: 180 },
]

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
}

export function ClientDrawer({
  clientId,
  onClose,
  onSaved,
}: {
  clientId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [client, setClient] = useState<Client | null>(null)
  const [contacts, setContacts] = useState<ClientContact[]>([])
  const [log, setLog] = useState<ClientMarketingLog[]>([])
  const [claims, setClaims] = useState<ClientClaim[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      fetchClient(clientId),
      fetchContacts(clientId),
      fetchMarketingLog(clientId),
      fetchClaimsForClient(clientId),
    ]).then(([c, cts, lg, cls]) => {
      if (cancelled) return
      setClient(c)
      setContacts(cts)
      setLog(lg)
      setClaims(cls)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [clientId])

  const saveField = async <K extends keyof Client>(field: K, value: Client[K]) => {
    if (!client) return
    // Optimistic local update.
    const next = { ...client, [field]: value }
    setClient(next)
    const patch = { [field]: value } as { [P in K]: Client[P] }
    const updated = await updateClient(client.id, patch)
    if (updated) {
      setClient(updated)
      onSaved()
      // If an address component changed, re-geocode in the background. Blank
      // out the old pin if the new address geocodes to somewhere different.
      if (field === 'addressLine' || field === 'city' || field === 'state' || field === 'zip') {
        const coords = await geocodeAddress({
          addressLine: updated.addressLine,
          city: updated.city,
          state: updated.state,
          zip: updated.zip,
        })
        if (coords && (coords.lat !== updated.lat || coords.lng !== updated.lng)) {
          const geocoded = await updateClient(client.id, { lat: coords.lat, lng: coords.lng })
          if (geocoded) { setClient(geocoded); onSaved() }
        }
      }
    }
  }

  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside className="absolute top-0 right-0 h-full w-full sm:w-[560px] bg-white shadow-2xl border-l border-gray-200 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-100 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {loading || !client ? (
              <div className="h-6 w-40 bg-gray-100 rounded animate-pulse" />
            ) : (
              <>
                <input
                  value={client.name}
                  onChange={(e) => setClient({ ...client, name: e.target.value })}
                  onBlur={(e) => saveField('name', e.target.value)}
                  className="w-full text-lg font-bold text-gray-900 bg-transparent border-b border-transparent focus:border-blue-500 focus:outline-none"
                />
                <div className="text-xs text-gray-500 mt-0.5">Client details · auto-saved on blur</div>
              </>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {loading || !client ? (
            <div className="flex items-center justify-center py-16 text-gray-500 gap-2 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : (
            <>
              <FieldsSection client={client} onSave={saveField} />
              <MarketingSection
                client={client}
                onSaveClient={saveField}
                log={log}
                onLogChanged={async () => {
                  setLog(await fetchMarketingLog(client.id))
                  const c = await fetchClient(client.id)
                  if (c) setClient(c)
                  onSaved()
                }}
              />
              <ContactsSection clientId={client.id} contacts={contacts} onChanged={async () => {
                setContacts(await fetchContacts(client.id))
              }} />
              <ClaimsSection claims={claims} />
              <ArchiveSection clientId={client.id} onArchived={() => { onSaved(); onClose() }} />
            </>
          )}
        </div>
      </aside>
    </div>
  )
}

// ── Fields ────────────────────────────────────────────────────────────────
function FieldsSection({
  client,
  onSave,
}: {
  client: Client
  onSave: <K extends keyof Client>(field: K, value: Client[K]) => void
}) {
  return (
    <section>
      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Details</h3>
      <div className="grid grid-cols-2 gap-3">
        <FieldSelect label="Type" value={client.type} options={SELECTABLE_CLIENT_TYPES} labelFor={(t) => CLIENT_TYPE_LABELS[t]} onSave={(v) => onSave('type', v)} />
        {client.type === 'other' && (
          <FieldInput label="Custom type" value={client.typeCustom ?? ''} onSave={(v) => onSave('typeCustom', v || null)} placeholder="e.g. Dealer group" />
        )}
        <FieldInput label="Phone" value={client.phone ?? ''} onSave={(v) => onSave('phone', v || null)} />
        <FieldInput label="Email" value={client.email ?? ''} onSave={(v) => onSave('email', v || null)} />
        <FieldInput label="Website" value={client.website ?? ''} onSave={(v) => onSave('website', v || null)} />
        <div className="col-span-2">
          <FieldInput label="Address" value={client.addressLine ?? ''} onSave={(v) => onSave('addressLine', v || null)} />
        </div>
        <FieldInput label="City" value={client.city ?? ''} onSave={(v) => onSave('city', v || null)} />
        <FieldInput label="State" value={client.state ?? ''} onSave={(v) => onSave('state', v ? v.toUpperCase() : null)} maxLength={2} />
        <FieldInput label="Zip" value={client.zip ?? ''} onSave={(v) => onSave('zip', v || null)} />
      </div>
      <div className="mt-3">
        <FieldTextarea label="Notes" value={client.notes ?? ''} onSave={(v) => onSave('notes', v || null)} />
      </div>
      {/* Rough-numbers workflow default (2026-10-13). When on, new claims for
          this client pre-check the "Needs rough numbers?" toggle. Appraisers
          can still flip the toggle per-claim. */}
      <div className="mt-3 flex items-start justify-between gap-4 border-t border-gray-100 pt-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-700">Default to rough numbers for new claims</div>
          <div className="text-xs text-gray-500 mt-0.5">
            Pre-checks the Needs rough numbers toggle on new claims for this client. Appraisers can still flip the toggle per-claim.
          </div>
        </div>
        <label className="relative inline-flex items-center cursor-pointer shrink-0">
          <input
            type="checkbox"
            checked={client.roughNumbersDefault === true}
            onChange={(e) => onSave('roughNumbersDefault', e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-200 peer-checked:bg-blue-600 rounded-full peer peer-focus:ring-2 peer-focus:ring-blue-500/40 transition-colors"></div>
          <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform peer-checked:translate-x-5"></div>
        </label>
      </div>
      {/* RTA default (2026-10-18). When on, new claims for this client
          auto-add 'rta' (Right To Appraisal) to claim types — gates the
          Opposing Appraiser field as required at creation. Flipped on for
          Sedgwick clients by the migration. */}
      <div className="mt-3 flex items-start justify-between gap-4 border-t border-gray-100 pt-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-700">Default to RTA for new claims</div>
          <div className="text-xs text-gray-500 mt-0.5">
            Auto-adds the RTA (Right To Appraisal) chip to new claims for this client, which makes Opposing Appraiser required at creation.
          </div>
        </div>
        <label className="relative inline-flex items-center cursor-pointer shrink-0">
          <input
            type="checkbox"
            checked={client.rtaDefault === true}
            onChange={(e) => onSave('rtaDefault', e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-200 peer-checked:bg-blue-600 rounded-full peer peer-focus:ring-2 peer-focus:ring-blue-500/40 transition-colors"></div>
          <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform peer-checked:translate-x-5"></div>
        </label>
      </div>
    </section>
  )
}

function FieldInput({ label, value, onSave, maxLength, placeholder }: { label: string; value: string; onSave: (v: string) => void; maxLength?: number; placeholder?: string }) {
  const [v, setV] = useState(value)
  useEffect(() => { setV(value) }, [value])
  return (
    <div>
      <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">{label}</label>
      <input
        type="text"
        value={v}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => { if (v !== value) onSave(v) }}
        className="w-full text-sm border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  )
}

function FieldTextarea({ label, value, onSave }: { label: string; value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value)
  useEffect(() => { setV(value) }, [value])
  return (
    <div>
      <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">{label}</label>
      <textarea
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => { if (v !== value) onSave(v) }}
        rows={3}
        className="w-full text-sm border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
      />
    </div>
  )
}

function FieldSelect<T extends string>({ label, value, options, labelFor, onSave }: { label: string; value: T; options: T[]; labelFor: (t: T) => string; onSave: (v: T) => void }) {
  return (
    <div>
      <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onSave(e.target.value as T)}
        className="w-full text-sm border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
      >
        {options.map(o => <option key={o} value={o}>{labelFor(o)}</option>)}
      </select>
    </div>
  )
}

// ── Marketing ─────────────────────────────────────────────────────────────
function MarketingSection({
  client,
  onSaveClient,
  log,
  onLogChanged,
}: {
  client: Client
  onSaveClient: <K extends keyof Client>(f: K, v: Client[K]) => void
  log: ClientMarketingLog[]
  onLogChanged: () => Promise<void> | void
}) {
  const [touchDate, setTouchDate] = useState(todayISO())
  const [touchMethod, setTouchMethod] = useState<MarketingMethod>('visit')
  const [touchNotes, setTouchNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const preset = INTERVAL_PRESETS.find(p => p.value === client.remarketIntervalDays)?.value ?? 'custom'

  const submitTouch = async () => {
    if (!touchDate) return
    setSaving(true)
    await logTouch({ clientId: client.id, marketedAt: touchDate, method: touchMethod, notes: touchNotes || null })
    setSaving(false)
    setTouchNotes('')
    setTouchDate(todayISO())
    await onLogChanged()
  }

  const removeLog = async (id: string) => {
    if (!(await confirmDialog({ title: 'Remove touch?', message: 'This marketing touch will be removed from the log.', confirmLabel: 'Remove', variant: 'danger' }))) return
    await deleteLogEntry(id)
    await onLogChanged()
  }

  return (
    <section>
      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Marketing</h3>

      {/* Interval */}
      <div className="mb-3 grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Remarket every</label>
          <select
            value={preset === 'custom' ? 'custom' : String(preset)}
            onChange={(e) => {
              const v = e.target.value
              if (v === 'custom') return
              onSaveClient('remarketIntervalDays', v === 'null' ? null : Number(v))
            }}
            className="w-full text-sm border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            {INTERVAL_PRESETS.map(p => (
              <option key={String(p.value)} value={p.value === null ? 'null' : String(p.value)}>{p.label}</option>
            ))}
            <option value="custom">Custom…</option>
          </select>
          {preset === 'custom' && (
            <input
              type="number"
              min={1}
              value={client.remarketIntervalDays ?? ''}
              onChange={(e) => onSaveClient('remarketIntervalDays', e.target.value ? Number(e.target.value) : null)}
              className="mt-1 w-full text-sm border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Days"
            />
          )}
        </div>
        <div>
          <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Next remarket</div>
          <div className={`text-sm font-semibold ${client.nextRemarketAt && client.nextRemarketAt <= todayISO() ? 'text-red-700' : 'text-gray-800'}`}>
            {fmtDate(client.nextRemarketAt)}
          </div>
          <div className="text-[10px] text-gray-400 mt-0.5">last marketed {fmtDate(client.lastMarketedAt)}</div>
        </div>
      </div>

      {/* Log a touch */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
        <div className="text-xs font-semibold text-gray-700 mb-2">Log a touch</div>
        <div className="grid grid-cols-[auto_auto_1fr_auto] gap-2 items-end">
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Date</label>
            <input type="date" value={touchDate} onChange={(e) => setTouchDate(e.target.value)}
                   className="text-sm border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Method</label>
            <select value={touchMethod} onChange={(e) => setTouchMethod(e.target.value as MarketingMethod)}
                    className="text-sm border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              {(Object.keys(METHOD_LABEL) as MarketingMethod[]).map(m => (
                <option key={m} value={m}>{METHOD_LABEL[m]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Notes</label>
            <input type="text" value={touchNotes} onChange={(e) => setTouchNotes(e.target.value)}
                   placeholder="Optional"
                   className="w-full text-sm border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
          </div>
          <button type="button" onClick={submitTouch} disabled={saving || !touchDate}
                  className="text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg disabled:opacity-50">
            {saving ? '…' : 'Log'}
          </button>
        </div>
      </div>

      {/* History */}
      {log.length > 0 && (
        <div className="mt-3">
          <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">History</div>
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
            {log.map(l => (
              <li key={l.id} className="flex items-center gap-3 px-3 py-1.5 text-sm">
                <span className="tabular-nums text-xs text-gray-500 w-20">{fmtDate(l.marketedAt)}</span>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5 text-gray-700 w-14 text-center">
                  {METHOD_LABEL[l.method]}
                </span>
                <span className="flex-1 text-xs text-gray-600 truncate">{l.notes || <span className="text-gray-400 italic">—</span>}</span>
                <button onClick={() => removeLog(l.id)} className="text-gray-300 hover:text-red-500" title="Remove">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

// ── Contacts ──────────────────────────────────────────────────────────────
function ContactsSection({ clientId, contacts, onChanged }: {
  clientId: string
  contacts: ClientContact[]
  onChanged: () => Promise<void> | void
}) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [title, setTitle] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')

  const submit = async () => {
    if (!name.trim()) return
    await createContact({
      clientId, name, title: title || null, phone: phone || null, email: email || null,
      isPrimary: contacts.length === 0, // first contact auto-primary
    })
    setName(''); setTitle(''); setPhone(''); setEmail(''); setAdding(false)
    await onChanged()
  }

  const remove = async (id: string) => {
    if (!(await confirmDialog({ title: 'Remove contact?', message: 'This contact will be removed from the client.', confirmLabel: 'Remove', variant: 'danger' }))) return
    await deleteContact(id)
    await onChanged()
  }

  const setPrimary = async (c: ClientContact) => {
    await updateContact(c.id, { isPrimary: !c.isPrimary })
    await onChanged()
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Contacts</h3>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className="text-xs font-semibold text-blue-600 hover:text-blue-700">
            + Add
          </button>
        )}
      </div>

      {adding && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 mb-2 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus
                   className="text-sm border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
            <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)}
                   className="text-sm border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
            <input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)}
                   className="text-sm border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
            <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}
                   className="text-sm border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={submit} disabled={!name.trim()}
                    className="text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-md disabled:opacity-50">
              Save
            </button>
            <button type="button" onClick={() => setAdding(false)} className="text-xs text-gray-600 hover:text-gray-900">Cancel</button>
          </div>
        </div>
      )}

      {contacts.length === 0 && !adding ? (
        <div className="text-xs text-gray-400 italic">No contacts yet.</div>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
          {contacts.map(c => (
            <li key={c.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <button onClick={() => setPrimary(c)}
                      title={c.isPrimary ? 'Primary contact' : 'Set as primary'}
                      className={c.isPrimary ? 'text-amber-500' : 'text-gray-300 hover:text-amber-500'}>
                {c.isPrimary ? <Star className="w-4 h-4 fill-current" /> : <StarOff className="w-4 h-4" />}
              </button>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-gray-900 truncate">{c.name}</div>
                <div className="text-xs text-gray-500 truncate">
                  {c.title && <span>{c.title}</span>}
                  {c.title && (c.phone || c.email) && <span> · </span>}
                  {c.phone && <span>{c.phone}</span>}
                  {c.phone && c.email && <span> · </span>}
                  {c.email && <span>{c.email}</span>}
                </div>
              </div>
              <button onClick={() => remove(c.id)} className="text-gray-300 hover:text-red-500" title="Remove">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// ── Claims ────────────────────────────────────────────────────────────────
function ClaimsSection({ claims }: { claims: ClientClaim[] }) {
  const open = claims.filter(c => c.status === 'open').length
  const closed = claims.filter(c => c.status === 'closed').length
  return (
    <section>
      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
        Claims <span className="font-normal text-gray-400">· {claims.length} total{claims.length > 0 && ` · ${open} open · ${closed} closed`}</span>
      </h3>
      {claims.length === 0 ? (
        <div className="text-xs text-gray-400 italic">No claims linked yet.</div>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white max-h-64 overflow-y-auto">
          {claims.map(c => (
            <li key={c.id} className="px-3 py-1.5 text-sm flex items-center gap-2">
              <Link href={`/claims/${c.id}`} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline font-semibold truncate">
                {c.maNumber || c.id}
              </Link>
              <span className="text-xs text-gray-500 truncate flex-1">{c.vehicle}</span>
              <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${c.status === 'closed' ? 'bg-gray-100 border-gray-200 text-gray-600' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}>
                {c.status}
              </span>
              <Link href={`/claims/${c.id}`} target="_blank" rel="noreferrer" className="text-gray-400 hover:text-blue-600">
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// ── Archive ───────────────────────────────────────────────────────────────
function ArchiveSection({ clientId, onArchived }: { clientId: string; onArchived: () => void }) {
  const [busy, setBusy] = useState(false)
  return (
    <section className="pt-2 border-t border-gray-100">
      <button
        type="button"
        onClick={async () => {
          if (!(await confirmDialog({ title: 'Archive client?', message: 'Existing claim links remain but the client hides from the list. You can un-archive later.', confirmLabel: 'Archive', variant: 'danger' }))) return
          setBusy(true)
          const ok = await archiveClient(clientId)
          setBusy(false)
          if (ok) onArchived()
        }}
        disabled={busy}
        className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-red-600"
      >
        <Archive className="w-3.5 h-3.5" /> Archive client
      </button>
    </section>
  )
}
