"use client"

import { useEffect, useState } from 'react'
import { Plus, Archive, Undo2, Trash2, Save, X } from 'lucide-react'
import { fetchFeeCatalog, type FeeCatalogEntry } from '@/lib/supabase/fee-catalog'

interface Draft {
  id: string | null   // null = new
  code: string
  label: string
  unit: 'flat' | 'per_mile'
  sortOrder: number
}

const emptyDraft = (nextSort: number): Draft => ({
  id: null, code: '', label: '', unit: 'flat', sortOrder: nextSort,
})

export function FeeCatalogClient() {
  const [rows, setRows] = useState<FeeCatalogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [showArchived, setShowArchived] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setRows(await fetchFeeCatalog({ includeArchived: showArchived }))
    setLoading(false)
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-load pattern
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchived])

  const startAdd = () => {
    const nextSort = rows.length === 0 ? 1 : Math.max(...rows.map(r => r.sortOrder)) + 1
    setDraft(emptyDraft(nextSort))
    setError(null)
  }

  const save = async () => {
    if (!draft) return
    if (!draft.code || !draft.label) { setError('Code and label required.'); return }
    setBusy(true); setError(null)
    const body = { code: draft.code, label: draft.label, unit: draft.unit, sortOrder: draft.sortOrder }
    const url = draft.id === null ? '/api/admin/fee-catalog' : `/api/admin/fee-catalog/${draft.id}`
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

  const archive = async (id: string, next: boolean) => {
    setBusy(true); setError(null)
    const res = await fetch(`/api/admin/fee-catalog/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: next }),
    })
    setBusy(false)
    if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.error ?? 'Save failed'); return }
    load()
  }

  const remove = async (id: string) => {
    if (!confirm('Delete this fee type? If any appraiser has an amount for it, deletion will be refused (archive it instead).')) return
    setBusy(true); setError(null)
    const res = await fetch(`/api/admin/fee-catalog/${id}`, { method: 'DELETE' })
    setBusy(false)
    if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.error ?? 'Delete failed'); return }
    load()
  }

  if (loading) return <div className="text-sm text-gray-500">Loading fee catalog…</div>

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <label className="text-sm text-gray-600 inline-flex items-center gap-2">
          <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />
          Show archived
        </label>
        <button
          onClick={startAdd}
          disabled={draft !== null}
          className="inline-flex items-center gap-1 bg-blue-600 text-white text-sm font-medium px-3 py-1.5 rounded disabled:opacity-50 hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" /> Add Fee Type
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-16">#</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Label</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-48">Code</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">Unit</th>
              <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-32">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const isEditing = draft?.id === row.id
              return (
                <tr key={row.id} className={`border-b border-gray-100 ${row.archived ? 'opacity-50' : ''} ${isEditing ? 'bg-blue-50/40' : ''}`}>
                  {isEditing && draft ? (
                    <>
                      <td className="px-3 py-2"><input type="number" value={draft.sortOrder} onChange={e => setDraft({ ...draft, sortOrder: parseInt(e.target.value || '0', 10) })} className={inputCls + ' w-12'} /></td>
                      <td className="px-3 py-2"><input value={draft.label} onChange={e => setDraft({ ...draft, label: e.target.value })} className={inputCls} /></td>
                      <td className="px-3 py-2 text-xs text-gray-400">{row.code} (immutable)</td>
                      <td className="px-3 py-2">
                        <select value={draft.unit} onChange={e => setDraft({ ...draft, unit: e.target.value as 'flat' | 'per_mile' })} className={inputCls}>
                          <option value="flat">flat ($)</option>
                          <option value="per_mile">per mile</option>
                        </select>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex gap-2">
                          <button onClick={save} disabled={busy} className="text-emerald-600 hover:text-emerald-700 disabled:opacity-40" title="Save"><Save className="w-4 h-4" /></button>
                          <button onClick={() => setDraft(null)} disabled={busy} className="text-gray-400 hover:text-gray-600 disabled:opacity-40" title="Cancel"><X className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2 text-gray-500 text-xs">{row.sortOrder}</td>
                      <td className="px-3 py-2 text-gray-800">{row.label}</td>
                      <td className="px-3 py-2 font-mono text-xs text-gray-500">{row.code}</td>
                      <td className="px-3 py-2 text-xs text-gray-500">{row.unit === 'per_mile' ? 'per mile' : 'flat'}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex gap-2">
                          <button onClick={() => setDraft({ id: row.id, code: row.code, label: row.label, unit: row.unit, sortOrder: row.sortOrder })} disabled={draft !== null || busy} className="text-gray-400 hover:text-blue-600 disabled:opacity-40" title="Edit">Edit</button>
                          <button onClick={() => archive(row.id, !row.archived)} disabled={busy} className="text-gray-400 hover:text-amber-600 disabled:opacity-40" title={row.archived ? 'Unarchive' : 'Archive'}>
                            {row.archived ? <Undo2 className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                          </button>
                          <button onClick={() => remove(row.id)} disabled={busy} className="text-gray-400 hover:text-red-600 disabled:opacity-40" title="Delete"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              )
            })}
            {draft && draft.id === null && (
              <tr className="bg-blue-50/40 border-b border-gray-100">
                <td className="px-3 py-2"><input type="number" value={draft.sortOrder} onChange={e => setDraft({ ...draft, sortOrder: parseInt(e.target.value || '0', 10) })} className={inputCls + ' w-12'} /></td>
                <td className="px-3 py-2"><input value={draft.label} onChange={e => setDraft({ ...draft, label: e.target.value })} placeholder="Label" className={inputCls} /></td>
                <td className="px-3 py-2"><input value={draft.code} onChange={e => setDraft({ ...draft, code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })} placeholder="code_snake_case" className={inputCls} /></td>
                <td className="px-3 py-2">
                  <select value={draft.unit} onChange={e => setDraft({ ...draft, unit: e.target.value as 'flat' | 'per_mile' })} className={inputCls}>
                    <option value="flat">flat ($)</option>
                    <option value="per_mile">per mile</option>
                  </select>
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="inline-flex gap-2">
                    <button onClick={save} disabled={busy} className="text-emerald-600 hover:text-emerald-700 disabled:opacity-40" title="Save"><Save className="w-4 h-4" /></button>
                    <button onClick={() => setDraft(null)} disabled={busy} className="text-gray-400 hover:text-gray-600 disabled:opacity-40" title="Cancel"><X className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {error && <div className="p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
    </div>
  )
}

const inputCls = 'bg-white border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
