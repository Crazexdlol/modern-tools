"use client"

import { useEffect, useState } from 'react'
import { Plus, Trash2, Save, X } from 'lucide-react'
import { fetchUserLicenses, getLicenseAlertLevel, type AppraiserLicense, type LicenseAlertLevel } from '@/lib/supabase/appraiser-licenses'

interface Draft {
  id: string | null   // null = new
  state: string
  licenseNumber: string
  expirationDate: string
  notes: string
}

const emptyDraft = (): Draft => ({ id: null, state: '', licenseNumber: '', expirationDate: '', notes: '' })

export function LicensesTab({ userId }: { userId: string }) {
  const [rows, setRows] = useState<AppraiserLicense[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setRows(await fetchUserLicenses(userId))
    setLoading(false)
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-load pattern
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const startEdit = (row: AppraiserLicense) => {
    setDraft({
      id: row.id,
      state: row.state,
      licenseNumber: row.licenseNumber,
      expirationDate: row.expirationDate,
      notes: row.notes ?? '',
    })
    setError(null)
  }

  const startAdd = () => {
    setDraft(emptyDraft())
    setError(null)
  }

  const cancel = () => setDraft(null)

  const save = async () => {
    if (!draft) return
    if (!draft.state || !draft.licenseNumber || !draft.expirationDate) {
      setError('State, license number, and expiration date are required.')
      return
    }
    setBusy(true); setError(null)
    const body = {
      userId,
      state: draft.state,
      licenseNumber: draft.licenseNumber,
      expirationDate: draft.expirationDate,
      notes: draft.notes || null,
    }
    let res: Response
    if (draft.id === null) {
      res = await fetch('/api/admin/appraiser-licenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    } else {
      res = await fetch(`/api/admin/appraiser-licenses/${draft.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    }
    setBusy(false)
    if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.error ?? 'Save failed'); return }
    setDraft(null)
    load()
  }

  const remove = async (id: string) => {
    if (!confirm('Delete this license?')) return
    setBusy(true); setError(null)
    const res = await fetch(`/api/admin/appraiser-licenses/${id}`, { method: 'DELETE' })
    setBusy(false)
    if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.error ?? 'Delete failed'); return }
    load()
  }

  if (loading) return <div className="text-sm text-gray-500">Loading licenses…</div>

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex justify-end">
        <button
          onClick={startAdd}
          disabled={draft !== null}
          className="inline-flex items-center gap-1 bg-blue-600 text-white text-sm font-medium px-3 py-1.5 rounded disabled:opacity-50 hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" /> Add License
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-20">State</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">License #</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-40">Expires</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-32">Status</th>
              <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-24">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const isEditing = draft?.id === row.id
              const level = getLicenseAlertLevel(row.expirationDate)
              return (
                <tr key={row.id} className={`border-b border-gray-100 ${isEditing ? 'bg-blue-50/40' : ''}`}>
                  {isEditing && draft ? (
                    <>
                      <td className="px-3 py-2"><input value={draft.state} onChange={e => setDraft({ ...draft, state: e.target.value.toUpperCase() })} maxLength={2} className={inputCls + ' w-16'} /></td>
                      <td className="px-3 py-2"><input value={draft.licenseNumber} onChange={e => setDraft({ ...draft, licenseNumber: e.target.value })} className={inputCls} /></td>
                      <td className="px-3 py-2"><input type="date" value={draft.expirationDate} onChange={e => setDraft({ ...draft, expirationDate: e.target.value })} className={inputCls} /></td>
                      <td className="px-3 py-2 text-xs text-gray-400">—</td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex gap-2">
                          <button onClick={save} disabled={busy} className="text-emerald-600 hover:text-emerald-700 disabled:opacity-40" title="Save"><Save className="w-4 h-4" /></button>
                          <button onClick={cancel} disabled={busy} className="text-gray-400 hover:text-gray-600 disabled:opacity-40" title="Cancel"><X className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2 font-mono text-xs">{row.state}</td>
                      <td className="px-3 py-2 font-mono text-xs">{row.licenseNumber}</td>
                      <td className="px-3 py-2">{row.expirationDate}</td>
                      <td className="px-3 py-2"><LevelBadge level={level} expiration={row.expirationDate} /></td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex gap-2">
                          <button onClick={() => startEdit(row)} disabled={draft !== null || busy} className="text-gray-400 hover:text-blue-600 disabled:opacity-40" title="Edit">Edit</button>
                          <button onClick={() => remove(row.id)} disabled={draft !== null || busy} className="text-gray-400 hover:text-red-600 disabled:opacity-40" title="Delete"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              )
            })}
            {draft && draft.id === null && (
              <tr className="bg-blue-50/40 border-b border-gray-100">
                <td className="px-3 py-2"><input value={draft.state} onChange={e => setDraft({ ...draft, state: e.target.value.toUpperCase() })} maxLength={2} placeholder="FL" className={inputCls + ' w-16'} /></td>
                <td className="px-3 py-2"><input value={draft.licenseNumber} onChange={e => setDraft({ ...draft, licenseNumber: e.target.value })} placeholder="License #" className={inputCls} /></td>
                <td className="px-3 py-2"><input type="date" value={draft.expirationDate} onChange={e => setDraft({ ...draft, expirationDate: e.target.value })} className={inputCls} /></td>
                <td className="px-3 py-2 text-xs text-gray-400">—</td>
                <td className="px-3 py-2 text-right">
                  <div className="inline-flex gap-2">
                    <button onClick={save} disabled={busy} className="text-emerald-600 hover:text-emerald-700 disabled:opacity-40" title="Save"><Save className="w-4 h-4" /></button>
                    <button onClick={cancel} disabled={busy} className="text-gray-400 hover:text-gray-600 disabled:opacity-40" title="Cancel"><X className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            )}
            {rows.length === 0 && !draft && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-sm text-gray-400 italic">No licenses on file.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {error && <div className="p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
    </div>
  )
}

const inputCls = 'bg-white border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

function LevelBadge({ level, expiration }: { level: LicenseAlertLevel; expiration: string }) {
  if (level === 'none') return null
  const daysUntil = Math.floor((new Date(expiration + 'T00:00:00').getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  const styles: Record<Exclude<LicenseAlertLevel, 'none'>, { cls: string; text: string }> = {
    notice:  { cls: 'text-amber-700 bg-amber-50 border-amber-200', text: `${daysUntil}d` },
    warning: { cls: 'text-amber-700 bg-amber-100 border-amber-300', text: `${daysUntil}d` },
    urgent:  { cls: 'text-red-700 bg-red-50 border-red-200', text: `${daysUntil}d` },
    expired: { cls: 'text-red-700 bg-red-100 border-red-300', text: 'EXPIRED' },
  }
  const s = styles[level]
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${s.cls}`}>{s.text}</span>
}
