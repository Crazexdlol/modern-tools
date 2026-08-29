"use client"

import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { fetchUserLicenses, getLicenseAlertLevel, type AppraiserLicense, type LicenseAlertLevel } from '@/lib/supabase/appraiser-licenses'
import { US_STATES } from '@/lib/us-states'

interface Draft {
  id: string | null   // null = new
  state: string
  licenseNumber: string
  expirationDate: string
  status: 'active' | 'expired' | 'pending'
  licenseType: string
  notes: string
}

const emptyDraft = (): Draft => ({ id: null, state: '', licenseNumber: '', expirationDate: '', status: 'active', licenseType: '', notes: '' })

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
      status: row.status,
      licenseType: row.licenseType ?? '',
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
      status: draft.status,
      licenseType: draft.licenseType.trim() || null,
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
    <div className="space-y-4 max-w-5xl">
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
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-24">State</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-44">License #</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-36">Expires</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-44">Status</th>
              <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-48">Actions</th>
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
                      <td className="px-3 py-2"><StateSelect value={draft.state} onChange={v => setDraft({ ...draft, state: v })} /></td>
                      <td className="px-3 py-2"><input value={draft.licenseNumber} onChange={e => setDraft({ ...draft, licenseNumber: e.target.value })} className={inputCls + ' w-full'} /></td>
                      <td className="px-3 py-2"><input value={draft.licenseType} onChange={e => setDraft({ ...draft, licenseType: e.target.value })} placeholder="e.g. Independent Adjuster" className={inputCls + ' w-full'} /></td>
                      <td className="px-3 py-2"><input type="date" value={draft.expirationDate} onChange={e => setDraft({ ...draft, expirationDate: e.target.value })} className={inputCls + ' w-full'} /></td>
                      <td className="px-3 py-2">
                        <select value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value as Draft['status'] })} className={inputCls + ' w-full'}>
                          <option value="active">Active</option>
                          <option value="pending">Pending</option>
                          <option value="expired">Expired</option>
                        </select>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex gap-2">
                          <button onClick={save} disabled={busy} className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3 py-1.5 rounded disabled:opacity-40">
                            {busy ? 'Saving…' : 'Save'}
                          </button>
                          <button onClick={cancel} disabled={busy} className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-medium px-3 py-1.5 rounded disabled:opacity-40">
                            Cancel
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2 font-mono text-xs">{row.state}</td>
                      <td className="px-3 py-2 font-mono text-xs">{row.licenseNumber}</td>
                      <td className="px-3 py-2 text-xs text-gray-700">{row.licenseType || <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-2 text-xs text-gray-700">{row.expirationDate}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <StatusPill status={row.status} />
                          <LevelBadge level={level} expiration={row.expirationDate} />
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex gap-2">
                          <button onClick={() => startEdit(row)} disabled={draft !== null || busy} className="text-blue-600 hover:text-blue-800 text-xs font-medium disabled:opacity-40">Edit</button>
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
                <td className="px-3 py-2"><StateSelect value={draft.state} onChange={v => setDraft({ ...draft, state: v })} /></td>
                <td className="px-3 py-2"><input value={draft.licenseNumber} onChange={e => setDraft({ ...draft, licenseNumber: e.target.value })} placeholder="License #" className={inputCls + ' w-full'} /></td>
                <td className="px-3 py-2"><input value={draft.licenseType} onChange={e => setDraft({ ...draft, licenseType: e.target.value })} placeholder="e.g. Independent Adjuster" className={inputCls + ' w-full'} /></td>
                <td className="px-3 py-2"><input type="date" value={draft.expirationDate} onChange={e => setDraft({ ...draft, expirationDate: e.target.value })} className={inputCls + ' w-full'} /></td>
                <td className="px-3 py-2">
                  <select value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value as Draft['status'] })} className={inputCls + ' w-full'}>
                    <option value="active">Active</option>
                    <option value="pending">Pending</option>
                    <option value="expired">Expired</option>
                  </select>
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="inline-flex gap-2">
                    <button onClick={save} disabled={busy} className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3 py-1.5 rounded disabled:opacity-40">
                      {busy ? 'Saving…' : 'Save'}
                    </button>
                    <button onClick={cancel} disabled={busy} className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-medium px-3 py-1.5 rounded disabled:opacity-40">
                      Cancel
                    </button>
                  </div>
                </td>
              </tr>
            )}
            {rows.length === 0 && !draft && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-sm text-gray-400 italic">No licenses on file.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {error && <div className="p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
    </div>
  )
}

const inputCls = 'bg-white border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

function StateSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className={inputCls + ' w-full'}
    >
      <option value="">Select…</option>
      {US_STATES.map(s => (
        <option key={s.code} value={s.code}>{s.code} — {s.name}</option>
      ))}
    </select>
  )
}

function StatusPill({ status }: { status: 'active' | 'expired' | 'pending' }) {
  const styles: Record<string, string> = {
    active:  'text-emerald-700 bg-emerald-50 border-emerald-200',
    pending: 'text-amber-700 bg-amber-50 border-amber-200',
    expired: 'text-red-700 bg-red-100 border-red-300',
  }
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border capitalize ${styles[status] ?? styles.active}`}>
      {status}
    </span>
  )
}

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
