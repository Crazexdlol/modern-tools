"use client"

import { useMemo, useState } from 'react'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import type { ClaimInfo, StorageLine, StorageState } from '@/lib/acv/types'
import { Button } from '@/components/ui/button'

// Fresh row helper — new lines get qty=1, everything else empty. React
// keys use `id` so re-ordering / deleting doesn't remount other rows.
function newLine(): StorageLine {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    qty: 1,
    description: '',
    hours: 0,
    rate: 0,
  }
}

export function defaultStorageState(): StorageState {
  return { lines: [newLine()], taxRatePct: 0, notes: '' }
}

function formatCurrency(n: number): string {
  if (!Number.isFinite(n)) return '$0.00'
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

// Compute the per-line total and grand totals. line_total = Qty × Hours × Rate
// (Henry updated the formula 2026-09-16 — e.g. Qty 2 · Hours 2 · Rate $125 = $500,
// treating each unit as its own hours-billed row). Empty/blank Qty defaults to 1
// so single-row bills work naturally without extra typing.
export function computeStorageTotals(state: StorageState): {
  lineTotals: number[]
  subtotal: number
  tax: number
  total: number
} {
  const lineTotals = state.lines.map(l => {
    const q = Number(l.qty) > 0 ? Number(l.qty) : 1
    const h = Number(l.hours) || 0
    const r = Number(l.rate) || 0
    return Math.max(0, q * h * r)
  })
  const subtotal = lineTotals.reduce((sum, v) => sum + v, 0)
  const rate = Math.max(0, Number(state.taxRatePct) || 0)
  const tax = subtotal * (rate / 100)
  const total = subtotal + tax
  return { lineTotals, subtotal, tax, total }
}

export function StorageTab({
  claim,
  state,
  onChange,
  onDocumentSaved,
  readOnly = false,
}: {
  claim: ClaimInfo
  state: StorageState
  onChange: (next: StorageState) => void
  onDocumentSaved?: (blob: Blob, name: string) => void
  readOnly?: boolean
}) {
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const totals = useMemo(() => computeStorageTotals(state), [state])

  const setLine = (i: number, patch: Partial<StorageLine>) => {
    onChange({
      ...state,
      lines: state.lines.map((l, idx) => idx === i ? { ...l, ...patch } : l),
    })
  }
  const addLine = () => onChange({ ...state, lines: [...state.lines, newLine()] })
  const removeLine = (i: number) => {
    // Never leave the table with zero rows — a fresh row keeps the UI usable.
    const next = state.lines.filter((_, idx) => idx !== i)
    onChange({ ...state, lines: next.length > 0 ? next : [newLine()] })
  }

  const handleGenerate = async () => {
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch('/api/storage/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claim, state }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({} as { error?: string }))
        throw new Error(body.error || 'PDF generation failed')
      }
      const blob = await res.blob()
      const name = `${claim.maNumber || 'claim'}-storagecharges.pdf`
      onDocumentSaved?.(blob, name)
      // Also trigger a save-to-disk so the user gets it right away.
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 1_000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF generation failed')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Storage Charges</h2>
          <p className="text-sm text-gray-500 mt-0.5">Line-item calculator for storage-related billing.</p>
        </div>
        <Button
          onClick={handleGenerate}
          disabled={generating || readOnly || state.lines.every(l => (Number(l.hours) || 0) === 0 && (Number(l.rate) || 0) === 0)}
          className="bg-emerald-600 hover:bg-emerald-500 text-white"
        >
          {generating ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating…</>) : 'Generate PDF'}
        </Button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
      )}

      <fieldset disabled={readOnly} className="border-0 p-0 m-0 min-w-0 space-y-6">
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-20">Qty</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Description</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-24">Hours</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-32">Rate ($/hr)</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-32">Line total</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {state.lines.map((line, i) => (
                <tr key={line.id} className="border-b border-gray-100">
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={line.qty === 0 ? '' : line.qty}
                      onChange={(e) => setLine(i, { qty: e.target.value === '' ? 0 : Math.max(0, parseInt(e.target.value, 10) || 0) })}
                      className="w-full bg-white border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="1"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={line.description}
                      onChange={(e) => setLine(i, { description: e.target.value })}
                      className="w-full bg-white border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Vehicle storage"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={line.hours === 0 ? '' : line.hours}
                      onChange={(e) => setLine(i, { hours: e.target.value === '' ? 0 : Math.max(0, parseFloat(e.target.value) || 0) })}
                      className="w-full bg-white border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="0"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={line.rate === 0 ? '' : line.rate}
                      onChange={(e) => setLine(i, { rate: e.target.value === '' ? 0 : Math.max(0, parseFloat(e.target.value) || 0) })}
                      className="w-full bg-white border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="0.00"
                    />
                  </td>
                  <td className="px-3 py-2 text-right text-sm font-medium text-gray-900 tabular-nums">
                    {formatCurrency(totals.lineTotals[i] ?? 0)}
                  </td>
                  <td className="px-2 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => removeLine(i)}
                      className="text-gray-400 hover:text-red-500 transition-colors p-1"
                      title="Remove line"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-3 py-2 bg-gray-50 border-t border-gray-200">
            <button
              type="button"
              onClick={addLine}
              className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              <Plus className="w-4 h-4" /> Add line
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Notes / comments</label>
            <textarea
              value={state.notes}
              onChange={(e) => onChange({ ...state, notes: e.target.value })}
              rows={5}
              placeholder="Optional context for the storage report (dates, location, per-diem breakdown, etc)."
              className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Subtotal</span>
              <span className="text-sm font-semibold text-gray-900 tabular-nums">{formatCurrency(totals.subtotal)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <label className="text-sm text-gray-600 shrink-0">Sales tax</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  value={state.taxRatePct === 0 ? '' : state.taxRatePct}
                  onChange={(e) => onChange({ ...state, taxRatePct: e.target.value === '' ? 0 : Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)) })}
                  className="w-24 bg-white border border-gray-200 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0.00"
                />
                <span className="text-sm text-gray-500 w-4">%</span>
                <span className="text-sm font-medium text-gray-900 w-24 text-right tabular-nums">{formatCurrency(totals.tax)}</span>
              </div>
            </div>
            <div className="border-t border-gray-200 pt-3 flex items-center justify-between">
              <span className="text-base font-bold text-gray-900">Total</span>
              <span className="text-lg font-bold text-emerald-700 tabular-nums">{formatCurrency(totals.total)}</span>
            </div>
          </div>
        </div>
      </fieldset>
    </div>
  )
}
