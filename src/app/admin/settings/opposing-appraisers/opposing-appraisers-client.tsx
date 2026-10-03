'use client'

import { useEffect, useState } from 'react'
import { Plus, Archive, Undo2, Save, X } from 'lucide-react'
import type { OpposingAppraiser } from '@/lib/supabase/opposing-appraisers'

interface Draft {
  id: string | null   // null = new
  name: string
  company: string
  phone: string
  email: string
  notes: string
}

const emptyDraft = (): Draft => ({ id: null, name: '', company: '', phone: '', email: '', notes: '' })

export function OpposingAppraisersClient() {
  const [rows, setRows] = useState<OpposingAppraiser[]>([])
  const [loading, setLoading] = useState(true)
  const [showArchived, setShowArchived] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    const url = showArchived
      ? '/api/admin/opposing-appraisers?includeArchived=1'
      : '/api/admin/opposing-appraisers'
    try {
      const res = await fetch(url)
      const json = await res.json()
      setRows(json.opposingAppraisers ?? [])
    } catch {
      setRows([])
    }
    setLoading(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-load pattern
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchived])

  const startAdd = () => {
    setDraft(emptyDraft())
    setError(null)
  }

  const save = async () => {
    if (!draft) return
    if (!draft.name.trim()) { setError('Name is required.'); return }
    setBusy(true); setError(null)
    const body = {
      name: draft.name.trim(),
      company: draft.company.trim() || null,
      phone: draft.phone.trim() || null,
      email: draft.email.trim() || null,
      notes: draft.notes.trim() || null,
    }
    const url = draft.id === null
      ? '/api/admin/opposing-appraisers'
      : `/api/admin/opposing-appraisers/${draft.id}`
    const method = draft.id === null ? 'POST' : 'PATCH'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setBusy(false)
    if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.error ?? 'Save failed'); return }
    setDraft(null)
    load()
  }

  const archive = async (id: string, isArchived: boolean) => {
    if (isArchived) {
      // Unarchive: PATCH archived_at back to null via name-only no-op PATCH won't work;
      // we need to send archived_at explicitly. For simplicity we call a dedicated
      // unarchive PATCH with a sentinel — the API doesn't support unarchive in v1,
      // so we surface a message instead.
      setError('To unarchive, contact a super-admin or run a DB query directly.')
      return
    }
    if (!confirm('Archive this opposing appraiser? They will no longer appear in the claim picker.')) return
    setBusy(true); setError(null)
    const res = await fetch(`/api/admin/opposing-appraisers/${id}`, { method: 'DELETE' })
    setBusy(false)
    if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.error ?? 'Archive failed'); return }
    load()
  }

  const startEdit = (row: OpposingAppraiser) => {
    setDraft({
      id: row.id,
      name: row.name,
      company: row.company ?? '',
      phone: row.phone ?? '',
      email: row.email ?? '',
      notes: row.notes ?? '',
    })
    setError(null)
  }

  const visible = showArchived ? rows : rows.filter(r => !r.archivedAt)

  if (loading) return <div className="text-sm text-gray-500">Loading opposing appraisers…</div>

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <label className="text-sm text-gray-600 inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={e => setShowArchived(e.target.checked)}
          />
          Show archived
        </label>
        <button
          onClick={startAdd}
          disabled={draft !== null}
          className="inline-flex items-center gap-1 bg-blue-600 text-white text-sm font-medium px-3 py-1.5 rounded disabled:opacity-50 hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" /> Add Opposing Appraiser
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Company</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-36">Phone</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-44">Email</th>
              <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(row => {
              const isEditing = draft?.id === row.id
              return (
                <tr
                  key={row.id}
                  className={`border-b border-gray-100 ${row.archivedAt ? 'opacity-50' : ''} ${isEditing ? 'bg-blue-50/40' : ''}`}
                >
                  {isEditing && draft ? (
                    <>
                      <td className="px-3 py-2"><input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} className={inputCls} placeholder="First Last" /></td>
                      <td className="px-3 py-2"><input value={draft.company} onChange={e => setDraft({ ...draft, company: e.target.value })} className={inputCls} placeholder="Firm name" /></td>
                      <td className="px-3 py-2"><input value={draft.phone} onChange={e => setDraft({ ...draft, phone: e.target.value })} className={inputCls} placeholder="555-555-5555" /></td>
                      <td className="px-3 py-2"><input value={draft.email} onChange={e => setDraft({ ...draft, email: e.target.value })} className={inputCls} placeholder="name@firm.com" type="email" /></td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex gap-2">
                          <button onClick={save} disabled={busy} className="text-emerald-600 hover:text-emerald-700 disabled:opacity-40" title="Save"><Save className="w-4 h-4" /></button>
                          <button onClick={() => setDraft(null)} disabled={busy} className="text-gray-400 hover:text-gray-600 disabled:opacity-40" title="Cancel"><X className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2 text-gray-800 font-medium">{row.name}</td>
                      <td className="px-3 py-2 text-gray-600">{row.company ?? <span className="text-gray-400 italic">—</span>}</td>
                      <td className="px-3 py-2 text-gray-600 text-xs">{row.phone ?? <span className="text-gray-400">—</span>}</td>
                      <td className="px-3 py-2 text-gray-600 text-xs truncate max-w-0">{row.email ?? <span className="text-gray-400">—</span>}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex gap-2">
                          <button
                            onClick={() => startEdit(row)}
                            disabled={draft !== null || busy}
                            className="text-gray-400 hover:text-blue-600 disabled:opacity-40 text-xs"
                            title="Edit"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => archive(row.id, !!row.archivedAt)}
                            disabled={busy}
                            className="text-gray-400 hover:text-amber-600 disabled:opacity-40"
                            title={row.archivedAt ? 'Archived' : 'Archive'}
                          >
                            {row.archivedAt ? <Undo2 className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              )
            })}

            {draft && draft.id === null && (
              <tr className="bg-blue-50/40 border-b border-gray-100">
                <td className="px-3 py-2"><input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="First Last" className={inputCls} /></td>
                <td className="px-3 py-2"><input value={draft.company} onChange={e => setDraft({ ...draft, company: e.target.value })} placeholder="Firm name" className={inputCls} /></td>
                <td className="px-3 py-2"><input value={draft.phone} onChange={e => setDraft({ ...draft, phone: e.target.value })} placeholder="555-555-5555" className={inputCls} /></td>
                <td className="px-3 py-2"><input value={draft.email} onChange={e => setDraft({ ...draft, email: e.target.value })} placeholder="name@firm.com" type="email" className={inputCls} /></td>
                <td className="px-3 py-2 text-right">
                  <div className="inline-flex gap-2">
                    <button onClick={save} disabled={busy} className="text-emerald-600 hover:text-emerald-700 disabled:opacity-40" title="Save"><Save className="w-4 h-4" /></button>
                    <button onClick={() => setDraft(null)} disabled={busy} className="text-gray-400 hover:text-gray-600 disabled:opacity-40" title="Cancel"><X className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            )}

            {visible.length === 0 && !draft && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-sm text-gray-400">
                  No opposing appraisers yet. Add one above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {error && (
        <div className="p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
      )}
    </div>
  )
}

const inputCls = 'bg-white border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full'
