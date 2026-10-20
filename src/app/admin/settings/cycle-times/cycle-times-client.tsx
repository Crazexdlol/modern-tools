"use client"

import { useEffect, useMemo, useState } from 'react'
import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'

type StageAverage = { avgMs: number; count: number; totalMs: number }
type AppraiserTotal = { userId: string; name: string; ms: number; events: number }
type ClaimTotal = {
  claimId: string
  maNumber: string
  status: string
  totalMs: number
  paymentMs: number
  stages: Record<string, number>
}

const STAGE_ORDER: ('main' | 'qc' | 'billing_delivery' | 'payment')[] = [
  'main', 'qc', 'billing_delivery', 'payment',
]
const STAGE_LABELS: Record<string, string> = {
  main: 'Appraiser', qc: 'QC', billing_delivery: 'Billing/Delivery', payment: 'Payment',
}
const STAGE_COLORS: Record<string, string> = {
  main: 'bg-slate-100 text-slate-800 border-slate-200',
  qc: 'bg-blue-50 text-blue-800 border-blue-200',
  billing_delivery: 'bg-amber-50 text-amber-800 border-amber-200',
  payment: 'bg-emerald-50 text-emerald-800 border-emerald-200',
}

function fmtDuration(ms: number): string {
  if (!ms || ms < 0) return '0h'
  const days = Math.floor(ms / 86400000)
  const hours = Math.floor((ms % 86400000) / 3600000)
  if (days >= 1) return hours > 0 ? `${days}d ${hours}h` : `${days}d`
  const mins = Math.floor((ms % 3600000) / 60000)
  if (hours >= 1) return `${hours}h ${mins}m`
  return `${mins}m`
}

export function CycleTimesClient() {
  const [data, setData] = useState<{
    stageAverages: Record<string, StageAverage>
    appraiserTotals: AppraiserTotal[]
    claimTotals: ClaimTotal[]
    trackingStartedAt: string | null
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/cycle-times', { cache: 'no-store' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        setData(await res.json())
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const filteredClaims = useMemo(() => {
    if (!data?.claimTotals) return []
    const q = search.trim().toLowerCase()
    if (!q) return data.claimTotals
    return data.claimTotals.filter(c => c.maNumber.toLowerCase().includes(q))
  }, [data, search])

  if (loading) return <div className="text-sm text-slate-500">Loading…</div>
  if (error) return <div className="text-sm text-red-600">{error}</div>
  if (!data) return null

  const hasData =
    Object.keys(data.stageAverages).length > 0 ||
    data.appraiserTotals.length > 0 ||
    data.claimTotals.length > 0

  const printedAt = new Date().toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' })

  return (
    <div className="space-y-8">
      {/* Print bar — opens the browser print dialog on the hidden
          .cycle-print-only block below. Styling matches the HamsPortal
          print-button convention: blue, bold, Printer icon, label
          "Print Report". */}
      <div className="flex items-center justify-end print:hidden">
        <Button
          onClick={() => window.print()}
          className="bg-blue-600 hover:bg-blue-500 text-white font-bold"
        >
          <Printer className="w-4 h-4 mr-2" />
          Print Report
        </Button>
      </div>

      {/* Context banner */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-[13px] text-blue-900">
        {hasData && data.trackingStartedAt ? (
          <>Tracking started <b>{new Date(data.trackingStartedAt).toLocaleDateString()}</b>. Only claims that moved stages after this date appear in the stats below. Existing claims from before are not retroactively measured.</>
        ) : (
          <>No cycle-time data yet. As claims move through stages (Submit, Advance, Send Back, etc.) they populate automatically. Nothing is retroactively measured for existing claims.</>
        )}
      </div>

      {/* Per-stage averages */}
      <section>
        <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Average time per stage</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {STAGE_ORDER.map(stage => {
            const s = data.stageAverages[stage]
            return (
              <div key={stage} className={`rounded-lg border p-4 ${STAGE_COLORS[stage]}`}>
                <div className="text-[11px] uppercase tracking-wider font-semibold opacity-70">{STAGE_LABELS[stage]}</div>
                <div className="text-2xl font-bold mt-1 tabular-nums">{s ? fmtDuration(s.avgMs) : '—'}</div>
                <div className="text-[11px] opacity-70 mt-1">
                  {s ? `${s.count} event${s.count === 1 ? '' : 's'}` : 'no data yet'}
                </div>
              </div>
            )
          })}
        </div>
        <p className="text-[12px] text-slate-500 mt-3">
          Payment stage is tracked separately — it does <b>not</b> count toward any claim&apos;s headline total cycle time.
        </p>
      </section>

      {/* Per-appraiser leaderboard */}
      <section>
        <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Appraiser cycle time (total)</h2>
        <p className="text-[12px] text-slate-500 mb-3">
          Sum of time each appraiser personally held a claim (any stage, any session). Resumes if a claim comes back to them via send-back.
        </p>
        {data.appraiserTotals.length === 0 ? (
          <div className="text-sm text-slate-400 italic p-4 rounded-lg border border-slate-200 bg-white">
            No appraiser cycle time recorded yet.
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                  <th className="px-4 py-3">Appraiser</th>
                  <th className="px-4 py-3 text-right">Total time</th>
                  <th className="px-4 py-3 text-right">Events</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.appraiserTotals.map(a => (
                  <tr key={a.userId} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-semibold text-slate-900">{a.name}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmtDuration(a.ms)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-500 tabular-nums">{a.events}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Per-claim totals (searchable) */}
      <section>
        <div className="flex items-center justify-between mb-3 gap-3">
          <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider">Per-claim cycle time</h2>
          <input
            type="text"
            placeholder="Search by MA #"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="hp-input w-56"
          />
        </div>
        <p className="text-[12px] text-slate-500 mb-3">
          Headline total excludes time in Payment. Payment time is still shown as a separate column.
        </p>
        {filteredClaims.length === 0 ? (
          <div className="text-sm text-slate-400 italic p-4 rounded-lg border border-slate-200 bg-white">
            {search ? 'No claims match your search.' : 'No claim cycle time recorded yet.'}
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                  <th className="px-4 py-3">MA #</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Total (excl. Payment)</th>
                  <th className="px-4 py-3 text-right">Appraiser</th>
                  <th className="px-4 py-3 text-right">QC</th>
                  <th className="px-4 py-3 text-right">Billing</th>
                  <th className="px-4 py-3 text-right">Delivery</th>
                  <th className="px-4 py-3 text-right">Payment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredClaims.slice(0, 100).map(c => (
                  <tr key={c.claimId} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5">
                      <a href={`/claims/${c.claimId}`} target="_blank" rel="noreferrer" className="font-semibold text-slate-900 hover:text-blue-600 hover:underline">
                        {c.maNumber}
                      </a>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center h-5 px-2 rounded border text-[11px] font-semibold ${c.status === 'closed' ? 'border-slate-200 bg-slate-100 text-slate-600' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-slate-900">{fmtDuration(c.totalMs)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-600 tabular-nums">{fmtDuration(c.stages.main ?? 0)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-600 tabular-nums">{fmtDuration(c.stages.qc ?? 0)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-600 tabular-nums">{fmtDuration(c.stages.billing ?? 0)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-600 tabular-nums">{fmtDuration(c.stages.delivery ?? 0)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-400 tabular-nums">{fmtDuration(c.paymentMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredClaims.length > 100 && (
              <div className="px-4 py-3 text-[12px] text-slate-500 bg-slate-50 border-t border-slate-200">
                Showing first 100 of {filteredClaims.length} — refine search to narrow.
              </div>
            )}
          </div>
        )}
      </section>

      {/* ────────────────────────────────────────────────────────────────
          Print-only report. Hidden on screen; visible only when the
          browser invokes window.print(). Uses the Modern Appraisers logo
          at the top, Times New Roman throughout (per the HamsPortal
          hard rule), lists the stage averages, every appraiser's total,
          and the per-claim breakdown.
          ──────────────────────────────────────────────────────────── */}
      <div className="cycle-print-only" aria-hidden>
        <div className="cp-header">
          {/* eslint-disable-next-line @next/next/no-img-element -- plain <img> renders more reliably than next/image for print */}
          <img src="/companies/modern-appraisers/logo.png" alt="Modern Appraisers" className="cp-logo" />
        </div>

        <div className="cp-titleblock">
          <h1>Cycle Times Report</h1>
          <div className="cp-sub">
            Generated {printedAt}
            {data.trackingStartedAt && (
              <> · Tracking since {new Date(data.trackingStartedAt).toLocaleDateString()}</>
            )}
          </div>
        </div>

        {/* Stage averages */}
        <section className="cp-section">
          <h2>Average time per stage</h2>
          <table className="cp-table">
            <thead>
              <tr>
                <th>Stage</th>
                <th className="cp-r">Average</th>
                <th className="cp-r">Total time</th>
                <th className="cp-r">Events</th>
              </tr>
            </thead>
            <tbody>
              {STAGE_ORDER.map(stage => {
                const s = data.stageAverages[stage]
                return (
                  <tr key={stage}>
                    <td>{STAGE_LABELS[stage]}</td>
                    <td className="cp-r">{s ? fmtDuration(s.avgMs) : '—'}</td>
                    <td className="cp-r">{s ? fmtDuration(s.totalMs) : '—'}</td>
                    <td className="cp-r">{s ? s.count : 0}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="cp-note">
            Payment stage is tracked separately and does not count toward any claim&apos;s headline total.
          </p>
        </section>

        {/* Appraiser totals */}
        <section className="cp-section">
          <h2>Appraiser cycle time (total)</h2>
          {data.appraiserTotals.length === 0 ? (
            <p className="cp-note">No appraiser cycle time recorded yet.</p>
          ) : (
            <table className="cp-table">
              <thead>
                <tr>
                  <th>Appraiser</th>
                  <th className="cp-r">Total time</th>
                  <th className="cp-r">Events</th>
                </tr>
              </thead>
              <tbody>
                {data.appraiserTotals.map(a => (
                  <tr key={a.userId}>
                    <td>{a.name}</td>
                    <td className="cp-r">{fmtDuration(a.ms)}</td>
                    <td className="cp-r">{a.events}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Per-claim totals */}
        <section className="cp-section">
          <h2>Per-claim cycle time</h2>
          {filteredClaims.length === 0 ? (
            <p className="cp-note">No claim cycle time recorded yet.</p>
          ) : (
            <table className="cp-table">
              <thead>
                <tr>
                  <th>MA #</th>
                  <th>Status</th>
                  <th className="cp-r">Total<br />(excl. Payment)</th>
                  <th className="cp-r">Appraiser</th>
                  <th className="cp-r">QC</th>
                  <th className="cp-r">Billing</th>
                  <th className="cp-r">Delivery</th>
                  <th className="cp-r">Payment</th>
                </tr>
              </thead>
              <tbody>
                {filteredClaims.map(c => (
                  <tr key={c.claimId}>
                    <td>{c.maNumber}</td>
                    <td>{c.status}</td>
                    <td className="cp-r">{fmtDuration(c.totalMs)}</td>
                    <td className="cp-r">{fmtDuration(c.stages.main ?? 0)}</td>
                    <td className="cp-r">{fmtDuration(c.stages.qc ?? 0)}</td>
                    <td className="cp-r">{fmtDuration(c.stages.billing ?? 0)}</td>
                    <td className="cp-r">{fmtDuration(c.stages.delivery ?? 0)}</td>
                    <td className="cp-r">{fmtDuration(c.paymentMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <style jsx global>{`
        /* Hidden on screen. Only renders on paper. The @media print block
           flips the visibility: hide every live DOM node, then show just
           the .cycle-print-only subtree. */
        .cycle-print-only { display: none; }
        @media print {
          @page { margin: 0.5in; }
          body > :not(.cycle-print-only) { display: none !important; }
          .cycle-print-only {
            display: block !important;
            position: static;
            background: white;
            color: black;
            font-family: "Times New Roman", Times, serif;
            font-size: 11pt;
            line-height: 1.3;
          }
          .cycle-print-only .cp-header {
            display: flex;
            justify-content: center;
            align-items: center;
            border-bottom: 2px solid #000;
            padding-bottom: 10px;
            margin-bottom: 14px;
          }
          /* Force the light logo to render solid black on paper — same
             trick the assignment sheet uses. */
          .cycle-print-only .cp-logo {
            height: 56px;
            width: auto;
            display: block;
            filter: brightness(0);
          }
          .cycle-print-only .cp-titleblock {
            text-align: center;
            margin-bottom: 18px;
          }
          .cycle-print-only .cp-titleblock h1 {
            font-size: 20pt;
            font-weight: 700;
            margin: 0 0 4px;
          }
          .cycle-print-only .cp-titleblock .cp-sub {
            font-size: 10pt;
            color: #333;
          }
          .cycle-print-only .cp-section {
            margin-bottom: 18px;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .cycle-print-only .cp-section h2 {
            font-size: 12pt;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            margin: 0 0 6px;
            border-bottom: 1px solid #000;
            padding-bottom: 3px;
          }
          .cycle-print-only .cp-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 10.5pt;
          }
          .cycle-print-only .cp-table th,
          .cycle-print-only .cp-table td {
            border: 1px solid #999;
            padding: 4px 7px;
            text-align: left;
            vertical-align: top;
          }
          .cycle-print-only .cp-table th {
            background: #eee;
            font-weight: 700;
            font-size: 10pt;
          }
          .cycle-print-only .cp-table td.cp-r,
          .cycle-print-only .cp-table th.cp-r {
            text-align: right;
            font-variant-numeric: tabular-nums;
          }
          .cycle-print-only .cp-note {
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
