"use client"

import { useEffect, useState } from 'react'
import { Plus, Archive, Undo2, Trash2, Save, X } from 'lucide-react'
import { fetchStatusPhaseConfigs, phaseColorClasses, type StatusPhaseConfig } from '@/lib/supabase/status-phase-configs'

const COLORS = ['green', 'red', 'amber', 'blue', 'gray'] as const
type Color = typeof COLORS[number]

interface Draft {
  code: string | null  // null = new
  label: string
  color: Color
  sortOrder: number
}

const emptyDraft = (nextSort: number): Draft => ({
  code: null, label: '', color: 'gray', sortOrder: nextSort,
})

const inputCls = 'bg-white border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export function StatusPhasesClient() {
  const [rows, setRows] = useState<StatusPhaseConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [showArchived, setShowArchived] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setRows(await fetchStatusPhaseConfigs({ includeArchived: showArchived }))
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
    if (!draft.label) { setError('Label is required.'); return }
    if (draft.code === null && !draft.label) { setError('Label and code are required.'); return }
    setBusy(true); setError(null)

    if (draft.code === null) {
      // Create — code is auto-slugified from label if not provided
      const slugCode = draft.label.toLowerCase().replace(/[^a-z0-9_]/g, '_')
      const res = await fetch('/api/admin/status-phase-configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: slugCode, label: draft.label, color: draft.color, sortOrder: draft.sortOrder }),
      })
      setBusy(false)
      if (!res.ok) { const b = await res.json().catch(() => ({})); setError((b as { error?: string }).error ?? 'Save failed'); return }
    } else {
      // Update existing
      const res = await fetch(`/api/admin/status-phase-configs/${draft.code}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: draft.label, color: draft.color, sortOrder: draft.sortOrder }),
      })
      setBusy(false)
      if (!res.ok) { const b = await res.json().catch(() => ({})); setError((b as { error?: string }).error ?? 'Save failed'); return }
    }

    setDraft(null)
    void load()
  }

  const archive = async (code: string, next: boolean) => {
    setBusy(true); setError(null)
    const res = await fetch(`/api/admin/status-phase-configs/${code}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: next }),
    })
    setBusy(false)
    if (!res.ok) { const b = await res.json().catch(() => ({})); setError((b as { error?: string }).error ?? 'Save failed'); return }
    void load()
  }

  const remove = async (code: string) => {
    if (!confirm('Delete this phase? If any claim references it, deletion will be refused (archive it instead).')) return
    setBusy(true); setError(null)
    const res = await fetch(`/api/admin/status-phase-configs/${code}`, { method: 'DELETE' })
    setBusy(false)
    if (!res.ok) { const b = await res.json().catch(() => ({})); setError((b as { error?: string }).error ?? 'Delete failed'); return }
    void load()
  }

  if (loading) return <div className="text-sm text-gray-500">Loading status phases…</div>

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <label className="text-sm text-gray-600 inline-flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />
          Show archived
        </label>
        <button
          onClick={startAdd}
          disabled={draft !== null}
          className="inline-flex items-center gap-1 bg-blue-600 text-white text-sm font-medium px-3 py-1.5 rounded disabled:opacity-50 hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" /> Add Phase
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-16">#</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Label</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-48">Code</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-44">Color</th>
              <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-32">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const isEditing = draft?.code === row.code
              return (
                <tr key={row.code} className={`border-b border-gray-100 ${row.archived ? 'opacity-50' : ''} ${isEditing ? 'bg-blue-50/40' : ''}`}>
                  {isEditing && draft ? (
                    <>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          value={draft.sortOrder}
                          onChange={e => setDraft({ ...draft, sortOrder: parseInt(e.target.value || '0', 10) })}
                          className={inputCls + ' w-12'}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={draft.label}
                          onChange={e => setDraft({ ...draft, label: e.target.value })}
                          className={inputCls}
                        />
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-400 font-mono">{row.code} (immutable)</td>
                      <td className="px-3 py-2">
                        <select
                          value={draft.color}
                          onChange={e => setDraft({ ...draft, color: e.target.value as Color })}
                          className={inputCls}
                        >
                          {COLORS.map(c => (
                            <option key={c} value={c}>{c}</option>
                          ))}
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
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full border ${phaseColorClasses(row.color)}`}>
                          <span className={`w-2 h-2 rounded-full border ${phaseColorClasses(row.color)}`} aria-hidden />
                          {row.color}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex gap-2">
                          <button
                            onClick={() => setDraft({ code: row.code, label: row.label, color: row.color as Color, sortOrder: row.sortOrder })}
                            disabled={draft !== null || busy}
                            className="text-gray-400 hover:text-blue-600 disabled:opacity-40 text-xs"
                            title="Edit"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => archive(row.code, !row.archived)}
                            disabled={busy}
                            className="text-gray-400 hover:text-amber-600 disabled:opacity-40"
                            title={row.archived ? 'Unarchive' : 'Archive'}
                          >
                            {row.archived ? <Undo2 className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                          </button>
                          <button
                            onClick={() => remove(row.code)}
                            disabled={busy}
                            className="text-gray-400 hover:text-red-600 disabled:opacity-40"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              )
            })}
            {draft && draft.code === null && (
              <tr className="bg-blue-50/40 border-b border-gray-100">
                <td className="px-3 py-2">
                  <input
                    type="number"
                    value={draft.sortOrder}
                    onChange={e => setDraft({ ...draft, sortOrder: parseInt(e.target.value || '0', 10) })}
                    className={inputCls + ' w-12'}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    value={draft.label}
                    onChange={e => setDraft({ ...draft, label: e.target.value })}
                    placeholder="Label"
                    className={inputCls}
                  />
                </td>
                <td className="px-3 py-2 text-xs text-gray-400 italic">auto from label</td>
                <td className="px-3 py-2">
                  <select
                    value={draft.color}
                    onChange={e => setDraft({ ...draft, color: e.target.value as Color })}
                    className={inputCls}
                  >
                    {COLORS.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
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
