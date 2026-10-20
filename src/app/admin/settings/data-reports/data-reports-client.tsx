"use client"

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Loader2, RefreshCw, Printer, ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SectionCard } from '../_shared'
import { fetchStatusPhaseConfigs, type StatusPhaseConfig } from '@/lib/supabase/status-phase-configs'

// ─── Types ────────────────────────────────────────────────────────────────────

type PhaseFilterMode = 'include' | 'exclude'

interface ClaimListItem {
  id: string
  maNumber: string
  insuredName: string
  status: string
  closeReason: string | null
  createdAt: string | null
  closedAt: string | null
  assignedTo: string | null
  statusPhase: string | null
}

interface MetricsResult {
  received: number
  closed: number
  cancelled: number
  overDays: number
  lists: {
    received: ClaimListItem[]
    closed: ClaimListItem[]
    cancelled: ClaimListItem[]
    overDays: ClaimListItem[]
  }
  range: { from: string; to: string }
  overDaysThreshold: number
  listLimit: number
}

type Category = 'received' | 'closed' | 'cancelled' | 'overDays'

// ─── Date helpers ─────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function defaultDates(): { from: string; to: string } {
  const today = new Date()
  const from = new Date(today)
  from.setDate(today.getDate() - 30)
  return { from: toDateStr(from), to: toDateStr(today) }
}

function fmtDate(iso: string): string {
  if (!iso) return ''
  const [year, month, day] = iso.split('-')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[parseInt(month, 10) - 1]} ${parseInt(day, 10)}, ${year}`
}

function fmtTimestamp(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return '—'
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DataReportsClient() {
  // --- Filters state ---
  const initial = defaultDates()
  const [fromDate, setFromDate] = useState(initial.from)
  const [toDate, setToDate] = useState(initial.to)
  const [overDays, setOverDays] = useState(60)

  // --- Phase filter state (applies ONLY to "Over X days old" metric) ---
  const [phases, setPhases] = useState<StatusPhaseConfig[]>([])
  const [checkedPhases, setCheckedPhases] = useState<Set<string>>(new Set())
  const [phaseMode, setPhaseMode] = useState<PhaseFilterMode>('include')
  const [phasesLoaded, setPhasesLoaded] = useState(false)

  // --- Metrics state ---
  const [metrics, setMetrics] = useState<MetricsResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // --- Which category list is currently expanded on-screen (null = none) ---
  const [openList, setOpenList] = useState<Category | null>(null)

  useEffect(() => {
    fetchStatusPhaseConfigs().then(configs => {
      setPhases(configs)
      setCheckedPhases(new Set(configs.map(c => c.code)))
      setPhasesLoaded(true)
    })
  }, [])

  const doFetch = useCallback(async () => {
    if (!fromDate || !toDate) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ from: fromDate, to: toDate, overDays: String(overDays) })
      if (phasesLoaded && phases.length > 0) {
        const allCodes = phases.map(p => p.code)
        const checkedArr = allCodes.filter(c => checkedPhases.has(c))
        if (phaseMode === 'include' && checkedArr.length < allCodes.length) {
          params.set('includePhases', checkedArr.join(','))
        } else if (phaseMode === 'exclude' && checkedArr.length > 0) {
          params.set('excludePhases', checkedArr.join(','))
        }
      }
      const res = await fetch(`/api/admin/data-reports?${params.toString()}`)
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`)
      setMetrics(body as MetricsResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load metrics')
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDate, toDate, overDays, phases, checkedPhases, phaseMode, phasesLoaded])

  useEffect(() => {
    if (phasesLoaded) doFetch()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phasesLoaded])

  const togglePhase = (code: string) => {
    setCheckedPhases(prev => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  const toggleAllPhases = () => {
    if (checkedPhases.size === phases.length) {
      setCheckedPhases(new Set())
    } else {
      setCheckedPhases(new Set(phases.map(p => p.code)))
    }
  }

  // Re-compute on every metrics refresh so the printed timestamp reflects
  // when the report data was fetched (not when the component mounted).
  const printedAt = useMemo(
    () => new Date().toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' }),
    [metrics],
  )

  // Shared category metadata — label + hint for cards, same strings used in
  // the printed report so the two always agree.
  const CATEGORIES: {
    key: Category
    label: string
    hint: (m: MetricsResult) => string
  }[] = [
    {
      key: 'received',
      label: 'Claims received',
      hint: m => `created ${fmtDate(m.range.from)} – ${fmtDate(m.range.to)}`,
    },
    {
      key: 'closed',
      label: 'Claims closed (completed)',
      hint: m => `closed ${fmtDate(m.range.from)} – ${fmtDate(m.range.to)}`,
    },
    {
      key: 'cancelled',
      label: 'Claims cancelled',
      hint: m => `cancelled ${fmtDate(m.range.from)} – ${fmtDate(m.range.to)}`,
    },
    {
      key: 'overDays',
      label: 'Claims over X days old',
      hint: m => `open ${m.overDaysThreshold}d+ · phase filter applied`,
    },
  ]

  const phaseLabelByCode = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of phases) map.set(p.code, p.label)
    return map
  }, [phases])

  return (
    <div className="space-y-6">
      {/* Top bar — Print on the right so it's always reachable without
          scrolling. CLAUDE.md convention: blue bg-blue-600, Printer icon,
          exact label "Print Report". */}
      <div className="flex items-center justify-end print:hidden">
        <Button
          onClick={() => window.print()}
          disabled={loading || !metrics}
          className="bg-blue-600 hover:bg-blue-500 text-white font-bold"
        >
          <Printer className="w-4 h-4 mr-2" />
          Print Report
        </Button>
      </div>

      {/* ── Filters ── */}
      <div className="print:hidden">
      <SectionCard title="Filters">
        <div className="space-y-5">
          {/* Date range — ONLY manual From/To. Preset dropdown removed
              per Henry's 2026-10-12 ask. */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                From
              </label>
              <input
                type="date"
                value={fromDate}
                onChange={e => setFromDate(e.target.value)}
                className="w-full bg-white border border-gray-200 rounded px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                To
              </label>
              <input
                type="date"
                value={toDate}
                onChange={e => setToDate(e.target.value)}
                className="w-full bg-white border border-gray-200 rounded px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Over X days */}
          <div className="flex items-center gap-3">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider shrink-0">
              &quot;Over X days old&quot; threshold
            </label>
            <input
              type="number"
              min={1}
              max={3650}
              value={overDays}
              onChange={e => setOverDays(Math.max(1, parseInt(e.target.value, 10) || 60))}
              className="w-24 bg-white border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-500">days</span>
          </div>

          {/* Phase filter — only affects the "Over X days old" metric. */}
          {phases.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Phase filter
                  </span>
                  <span className="text-[11px] text-gray-500 italic">
                    (applies to <b>Over X days</b> only — received / closed / cancelled always count every phase)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={toggleAllPhases}
                  className="text-xs text-blue-600 hover:underline"
                >
                  {checkedPhases.size === phases.length ? 'Deselect all' : 'Select all'}
                </button>
              </div>
              <div className="inline-flex rounded border border-gray-200 overflow-hidden mb-2">
                <button
                  type="button"
                  onClick={() => setPhaseMode('include')}
                  className={`px-2.5 py-1 text-xs font-semibold transition-colors ${
                    phaseMode === 'include' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  Include selected
                </button>
                <button
                  type="button"
                  onClick={() => setPhaseMode('exclude')}
                  className={`px-2.5 py-1 text-xs font-semibold transition-colors border-l border-gray-200 ${
                    phaseMode === 'exclude' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  Exclude selected
                </button>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1.5">
                {phases.map(phase => (
                  <label key={phase.code} className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={checkedPhases.has(phase.code)}
                      onChange={() => togglePhase(phase.code)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    {phase.label}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Refresh */}
          <div className="flex items-center gap-3 pt-1">
            <Button
              onClick={doFetch}
              disabled={loading || !fromDate || !toDate}
              className="bg-blue-600 hover:bg-blue-500 text-white gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {loading ? 'Loading…' : 'Refresh'}
            </Button>
            {error && <span className="text-sm text-red-600">{error}</span>}
          </div>
        </div>
      </SectionCard>
      </div>

      {/* ── Metrics ── */}
      <div className="print:hidden">
      <SectionCard title="Metrics">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {CATEGORIES.map(cat => (
            <MetricCard
              key={cat.key}
              label={cat.key === 'overDays' && metrics
                ? `Claims over ${metrics.overDaysThreshold} days old`
                : cat.label}
              hint={metrics ? cat.hint(metrics) : ''}
              value={loading ? null : (metrics ? (metrics as unknown as Record<Category, number>)[cat.key] : null)}
              open={openList === cat.key}
              onToggle={() => setOpenList(openList === cat.key ? null : cat.key)}
              count={metrics ? (metrics as unknown as Record<Category, number>)[cat.key] : 0}
            />
          ))}
        </div>

        {/* On-screen expandable list for the picked category */}
        {openList && metrics && (
          <div className="mt-5 border border-gray-200 rounded-lg bg-white overflow-hidden">
            <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-700 uppercase tracking-wider">
              {CATEGORIES.find(c => c.key === openList)?.label}
              {' · '}
              <span className="font-normal text-gray-500">
                {metrics.lists[openList].length} shown
                {metrics.lists[openList].length < (metrics as unknown as Record<Category, number>)[openList]
                  ? ` of ${(metrics as unknown as Record<Category, number>)[openList]} (capped at ${metrics.listLimit})`
                  : ''}
              </span>
            </div>
            <ClaimListTable items={metrics.lists[openList]} category={openList} phaseLabelByCode={phaseLabelByCode} />
          </div>
        )}
      </SectionCard>
      </div>

      {/* ── Print-only report ── */}
      {metrics && (
        <div className="data-report-print-only" aria-hidden>
          <div className="dr-header">
            {/* eslint-disable-next-line @next/next/no-img-element -- plain <img> for print */}
            <img src="/companies/modern-appraisers/logo.png" alt="Modern Appraisers" className="dr-logo" />
          </div>

          <div className="dr-titleblock">
            <h1>Data Report</h1>
            <div className="dr-sub">
              Generated {printedAt} · Range {fmtDate(metrics.range.from)} – {fmtDate(metrics.range.to)}
            </div>
          </div>

          <section className="dr-section">
            <h2>Summary</h2>
            <table className="dr-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th className="dr-r">Count</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>Claims received</td><td className="dr-r">{metrics.received}</td></tr>
                <tr><td>Claims closed (completed)</td><td className="dr-r">{metrics.closed}</td></tr>
                <tr><td>Claims cancelled</td><td className="dr-r">{metrics.cancelled}</td></tr>
                <tr><td>Claims open and over {metrics.overDaysThreshold} days old</td><td className="dr-r">{metrics.overDays}</td></tr>
              </tbody>
            </table>
          </section>

          {CATEGORIES.map(cat => {
            const items = metrics.lists[cat.key]
            const total = (metrics as unknown as Record<Category, number>)[cat.key]
            return (
              <section key={cat.key} className="dr-section">
                <h2>
                  {cat.key === 'overDays'
                    ? `Open and over ${metrics.overDaysThreshold} days old (${total})`
                    : `${cat.label} (${total})`}
                </h2>
                {items.length === 0 ? (
                  <p className="dr-note">None in this range.</p>
                ) : (
                  <>
                    <PrintClaimTable items={items} category={cat.key} phaseLabelByCode={phaseLabelByCode} />
                    {items.length < total && (
                      <p className="dr-note">Showing first {items.length} of {total} (list capped at {metrics.listLimit}).</p>
                    )}
                  </>
                )}
              </section>
            )
          })}
        </div>
      )}

      <style jsx global>{`
        .data-report-print-only { display: none; }
        @media print {
          @page { margin: 0.5in; }
          body > :not(.data-report-print-only) { display: none !important; }
          .data-report-print-only {
            display: block !important;
            position: static;
            background: white;
            color: black;
            font-family: "Times New Roman", Times, serif;
            font-size: 11pt;
            line-height: 1.3;
          }
          .data-report-print-only .dr-header {
            display: flex;
            justify-content: center;
            align-items: center;
            border-bottom: 2px solid #000;
            padding-bottom: 10px;
            margin-bottom: 14px;
          }
          .data-report-print-only .dr-logo {
            height: 56px;
            width: auto;
            display: block;
            filter: brightness(0);
          }
          .data-report-print-only .dr-titleblock {
            text-align: center;
            margin-bottom: 18px;
          }
          .data-report-print-only .dr-titleblock h1 {
            font-size: 20pt;
            font-weight: 700;
            margin: 0 0 4px;
          }
          .data-report-print-only .dr-titleblock .dr-sub {
            font-size: 10pt;
            color: #333;
          }
          .data-report-print-only .dr-section {
            margin-bottom: 20px;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .data-report-print-only .dr-section h2 {
            font-size: 12pt;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            margin: 0 0 6px;
            border-bottom: 1px solid #000;
            padding-bottom: 3px;
          }
          .data-report-print-only .dr-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 10.5pt;
          }
          .data-report-print-only .dr-table th,
          .data-report-print-only .dr-table td {
            border: 1px solid #999;
            padding: 4px 7px;
            text-align: left;
            vertical-align: top;
          }
          .data-report-print-only .dr-table th {
            background: #eee;
            font-weight: 700;
            font-size: 10pt;
          }
          .data-report-print-only .dr-table td.dr-r,
          .data-report-print-only .dr-table th.dr-r {
            text-align: right;
            font-variant-numeric: tabular-nums;
          }
          .data-report-print-only .dr-note {
            font-size: 9.5pt;
            color: #444;
            margin: 6px 0 0;
            font-style: italic;
          }
        }
      `}</style>
    </div>
  )
}

// ─── Metric card sub-component ────────────────────────────────────────────────

function MetricCard({
  label,
  hint,
  value,
  open,
  onToggle,
  count,
}: {
  label: string
  hint: string
  value: number | null
  open: boolean
  onToggle: () => void
  count: number
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`text-left border rounded-lg px-5 py-4 bg-white hover:border-blue-300 transition-colors cursor-pointer ${
        open ? 'border-blue-400 ring-2 ring-blue-200' : 'border-gray-200'
      }`}
      disabled={value === null || count === 0}
      title={value === null ? 'Loading…' : count === 0 ? 'No claims in this category' : 'Click to view the list'}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-gray-400 mb-1 truncate">
            {label}
          </div>
          <div className="text-4xl font-bold text-gray-900 tabular-nums leading-none mb-2">
            {value === null ? <span className="text-gray-300">—</span> : value.toLocaleString()}
          </div>
          {hint && <div className="text-xs text-gray-400">{hint}</div>}
        </div>
        <div className="shrink-0 text-gray-400 mt-1">
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </div>
      </div>
    </button>
  )
}

// ─── On-screen claim list ─────────────────────────────────────────────────────

function ClaimListTable({
  items,
  category,
  phaseLabelByCode,
}: {
  items: ClaimListItem[]
  category: Category
  phaseLabelByCode: Map<string, string>
}) {
  if (items.length === 0) {
    return <div className="p-6 text-sm text-gray-400 italic text-center">No claims in this category.</div>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-600">
            <th className="px-4 py-2.5">MA #</th>
            <th className="px-4 py-2.5">Insured</th>
            <th className="px-4 py-2.5">
              {category === 'closed' || category === 'cancelled' ? 'Closed' : 'Created'}
            </th>
            {category === 'overDays' && <th className="px-4 py-2.5">Phase</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {items.map(it => (
            <tr key={it.id} className="hover:bg-gray-50">
              <td className="px-4 py-2">
                <a
                  href={`/claims/${it.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-gray-900 hover:text-blue-600 hover:underline"
                >
                  {it.maNumber || '—'}
                </a>
              </td>
              <td className="px-4 py-2 text-gray-800">{it.insuredName || '—'}</td>
              <td className="px-4 py-2 text-gray-600 tabular-nums">
                {fmtTimestamp(category === 'closed' || category === 'cancelled' ? it.closedAt : it.createdAt)}
              </td>
              {category === 'overDays' && (
                <td className="px-4 py-2 text-gray-600">
                  {it.statusPhase ? (phaseLabelByCode.get(it.statusPhase) ?? it.statusPhase) : <span className="text-gray-400 italic">no phase</span>}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Print claim list ─────────────────────────────────────────────────────────

function PrintClaimTable({
  items,
  category,
  phaseLabelByCode,
}: {
  items: ClaimListItem[]
  category: Category
  phaseLabelByCode: Map<string, string>
}) {
  return (
    <table className="dr-table">
      <thead>
        <tr>
          <th>MA #</th>
          <th>Insured</th>
          <th>{category === 'closed' || category === 'cancelled' ? 'Closed' : 'Created'}</th>
          {category === 'overDays' && <th>Phase</th>}
        </tr>
      </thead>
      <tbody>
        {items.map(it => (
          <tr key={it.id}>
            <td>{it.maNumber || '—'}</td>
            <td>{it.insuredName || '—'}</td>
            <td>{fmtTimestamp(category === 'closed' || category === 'cancelled' ? it.closedAt : it.createdAt)}</td>
            {category === 'overDays' && (
              <td>{it.statusPhase ? (phaseLabelByCode.get(it.statusPhase) ?? it.statusPhase) : '—'}</td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
