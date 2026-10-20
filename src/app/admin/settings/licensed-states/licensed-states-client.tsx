"use client"

import { useEffect, useState } from 'react'
import { Plus, Trash2, Save, X } from 'lucide-react'
import { fetchLicensedStates, type LicensedState } from '@/lib/supabase/licensed-states'
import { US_STATES } from '@/lib/us-states'
import { confirmDialog } from '@/components/ui/dialog-service'

interface Draft {
  state: string
  required: boolean
  forbidden: boolean
  notes: string
}

const emptyDraft = (): Draft => ({ state: '', required: true, forbidden: false, notes: '' })

export function LicensedStatesClient() {
  const [rows, setRows] = useState<LicensedState[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState<Draft | null>(null)
  // Which row is being inline-edited (state code as key)
  const [editingState, setEditingState] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<{ required: boolean; forbidden: boolean; notes: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setRows(await fetchLicensedStates())
    setLoading(false)
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-load pattern
    void load()
  }, [])

  const startEdit = (row: LicensedState) => {
    setEditingState(row.state)
    setEditDraft({ required: row.required, forbidden: row.forbidden, notes: row.notes ?? '' })
    setError(null)
  }

  const cancelEdit = () => {
    setEditingState(null)
    setEditDraft(null)
  }

  const saveEdit = async () => {
    if (!editingState || !editDraft) return
    setBusy(true); setError(null)
    const res = await fetch(`/api/admin/licensed-states/${editingState}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ required: editDraft.required, forbidden: editDraft.forbidden, notes: editDraft.notes || null }),
    })
    setBusy(false)
    if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.error ?? 'Save failed'); return }
    setEditingState(null)
    setEditDraft(null)
    load()
  }

  const remove = async (state: string) => {
    if (!(await confirmDialog({ title: 'Remove licensed state?', message: `Remove ${state} from the licensed states list?`, confirmLabel: 'Remove', variant: 'danger' }))) return
    setBusy(true); setError(null)
    const res = await fetch(`/api/admin/licensed-states/${state}`, { method: 'DELETE' })
    setBusy(false)
    if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.error ?? 'Delete failed'); return }
    load()
  }

  const add = async () => {
    if (!draft) return
    if (!draft.state || draft.state.length !== 2) {
      setError('Select a state.')
      return
    }
    if (rows.some(r => r.state === draft.state)) {
      setError(`${draft.state} is already in the list.`)
      return
    }
    setBusy(true); setError(null)
    const res = await fetch('/api/admin/licensed-states', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: draft.state, required: draft.required, forbidden: draft.forbidden, notes: draft.notes || null }),
    })
    setBusy(false)
    if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.error ?? 'Add failed'); return }
    setDraft(null)
    load()
  }

  const existingStateCodes = new Set(rows.map(r => r.state))
  const availableStates = US_STATES.filter(s => !existingStateCodes.has(s.code))

  if (loading) return <div className="text-sm text-gray-500">Loading…</div>

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex justify-end">
        <button
          onClick={() => { setDraft(emptyDraft()); setError(null) }}
          disabled={draft !== null}
          className="inline-flex items-center gap-1 bg-blue-600 text-white text-sm font-medium px-3 py-1.5 rounded disabled:opacity-50 hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" /> Add State
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-20">State</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">Required</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-32">Forbidden</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Notes</th>
              <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const isEditing = editingState === row.state
              return (
                <tr key={row.state} className={`border-b border-gray-100 ${isEditing ? 'bg-blue-50/40' : ''}`}>
                  {isEditing && editDraft ? (
                    <>
                      <td className="px-3 py-2 font-mono text-xs font-bold">{row.state}</td>
                      <td className="px-3 py-2">
                        <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editDraft.required}
                            onChange={e => setEditDraft({ ...editDraft, required: e.target.checked })}
                            className="w-4 h-4 rounded border-gray-300 text-blue-600"
                          />
                          Required
                        </label>
                      </td>
                      <td className="px-3 py-2">
                        <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editDraft.forbidden}
                            onChange={e => setEditDraft({ ...editDraft, forbidden: e.target.checked })}
                            className="w-4 h-4 rounded border-gray-300 text-red-600"
                          />
                          Forbidden
                        </label>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={editDraft.notes}
                          onChange={e => setEditDraft({ ...editDraft, notes: e.target.value })}
                          placeholder="Optional notes"
                          className={inputCls + ' w-full'}
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex gap-2">
                          <button onClick={saveEdit} disabled={busy} className="text-emerald-600 hover:text-emerald-700 disabled:opacity-40" title="Save"><Save className="w-4 h-4" /></button>
                          <button onClick={cancelEdit} disabled={busy} className="text-gray-400 hover:text-gray-600 disabled:opacity-40" title="Cancel"><X className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className={`px-3 py-2 font-mono text-xs font-bold ${row.forbidden ? 'text-red-700' : ''}`}>{row.state}</td>
                      <td className="px-3 py-2">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${row.required ? 'text-blue-700 bg-blue-50 border-blue-200' : 'text-gray-500 bg-gray-50 border-gray-200'}`}>
                          {row.required ? 'Required' : 'Not required'}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {row.forbidden ? (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full border text-red-700 bg-red-50 border-red-200">
                            FORBIDDEN
                          </span>
                        ) : <span className="text-xs text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2 text-gray-500 text-xs">{row.notes || '—'}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex gap-2">
                          <button onClick={() => startEdit(row)} disabled={editingState !== null || busy} className="text-gray-400 hover:text-blue-600 disabled:opacity-40 text-xs" title="Edit">Edit</button>
                          <button onClick={() => remove(row.state)} disabled={editingState !== null || busy} className="text-gray-400 hover:text-red-600 disabled:opacity-40" title="Delete"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              )
            })}
            {draft && (
              <tr className="bg-blue-50/40 border-b border-gray-100">
                <td className="px-3 py-2">
                  <select
                    value={draft.state}
                    onChange={e => setDraft({ ...draft, state: e.target.value })}
                    className={inputCls + ' w-20'}
                  >
                    <option value="">ST</option>
                    {availableStates.map(s => (
                      <option key={s.code} value={s.code}>{s.code}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draft.required}
                      onChange={e => setDraft({ ...draft, required: e.target.checked })}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600"
                    />
                    Required
                  </label>
                </td>
                <td className="px-3 py-2">
                  <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draft.forbidden}
                      onChange={e => setDraft({ ...draft, forbidden: e.target.checked })}
                      className="w-4 h-4 rounded border-gray-300 text-red-600"
                    />
                    Forbidden
                  </label>
                </td>
                <td className="px-3 py-2">
                  <input
                    value={draft.notes}
                    onChange={e => setDraft({ ...draft, notes: e.target.value })}
                    placeholder="Optional notes"
                    className={inputCls + ' w-full'}
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="inline-flex gap-2">
                    <button onClick={add} disabled={busy} className="text-emerald-600 hover:text-emerald-700 disabled:opacity-40" title="Save"><Save className="w-4 h-4" /></button>
                    <button onClick={() => setDraft(null)} disabled={busy} className="text-gray-400 hover:text-gray-600 disabled:opacity-40" title="Cancel"><X className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            )}
            {rows.length === 0 && !draft && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-sm text-gray-400 italic">No licensed states configured. Click &quot;Add State&quot; to require licensing for a state.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {error && <div className="p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
    </div>
  )
}

const inputCls = 'bg-white border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
