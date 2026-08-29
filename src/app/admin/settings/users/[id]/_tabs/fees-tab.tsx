"use client"

import { useEffect, useState } from 'react'
import { fetchFeeCatalog, type FeeCatalogEntry } from '@/lib/supabase/fee-catalog'
import { fetchAppraiserFees } from '@/lib/supabase/appraiser-fees'

export function FeesTab({ userId }: { userId: string }) {
  const [catalog, setCatalog] = useState<FeeCatalogEntry[]>([])
  const [amounts, setAmounts] = useState<Map<string, number | null>>(new Map())
  const [loading, setLoading] = useState(true)
  const [dirty, setDirty] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchFeeCatalog(), fetchAppraiserFees(userId)]).then(([cat, amts]) => {
      if (cancelled) return
      setCatalog(cat)
      setAmounts(amts)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [userId])

  const setAmount = (feeId: string, raw: string) => {
    const trimmed = raw.trim()
    const next = new Map(amounts)
    if (trimmed === '') next.set(feeId, null)
    else {
      const parsed = parseFloat(trimmed)
      if (Number.isNaN(parsed)) return
      next.set(feeId, parsed)
    }
    setAmounts(next)
    setDirty(d => new Set(d).add(feeId))
    setSaved(false)
  }

  const save = async () => {
    if (dirty.size === 0) return
    setSaving(true); setError(null); setSaved(false)
    const fees = Array.from(dirty).map(feeId => ({ feeId, amount: amounts.get(feeId) ?? null }))
    const res = await fetch('/api/admin/appraiser-fees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, fees }),
    })
    setSaving(false)
    if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.error ?? 'Save failed'); return }
    setDirty(new Set())
    setSaved(true)
  }

  if (loading) return <div className="text-sm text-gray-500">Loading fees…</div>

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Fee</th>
              <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-40">Amount ($)</th>
            </tr>
          </thead>
          <tbody>
            {catalog.map(entry => {
              const label = entry.unit === 'per_mile' ? `${entry.label} ($/mile)` : entry.label
              const value = amounts.get(entry.id)
              const display = value === null || value === undefined ? '' : String(value)
              return (
                <tr key={entry.id} className="border-b border-gray-100 last:border-b-0">
                  <td className="px-4 py-2 text-gray-800">{label}</td>
                  <td className="px-4 py-2 text-right">
                    <input
                      type="number"
                      step="0.01"
                      inputMode="decimal"
                      value={display}
                      onChange={e => setAmount(entry.id, e.target.value)}
                      className="w-32 bg-white border border-gray-200 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {error && <div className="p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
      {saved && !error && <div className="text-green-700 text-sm">Saved.</div>}

      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={dirty.size === 0 || saving}
          className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded disabled:opacity-50 hover:bg-blue-700"
        >
          {saving ? 'Saving…' : `Save${dirty.size > 0 ? ` (${dirty.size})` : ''}`}
        </button>
      </div>
    </div>
  )
}
