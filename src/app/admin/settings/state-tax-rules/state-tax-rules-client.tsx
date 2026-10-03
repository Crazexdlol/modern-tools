"use client"

import { useEffect, useState } from 'react'
import { Save, X } from 'lucide-react'
import type { TaxRule } from '@/lib/supabase/state-tax-rules'
import { TAX_RULE_LABELS } from '@/lib/supabase/state-tax-rules'

interface RuleRow {
  state: string
  rule: TaxRule
  rate: number | null
  notes: string | null
  updated_at: string
}

interface EditDraft {
  rule: TaxRule
  rate: string   // string so the input is free-form; parsed on save
  notes: string
}

const TAX_RULES: TaxRule[] = ['none', 'all', 'parts_materials', 'parts_only', 'parts_materials_refinish']

export function StateTaxRulesClient() {
  const [rows, setRows] = useState<RuleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editingState, setEditingState] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    const res = await fetch('/api/admin/state-tax-rules')
    if (!res.ok) { setLoading(false); setError('Failed to load state tax rules'); return }
    const json = await res.json() as { rows: RuleRow[] }
    setRows(json.rows ?? [])
    setLoading(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-load pattern
    void load()
  }, [])

  const startEdit = (row: RuleRow) => {
    setEditingState(row.state)
    setEditDraft({
      rule: row.rule,
      rate: row.rate != null ? String(row.rate) : '',
      notes: row.notes ?? '',
    })
    setError(null)
  }

  const cancelEdit = () => {
    setEditingState(null)
    setEditDraft(null)
  }

  const saveEdit = async () => {
    if (!editingState || !editDraft) return

    // Validate rate: must be empty (null) or a non-negative number < 100.
    let parsedRate: number | null = null
    if (editDraft.rate.trim() !== '') {
      const n = parseFloat(editDraft.rate)
      if (isNaN(n) || n < 0 || n >= 100) {
        setError('Rate must be a number between 0 and 99.999 (e.g. 7.25 for 7.25%).')
        return
      }
      parsedRate = n
    }

    setBusy(true); setError(null)
    const res = await fetch(`/api/admin/state-tax-rules/${editingState}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rule: editDraft.rule,
        rate: parsedRate,
        notes: editDraft.notes.trim() || null,
      }),
    })
    setBusy(false)
    if (!res.ok) {
      const b = await res.json().catch(() => ({})) as { error?: string }
      setError(b.error ?? 'Save failed')
      return
    }
    setEditingState(null)
    setEditDraft(null)
    void load()
  }

  if (loading) return <div className="text-sm text-gray-500">Loading…</div>

  return (
    <div className="space-y-4 max-w-4xl">
      <p className="text-sm text-gray-500">
        One row per US state + DC. <strong>Rule</strong> controls which estimate components are taxable.
        <strong> Rate</strong> is the base statewide sales tax percentage (e.g. 7.25) — local taxes may add on top.
        Each estimate review auto-flags components taxed outside the rule, and flags rate discrepancies
        when the rule rate differs from the estimate&apos;s effective rate by 0.1+ points.
      </p>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-16">State</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-20">Rate %</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-64">Taxable Components</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Notes</th>
              <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-24">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const isEditing = editingState === row.state
              return (
                <tr key={row.state} className={`border-b border-gray-100 ${isEditing ? 'bg-blue-50/40' : 'hover:bg-gray-50/40'}`}>
                  {isEditing && editDraft ? (
                    <>
                      <td className="px-3 py-2 font-mono text-xs font-bold">{row.state}</td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={editDraft.rate}
                          onChange={e => setEditDraft({ ...editDraft, rate: e.target.value })}
                          placeholder="e.g. 7.25"
                          className={inputCls + ' w-20'}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={editDraft.rule}
                          onChange={e => setEditDraft({ ...editDraft, rule: e.target.value as TaxRule })}
                          className={inputCls + ' w-full'}
                        >
                          {TAX_RULES.map(r => (
                            <option key={r} value={r}>{TAX_RULE_LABELS[r]}</option>
                          ))}
                        </select>
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
                          <button onClick={saveEdit} disabled={busy} className="text-emerald-600 hover:text-emerald-700 disabled:opacity-40" title="Save">
                            <Save className="w-4 h-4" />
                          </button>
                          <button onClick={cancelEdit} disabled={busy} className="text-gray-400 hover:text-gray-600 disabled:opacity-40" title="Cancel">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2 font-mono text-xs font-bold">{row.state}</td>
                      <td className="px-3 py-2 tabular-nums text-xs">
                        {row.rate != null
                          ? <span className="font-medium">{row.rate.toFixed(3)}%</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                          row.rule === 'none'
                            ? 'text-gray-500 bg-gray-50 border-gray-200'
                            : row.rule === 'all'
                              ? 'text-red-700 bg-red-50 border-red-200'
                              : 'text-blue-700 bg-blue-50 border-blue-200'
                        }`}>
                          {TAX_RULE_LABELS[row.rule]}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-500 text-xs">{row.notes || '—'}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => startEdit(row)}
                          disabled={editingState !== null || busy}
                          className="text-gray-400 hover:text-blue-600 disabled:opacity-40 text-xs"
                          title="Edit"
                        >
                          Edit
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-sm text-gray-400 italic">
                  No rows found. Run the state-tax-rules migration in the Supabase SQL editor first.
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
