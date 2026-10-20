"use client"

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Search, Plus, Trash2, Save, X, Star, StarOff, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { confirmDialog, alertDialog } from '@/components/ui/dialog-service'
import {
  CLIENT_TYPE_LABELS,
  SELECTABLE_CLIENT_TYPES,
  archiveClient,
  createClient,
  createContact,
  deleteContact,
  fetchAllClients,
  fetchClientClaimStats,
  fetchContacts,
  updateClient,
  updateContact,
  type Client,
  type ClientClaimStats,
  type ClientContact,
  type ClientType,
  type NewContactInput,
} from '@/lib/supabase/clients'

type StatusFilter = 'active' | 'all' | 'archived'
type TypeFilter = 'all' | ClientType

const inputCls = 'bg-white border border-slate-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const labelCls = 'block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1'

function typeLabelFor(client: Pick<Client, 'type' | 'typeCustom'>): string {
  if (client.type === 'other' && client.typeCustom) return client.typeCustom
  return CLIENT_TYPE_LABELS[client.type] ?? 'Other'
}

export function ClientsAdminClient() {
  const [clients, setClients] = useState<Client[]>([])
  const [stats, setStats] = useState<Map<string, ClientClaimStats>>(new Map())
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [stateFilter, setStateFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
  // Selected client for the edit panel (right-hand pane). Null = no selection.
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const reload = useCallback(async () => {
    const [cs, s] = await Promise.all([fetchAllClients(), fetchClientClaimStats()])
    setClients(cs)
    setStats(s)
    setLoading(false)
  }, [])

  useEffect(() => { void reload() }, [reload])

  const states = useMemo(() => {
    const set = new Set<string>()
    for (const c of clients) if (c.state) set.add(c.state)
    return Array.from(set).sort()
  }, [clients])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return clients.filter(c => {
      if (statusFilter === 'active' && c.archivedAt) return false
      if (statusFilter === 'archived' && !c.archivedAt) return false
      if (typeFilter !== 'all' && c.type !== typeFilter) return false
      if (stateFilter !== 'all' && c.state !== stateFilter) return false
      if (q) {
        const hay = [c.name, c.city ?? '', c.state ?? '', c.email ?? '', c.phone ?? '', typeLabelFor(c)]
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [clients, search, typeFilter, stateFilter, statusFilter])

  const selected = selectedId ? clients.find(c => c.id === selectedId) ?? null : null
  const activeCount = clients.filter(c => !c.archivedAt).length
  const archivedCount = clients.length - activeCount

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading clients…
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Summary strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryCard label="Total clients" value={clients.length} />
        <SummaryCard label="Active" value={activeCount} />
        <SummaryCard label="Archived" value={archivedCount} />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, city, email, phone, type"
            className={`pl-8 ${inputCls} w-full`}
          />
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as TypeFilter)} className={inputCls}>
          <option value="all">All types</option>
          {SELECTABLE_CLIENT_TYPES.map(t => (
            <option key={t} value={t}>{CLIENT_TYPE_LABELS[t]}</option>
          ))}
        </select>
        <select value={stateFilter} onChange={e => setStateFilter(e.target.value)} className={inputCls}>
          <option value="all">All states</option>
          {states.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as StatusFilter)} className={inputCls}>
          <option value="active">Active only</option>
          <option value="all">Active + archived</option>
          <option value="archived">Archived only</option>
        </select>
        <Button
          onClick={() => setAddOpen(true)}
          className="bg-blue-600 hover:bg-blue-500 text-white font-bold ml-auto"
        >
          <Plus className="w-4 h-4 mr-1" />
          Add Client
        </Button>
      </div>

      {/* Full-width table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-600">
              <th className="px-4 py-2.5">Name</th>
              <th className="px-4 py-2.5">Type</th>
              <th className="px-4 py-2.5">Location</th>
              <th className="px-4 py-2.5">Phone</th>
              <th className="px-4 py-2.5">Email</th>
              <th className="px-4 py-2.5 text-right">Claims</th>
              <th className="px-4 py-2.5">Last marketed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-10 text-center text-sm text-slate-400 italic">
                  {clients.length === 0 ? 'No clients yet — click Add Client to create one.' : 'No clients match your filters.'}
                </td>
              </tr>
            ) : (
              filtered.map(c => {
                const s = stats.get(c.id)
                return (
                  <tr
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className="cursor-pointer transition-colors hover:bg-slate-50"
                  >
                    <td className="px-4 py-2.5">
                      <div className="font-semibold text-slate-900">{c.name}</div>
                      {c.archivedAt && (
                        <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mt-0.5">
                          Archived
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-slate-700">{typeLabelFor(c)}</td>
                    <td className="px-4 py-2.5 text-slate-700">
                      {[c.city, c.state].filter(Boolean).join(', ') || <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-slate-700 tabular-nums">
                      {c.phone || <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-slate-700 truncate max-w-[220px]" title={c.email ?? undefined}>
                      {c.email || <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {s ? (
                        <>
                          <b>{s.total}</b>
                          <span className="text-slate-400 text-xs"> · {s.open} open</span>
                        </>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600 tabular-nums">
                      {c.lastMarketedAt
                        ? new Date(c.lastMarketedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : <span className="text-slate-400">—</span>}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal: client detail — opens when a row is clicked */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-8 bg-black/40 overflow-y-auto"
          onClick={() => setSelectedId(null)}
        >
          <div
            className="w-full max-w-2xl bg-white rounded-lg shadow-xl border border-slate-200 my-4"
            onClick={e => e.stopPropagation()}
          >
            <ClientDetailPanel
              key={selected.id}
              client={selected}
              onClose={() => setSelectedId(null)}
              onChanged={reload}
            />
          </div>
        </div>
      )}

      {addOpen && (
        <AddClientModal
          onClose={() => setAddOpen(false)}
          onCreated={async (id) => {
            setAddOpen(false)
            await reload()
            setSelectedId(id)
          }}
        />
      )}
    </div>
  )
}

// ─── Summary card ─────────────────────────────────────────────────────────────

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-5 py-4">
      <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 mb-1">{label}</div>
      <div className="text-3xl font-bold text-slate-900 tabular-nums leading-none">{value.toLocaleString()}</div>
    </div>
  )
}

// ─── Add client modal ─────────────────────────────────────────────────────────

function AddClientModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const [name, setName] = useState('')
  const [type, setType] = useState<ClientType>('tpa')
  const [typeCustom, setTypeCustom] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)

  const canSave = name.trim().length > 0 && (type !== 'other' || typeCustom.trim().length > 0)

  const save = async () => {
    if (!canSave) return
    setBusy(true)
    const created = await createClient({
      name,
      type,
      typeCustom: type === 'other' ? typeCustom : null,
      city, state, phone, email,
    })
    setBusy(false)
    if (!created) {
      await alertDialog({ title: 'Create failed', message: 'Could not create the client. Check the console for details.', variant: 'danger' })
      return
    }
    onCreated(created.id)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl border border-slate-200">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">Add Client</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className={labelCls}>Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Sedgwick" className={`${inputCls} w-full`} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Type</label>
              <select value={type} onChange={e => setType(e.target.value as ClientType)} className={`${inputCls} w-full`}>
                {SELECTABLE_CLIENT_TYPES.map(t => (
                  <option key={t} value={t}>{CLIENT_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
            {type === 'other' && (
              <div>
                <label className={labelCls}>Custom type label</label>
                <input value={typeCustom} onChange={e => setTypeCustom(e.target.value)} placeholder="Dealer group" className={`${inputCls} w-full`} />
              </div>
            )}
          </div>
          <div className="grid grid-cols-[1fr_80px] gap-3">
            <div>
              <label className={labelCls}>City</label>
              <input value={city} onChange={e => setCity(e.target.value)} className={`${inputCls} w-full`} />
            </div>
            <div>
              <label className={labelCls}>State</label>
              <input value={state} onChange={e => setState(e.target.value.toUpperCase())} maxLength={2} className={`${inputCls} w-full uppercase tabular-nums`} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Phone</label>
              <input value={phone} onChange={e => setPhone(e.target.value)} className={`${inputCls} w-full`} />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input value={email} onChange={e => setEmail(e.target.value)} className={`${inputCls} w-full`} />
            </div>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2 bg-slate-50">
          <Button onClick={onClose} variant="outline" disabled={busy}>Cancel</Button>
          <Button
            onClick={save}
            disabled={!canSave || busy}
            className="bg-blue-600 hover:bg-blue-500 text-white font-bold"
          >
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            Create
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Detail panel (edit + contacts) ───────────────────────────────────────────

function ClientDetailPanel({
  client,
  onClose,
  onChanged,
}: {
  client: Client
  onClose: () => void
  onChanged: () => Promise<void> | void
}) {
  // Local edit state — initialized from props. Reseeds via `key` on the
  // parent when the user selects a different client.
  const [name, setName] = useState(client.name)
  const [type, setType] = useState<ClientType>(
    client.type === 'adjuster' ? 'tpa' : client.type,
  )
  const [typeCustom, setTypeCustom] = useState(client.typeCustom ?? '')
  const [addressLine, setAddressLine] = useState(client.addressLine ?? '')
  const [city, setCity] = useState(client.city ?? '')
  const [state, setState] = useState(client.state ?? '')
  const [zip, setZip] = useState(client.zip ?? '')
  const [phone, setPhone] = useState(client.phone ?? '')
  const [email, setEmail] = useState(client.email ?? '')
  const [website, setWebsite] = useState(client.website ?? '')
  const [notes, setNotes] = useState(client.notes ?? '')
  const [busy, setBusy] = useState(false)

  const [contacts, setContacts] = useState<ClientContact[]>([])
  const [contactsLoading, setContactsLoading] = useState(true)

  const reloadContacts = useCallback(async () => {
    const list = await fetchContacts(client.id)
    setContacts(list)
    setContactsLoading(false)
  }, [client.id])

  useEffect(() => {
    setContactsLoading(true)
    void reloadContacts()
  }, [reloadContacts])

  const dirty =
    name !== client.name ||
    type !== (client.type === 'adjuster' ? 'tpa' : client.type) ||
    typeCustom !== (client.typeCustom ?? '') ||
    addressLine !== (client.addressLine ?? '') ||
    city !== (client.city ?? '') ||
    state !== (client.state ?? '') ||
    zip !== (client.zip ?? '') ||
    phone !== (client.phone ?? '') ||
    email !== (client.email ?? '') ||
    website !== (client.website ?? '') ||
    notes !== (client.notes ?? '')

  const save = async () => {
    if (!dirty) return
    setBusy(true)
    const updated = await updateClient(client.id, {
      name,
      type,
      typeCustom: type === 'other' ? (typeCustom || null) : null,
      addressLine: addressLine || null,
      city: city || null,
      state: state || null,
      zip: zip || null,
      phone: phone || null,
      email: email || null,
      website: website || null,
      notes: notes || null,
    })
    setBusy(false)
    if (!updated) {
      await alertDialog({ title: 'Save failed', message: 'Could not save client. Check the console for details.', variant: 'danger' })
      return
    }
    await onChanged()
  }

  const toggleArchive = async () => {
    if (!client.archivedAt) {
      if (!(await confirmDialog({
        title: 'Archive this client?',
        message: `Archive ${client.name}? It will be hidden from the active list but existing claims keep their reference.`,
        confirmLabel: 'Archive',
        variant: 'danger',
      }))) return
      setBusy(true)
      await archiveClient(client.id)
    } else {
      // Un-archive = clear archived_at via updateClient (archivedAt accepts null).
      setBusy(true)
      await updateClient(client.id, { archivedAt: null })
    }
    setBusy(false)
    await onChanged()
    onClose()
  }

  return (
    <div>
      {/* Header */}
      <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
        <div className="min-w-0">
          <div className="font-bold text-slate-900 truncate">{client.name}</div>
          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
            {typeLabelFor({ type, typeCustom })}
            {client.archivedAt && <span className="ml-2 text-slate-500">· Archived</span>}
          </div>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="Close">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Edit form */}
      <div className="px-4 py-4 space-y-3 border-b border-slate-100">
        <div>
          <label className={labelCls}>Name</label>
          <input value={name} onChange={e => setName(e.target.value)} className={`${inputCls} w-full`} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Type</label>
            <select value={type} onChange={e => setType(e.target.value as ClientType)} className={`${inputCls} w-full`}>
              {SELECTABLE_CLIENT_TYPES.map(t => (
                <option key={t} value={t}>{CLIENT_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>
          {type === 'other' && (
            <div>
              <label className={labelCls}>Custom type label</label>
              <input value={typeCustom} onChange={e => setTypeCustom(e.target.value)} placeholder="Dealer group" className={`${inputCls} w-full`} />
            </div>
          )}
        </div>
        <div>
          <label className={labelCls}>Address</label>
          <input value={addressLine} onChange={e => setAddressLine(e.target.value)} className={`${inputCls} w-full`} />
        </div>
        <div className="grid grid-cols-[1fr_80px_90px] gap-3">
          <div>
            <label className={labelCls}>City</label>
            <input value={city} onChange={e => setCity(e.target.value)} className={`${inputCls} w-full`} />
          </div>
          <div>
            <label className={labelCls}>State</label>
            <input value={state} onChange={e => setState(e.target.value.toUpperCase())} maxLength={2} className={`${inputCls} w-full uppercase`} />
          </div>
          <div>
            <label className={labelCls}>Zip</label>
            <input value={zip} onChange={e => setZip(e.target.value)} maxLength={10} className={`${inputCls} w-full tabular-nums`} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Phone</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} className={`${inputCls} w-full`} />
          </div>
          <div>
            <label className={labelCls}>Email</label>
            <input value={email} onChange={e => setEmail(e.target.value)} className={`${inputCls} w-full`} />
          </div>
        </div>
        <div>
          <label className={labelCls}>Website</label>
          <input value={website} onChange={e => setWebsite(e.target.value)} className={`${inputCls} w-full`} />
        </div>
        <div>
          <label className={labelCls}>Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className={`${inputCls} w-full resize-y`} />
        </div>

        <div className="flex items-center gap-2 pt-1">
          <Button
            onClick={save}
            disabled={!dirty || busy}
            className="bg-blue-600 hover:bg-blue-500 text-white font-bold"
          >
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save Changes
          </Button>
          <Button onClick={toggleArchive} variant="outline" disabled={busy} className="text-slate-700">
            {client.archivedAt ? 'Unarchive' : 'Archive'}
          </Button>
        </div>
      </div>

      {/* Contacts */}
      <ContactsSection
        clientId={client.id}
        contacts={contacts}
        loading={contactsLoading}
        reload={reloadContacts}
      />
    </div>
  )
}

// ─── Contacts sub-section ─────────────────────────────────────────────────────

function ContactsSection({
  clientId,
  contacts,
  loading,
  reload,
}: {
  clientId: string
  contacts: ClientContact[]
  loading: boolean
  reload: () => Promise<void>
}) {
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  return (
    <div className="px-4 py-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            People at this client ({contacts.length})
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            The company is the client; add every person who sends you work here.
          </div>
        </div>
        <Button
          onClick={() => { setAdding(true); setEditingId(null) }}
          disabled={adding}
          size="sm"
          variant="outline"
          className="text-slate-700"
        >
          <UserPlus className="w-3.5 h-3.5 mr-1" />
          Add Person
        </Button>
      </div>

      {loading && (
        <div className="text-sm text-slate-400 italic flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
        </div>
      )}

      {!loading && contacts.length === 0 && !adding && (
        <div className="text-sm text-slate-400 italic p-3 rounded border border-dashed border-slate-200 bg-slate-50">
          No people yet.
        </div>
      )}

      <ul className="space-y-2">
        {contacts.map(c => (
          <li key={c.id}>
            {editingId === c.id ? (
              <ContactEditor
                initial={c}
                clientId={clientId}
                onDone={async () => { setEditingId(null); await reload() }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <ContactRow
                contact={c}
                onEdit={() => { setEditingId(c.id); setAdding(false) }}
                onDeleted={reload}
                onPrimaryChanged={reload}
              />
            )}
          </li>
        ))}
      </ul>

      {adding && (
        <div className="mt-2">
          <ContactEditor
            clientId={clientId}
            onDone={async () => { setAdding(false); await reload() }}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}
    </div>
  )
}

function ContactRow({
  contact,
  onEdit,
  onDeleted,
  onPrimaryChanged,
}: {
  contact: ClientContact
  onEdit: () => void
  onDeleted: () => Promise<void>
  onPrimaryChanged: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)

  const togglePrimary = async () => {
    setBusy(true)
    await updateContact(contact.id, { isPrimary: !contact.isPrimary })
    setBusy(false)
    await onPrimaryChanged()
  }

  const remove = async () => {
    if (!(await confirmDialog({
      title: 'Remove this person?',
      message: `Remove ${contact.name} from this client?`,
      confirmLabel: 'Remove',
      variant: 'danger',
    }))) return
    setBusy(true)
    await deleteContact(contact.id)
    setBusy(false)
    await onDeleted()
  }

  return (
    <div className="border border-slate-200 rounded-lg bg-white px-3 py-2 flex items-start gap-3">
      <button
        onClick={togglePrimary}
        disabled={busy}
        title={contact.isPrimary ? 'Primary contact — click to unmark' : 'Mark as primary contact'}
        className={`shrink-0 mt-1 ${contact.isPrimary ? 'text-amber-500 hover:text-amber-600' : 'text-slate-300 hover:text-amber-400'}`}
      >
        {contact.isPrimary ? <Star className="w-4 h-4 fill-current" /> : <StarOff className="w-4 h-4" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-slate-900 text-sm">{contact.name}</div>
        {contact.title && <div className="text-xs text-slate-500">{contact.title}</div>}
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-600 mt-1">
          {contact.phone && <span>{contact.phone}</span>}
          {contact.email && <span className="truncate">{contact.email}</span>}
        </div>
        {contact.notes && <div className="text-[11px] text-slate-500 mt-1 whitespace-pre-wrap">{contact.notes}</div>}
      </div>
      <div className="shrink-0 flex items-center gap-1">
        <button
          onClick={onEdit}
          disabled={busy}
          className="text-xs text-slate-500 hover:text-blue-600 px-1.5 py-1"
        >
          Edit
        </button>
        <button
          onClick={remove}
          disabled={busy}
          className="text-slate-400 hover:text-red-600 p-1"
          title="Remove"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

function ContactEditor({
  initial,
  clientId,
  onDone,
  onCancel,
}: {
  initial?: ClientContact
  clientId: string
  onDone: () => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [email, setEmail] = useState(initial?.email ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [isPrimary, setIsPrimary] = useState(initial?.isPrimary ?? false)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!name.trim()) return
    setBusy(true)
    if (initial) {
      await updateContact(initial.id, { name, title: title || null, phone: phone || null, email: email || null, notes: notes || null, isPrimary })
    } else {
      const payload: NewContactInput = { clientId, name, title: title || null, phone: phone || null, email: email || null, notes: notes || null, isPrimary }
      await createContact(payload)
    }
    setBusy(false)
    await onDone()
  }

  return (
    <div className="border border-blue-300 bg-blue-50/40 rounded-lg p-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>Name</label>
          <input value={name} onChange={e => setName(e.target.value)} className={`${inputCls} w-full`} autoFocus />
        </div>
        <div>
          <label className={labelCls}>Title</label>
          <input value={title} onChange={e => setTitle(e.target.value)} className={`${inputCls} w-full`} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>Phone</label>
          <input value={phone} onChange={e => setPhone(e.target.value)} className={`${inputCls} w-full`} />
        </div>
        <div>
          <label className={labelCls}>Email</label>
          <input value={email} onChange={e => setEmail(e.target.value)} className={`${inputCls} w-full`} />
        </div>
      </div>
      <div>
        <label className={labelCls}>Notes</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className={`${inputCls} w-full resize-y`} />
      </div>
      <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
        <input type="checkbox" checked={isPrimary} onChange={e => setIsPrimary(e.target.checked)} className="rounded border-slate-300" />
        Primary contact
      </label>
      <div className="flex justify-end gap-2 pt-1">
        <Button onClick={onCancel} variant="outline" size="sm" disabled={busy}>Cancel</Button>
        <Button
          onClick={save}
          disabled={busy || !name.trim()}
          size="sm"
          className="bg-blue-600 hover:bg-blue-500 text-white font-bold"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}
          {initial ? 'Save' : 'Add'}
        </Button>
      </div>
    </div>
  )
}
