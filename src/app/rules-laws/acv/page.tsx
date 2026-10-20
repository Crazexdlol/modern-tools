"use client"

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Search,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  BadgeCheck,
  BookOpen,
  CircleHelp,
  AlertTriangle,
  Receipt,
} from 'lucide-react'
import { AppHeader } from '@/components/app-header'
import {
  acvData,
  ALL_STATE_CODES,
  type ACVStateEntry,
  type Source,
  type Trilean,
  type BookTrilean,
} from '@/lib/rules-laws/acv-data'

export default function ACVPage() {
  const [query, setQuery] = useState('')
  const [expandedCode, setExpandedCode] = useState<string | null>(null)

  const byCode = useMemo(() => {
    const map = new Map<string, ACVStateEntry>()
    for (const e of acvData) map.set(e.stateCode, e)
    return map
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return ALL_STATE_CODES
    return ALL_STATE_CODES.filter(s =>
      s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q)
    )
  }, [query])

  const researchedCount = acvData.length
  const totalCount = ALL_STATE_CODES.length

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <AppHeader />

      <main className="max-w-5xl mx-auto px-6 py-8">
        <Link href="/rules-laws" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 mb-4">
          <ArrowLeft className="w-4 h-4" /> Rules &amp; Laws
        </Link>

        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="hp-display">ACV — State Rules</h1>
            <p className="text-sm text-slate-500 mt-1 max-w-2xl">
              For each state: whether an appraiser needs a license to handle Right-to-Appraisal
              ACV claims, and the methodology rules for the ACV report (comparables, book values,
              distance/mileage caps, timeframes). Every answer is linked back to its statute,
              regulation, DOI bulletin, or published case. Not legal advice.
            </p>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">Researched</div>
            <div className="text-2xl font-bold text-slate-900 tabular-nums">
              {researchedCount}<span className="text-base text-slate-400"> / {totalCount}</span>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-5 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by state name or code"
            className="w-full bg-white border border-slate-200 rounded-md pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* State list */}
        <ul className="space-y-2">
          {filtered.map(s => {
            const entry = byCode.get(s.code)
            const expanded = expandedCode === s.code
            return (
              <li key={s.code}>
                <StateCard
                  stateName={s.name}
                  stateCode={s.code}
                  entry={entry}
                  expanded={expanded}
                  onToggle={() => setExpandedCode(expanded ? null : s.code)}
                />
              </li>
            )
          })}
          {filtered.length === 0 && (
            <li className="text-center text-sm text-slate-400 italic py-10">
              No states match your search.
            </li>
          )}
        </ul>
      </main>
    </div>
  )
}

// ─── State card ───────────────────────────────────────────────────────────────

function StateCard({
  stateName,
  stateCode,
  entry,
  expanded,
  onToggle,
}: {
  stateName: string
  stateCode: string
  entry: ACVStateEntry | undefined
  expanded: boolean
  onToggle: () => void
}) {
  const pending = !entry

  return (
    <div className={`bg-white border rounded-lg overflow-hidden transition-colors ${pending ? 'border-slate-200' : 'border-slate-200 hover:border-slate-300'}`}>
      <button
        type="button"
        onClick={pending ? undefined : onToggle}
        disabled={pending}
        className={`w-full text-left px-5 py-4 flex items-start justify-between gap-4 ${pending ? 'cursor-default' : 'cursor-pointer'}`}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded uppercase tracking-wider">
              {stateCode}
            </span>
            <h3 className="text-base font-bold text-slate-900">{stateName}</h3>
            {pending && (
              <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">
                Pending research
              </span>
            )}
          </div>
          {!pending && entry && (
            <SummaryStrip entry={entry} />
          )}
        </div>
        {!pending && (
          <div className="shrink-0 mt-1">
            {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </div>
        )}
      </button>

      {expanded && entry && (
        <div className="border-t border-slate-100 bg-slate-50/40">
          <ExpandedDetail entry={entry} />
        </div>
      )}
    </div>
  )
}

// Compact one-line summary shown on the collapsed card.
function SummaryStrip({ entry }: { entry: ACVStateEntry }) {
  const licensePart = (() => {
    if (entry.licensing.requiresLicense === 'yes') {
      return `License required${entry.licensing.licenseType ? ` (${entry.licensing.licenseType})` : ''}`
    }
    if (entry.licensing.requiresLicense === 'no') {
      return 'No license required for appraisal clause'
    }
    return 'License status: unclear'
  })()
  return (
    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-slate-500">
      <span>{licensePart}</span>
      <span>
        Comparables: {trileanLabel(entry.methodology.comparablesAllowed)} · Book values: {bookLabel(entry.methodology.bookValuesAllowed)}
      </span>
    </div>
  )
}

function trileanLabel(v: Trilean): string {
  return v === 'yes' ? 'allowed' : v === 'no' ? 'not allowed' : 'unclear'
}
function bookLabel(v: BookTrilean): string {
  return v === 'yes' ? 'allowed' : v === 'no' ? 'not allowed' : v === 'required' ? 'required' : 'unclear'
}

// Expanded body
function ExpandedDetail({ entry }: { entry: ACVStateEntry }) {
  return (
    <div className="px-5 py-5 space-y-5">
      {/* Licensing */}
      <section>
        <div className="flex items-center gap-2 mb-3 pb-2 border-b-2 border-slate-900">
          <BadgeCheck className="w-5 h-5 text-slate-900" />
          <h4 className="text-base font-bold text-slate-900 uppercase tracking-wider">Licensing</h4>
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-5 gap-y-2 text-[13px]">
          <Row label="Required?" value={entry.licensing.requiresLicense === 'yes' ? 'Yes' : entry.licensing.requiresLicense === 'no' ? 'No' : 'Unclear'} />
          <Row label="License type" value={entry.licensing.licenseType ?? '—'} />
          <Row label="Authority" value={entry.licensing.licensingAuthority ?? '—'} />
        </dl>
        {entry.licensing.notes && (
          <p className="text-[13px] text-slate-700 mt-2 whitespace-pre-wrap">{entry.licensing.notes}</p>
        )}
        <SourceList sources={entry.licensing.sources} />
      </section>

      {/* Methodology */}
      <section>
        <div className="flex items-center gap-2 mb-3 pb-2 border-b-2 border-slate-900">
          <BookOpen className="w-5 h-5 text-slate-900" />
          <h4 className="text-base font-bold text-slate-900 uppercase tracking-wider">ACV Methodology</h4>
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2 text-[13px]">
          <Row label="Comparables allowed?" value={trileanLabel(entry.methodology.comparablesAllowed)} />
          <Row label="Book values allowed?" value={bookLabel(entry.methodology.bookValuesAllowed)} />
          <Row label="Distance cap" value={entry.methodology.comparableDistanceCap ?? 'No explicit cap'} />
          <Row label="Mileage cap" value={entry.methodology.comparableMileageCap ?? 'No explicit cap'} />
          <Row label="Timeframe" value={entry.methodology.comparableTimeframe ?? 'No explicit rule'} />
        </dl>
        {entry.methodology.notes && (
          <p className="text-[13px] text-slate-700 mt-2 whitespace-pre-wrap">{entry.methodology.notes}</p>
        )}
        <SourceList sources={entry.methodology.sources} />
      </section>

      {entry.researchNotes && (
        <section className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold uppercase tracking-wider text-[10px] mb-0.5">Research notes</div>
            <div className="whitespace-pre-wrap">{entry.researchNotes}</div>
          </div>
        </section>
      )}

      <div className="text-[11px] text-slate-400">
        Last reviewed: {entry.lastReviewed}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">{label}</dt>
      <dd className="text-slate-800">{value}</dd>
    </div>
  )
}

function SourceList({ sources }: { sources: Source[] }) {
  if (sources.length === 0) {
    return (
      <div className="mt-2 flex items-center gap-1 text-[12px] text-slate-400 italic">
        <CircleHelp className="w-3.5 h-3.5" />
        No source citations provided.
      </div>
    )
  }
  return (
    <ul className="mt-3 space-y-1.5">
      {sources.map((s, i) => (
        <li key={i} className="text-[12px]">
          <a
            href={s.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-start gap-1 text-blue-700 hover:underline"
          >
            <span className="inline-block mt-0.5 text-[9px] uppercase tracking-wider font-bold text-slate-500 bg-slate-100 border border-slate-200 px-1 py-0.5 rounded shrink-0">
              {s.type.replace('_', ' ')}
            </span>
            <span>
              <span className="font-medium text-slate-900">{s.citation}</span>
              <span className="text-slate-600"> — {s.title}</span>
              <ExternalLink className="inline w-3 h-3 ml-1 text-slate-400" />
            </span>
          </a>
          {s.excerpt && (
            <blockquote className="mt-1 ml-14 border-l-2 border-slate-200 pl-2 text-[11.5px] text-slate-600 italic">
              “{s.excerpt}”
            </blockquote>
          )}
        </li>
      ))}
    </ul>
  )
}

// Suppress unused-import warning for Receipt (kept so icon stays in bundle for
// future header use); harmless no-op.
void Receipt
