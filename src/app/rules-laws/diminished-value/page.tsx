"use client"

import { useState } from 'react'
import Link from 'next/link'
import { AppHeader } from '@/components/app-header'
import {
  Search, ExternalLink, ChevronDown, ChevronUp, ArrowLeft, Scale, Gavel,
  CheckCircle2, XCircle, AlertTriangle, Clock, ShieldCheck, ShieldX, ShieldAlert,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  dvMethodologies, dvTypes, dvStateData, allStates,
  type DVStateEntry, type DVMethodology,
} from '@/lib/rules-laws/diminished-value-data'

// ─── Methodology Card ───

function MethodologyCard({ m }: { m: DVMethodology }) {
  const [open, setOpen] = useState(false)
  const statusConfig = {
    accepted: { label: 'Accepted', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2, iconColor: 'text-emerald-500' },
    criticized: { label: 'Criticized / Disputed', color: 'bg-amber-50 text-amber-700 border-amber-200', icon: AlertTriangle, iconColor: 'text-amber-500' },
    rejected: { label: 'Rejected', color: 'bg-red-50 text-red-700 border-red-200', icon: XCircle, iconColor: 'text-red-500' },
  }
  const s = statusConfig[m.status]
  const Icon = s.icon

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full text-left px-6 py-5 flex items-start justify-between gap-4 cursor-pointer">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <Icon className={cn('w-5 h-5 shrink-0', s.iconColor)} />
            <h3 className="text-base font-bold text-gray-900">{m.name}</h3>
            <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border', s.color)}>{s.label}</span>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed">{m.description}</p>
        </div>
        <div className="shrink-0 mt-1">
          {open ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
        </div>
      </button>
      {open && (
        <div className="border-t border-gray-100 px-6 py-5">
          <ul className="space-y-2">
            {m.details.map((d, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-gray-700">
                <span className={cn('w-1.5 h-1.5 rounded-full mt-1.5 shrink-0', m.status === 'accepted' ? 'bg-emerald-400' : m.status === 'criticized' ? 'bg-amber-400' : 'bg-red-400')} />
                {d}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ─── DV Type Card ───

function DVTypeCard({ t }: { t: typeof dvTypes[number] }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-6 py-5">
      <h4 className="text-sm font-bold text-gray-900 mb-1">{t.name}</h4>
      <p className="text-sm text-gray-600 mb-2">{t.description}</p>
      <p className="text-xs text-gray-500 leading-relaxed">{t.details}</p>
    </div>
  )
}

// ─── State Card ───

function StateCard({ entry, expanded, onToggle }: { entry: DVStateEntry; expanded: boolean; onToggle: () => void }) {
  const fpConfig = {
    yes: { label: '1st Party', color: 'bg-emerald-50 text-emerald-700', icon: ShieldCheck },
    no: { label: 'No 1st Party', color: 'bg-red-50 text-red-600', icon: ShieldX },
    limited: { label: '1st Party Limited', color: 'bg-amber-50 text-amber-700', icon: ShieldAlert },
  }
  const tpConfig = {
    yes: { label: '3rd Party', color: 'bg-emerald-50 text-emerald-700', icon: ShieldCheck },
    no: { label: 'No 3rd Party', color: 'bg-red-50 text-red-600', icon: ShieldX },
    limited: { label: '3rd Party Limited', color: 'bg-amber-50 text-amber-700', icon: ShieldAlert },
  }
  const fp = fpConfig[entry.firstParty]
  const tp = tpConfig[entry.thirdParty]

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden transition-all duration-200 hover:shadow-md">
      <button onClick={onToggle} className="w-full text-left px-6 py-5 flex items-start justify-between gap-4 cursor-pointer">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded uppercase tracking-wider">{entry.stateCode}</span>
            <h3 className="text-lg font-bold text-gray-900">{entry.state}</h3>
          </div>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded', fp.color)}>{fp.label}</span>
            <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded', tp.color)}>{tp.label}</span>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-gray-100 text-gray-600 flex items-center gap-1">
              <Clock className="w-3 h-3" /> {entry.statuteOfLimitations}
            </span>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed">{entry.summary}</p>
        </div>
        <div className="shrink-0 mt-1">
          {expanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100">
          {/* Info cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 px-6 py-5">
            <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
              <fp.icon className={cn('w-4 h-4 mt-0.5 shrink-0', entry.firstParty === 'yes' ? 'text-emerald-500' : entry.firstParty === 'limited' ? 'text-amber-500' : 'text-red-500')} />
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">First-Party Claims</p>
                <p className="text-sm text-gray-800 font-medium">{entry.firstParty === 'yes' ? 'Allowed — claim against your own insurer' : entry.firstParty === 'limited' ? 'Limited — depends on policy language or specific conditions' : 'Not recognized under standard auto policies'}</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
              <tp.icon className={cn('w-4 h-4 mt-0.5 shrink-0', entry.thirdParty === 'yes' ? 'text-emerald-500' : entry.thirdParty === 'limited' ? 'text-amber-500' : 'text-red-500')} />
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Third-Party Claims</p>
                <p className="text-sm text-gray-800 font-medium">{entry.thirdParty === 'yes' ? 'Allowed — claim against at-fault driver\'s insurer' : entry.thirdParty === 'limited' ? 'Limited — restrictions apply' : 'Not recognized'}</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
              <Clock className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Statute of Limitations</p>
                <p className="text-sm text-gray-800 font-medium">{entry.statuteOfLimitations} from date of accident</p>
              </div>
            </div>
          </div>

          {/* Key Points */}
          <div className="px-6 pb-5">
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Key Points</h4>
            <ul className="space-y-2">
              {entry.keyPoints.map((point, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-gray-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                  {point}
                </li>
              ))}
            </ul>
          </div>

          {/* Court Cases */}
          {entry.courtCases && entry.courtCases.length > 0 && (
            <div className="px-6 pb-5">
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Gavel className="w-3.5 h-3.5" />
                Court Cases
              </h4>
              <div className="space-y-3">
                {entry.courtCases.map((c, i) => (
                  <div key={i} className="bg-gray-50 rounded-lg p-4 border border-gray-100">
                    <div className="flex items-start justify-between gap-3 mb-1">
                      <p className="text-sm font-bold text-gray-900">{c.name}</p>
                      <span className="text-xs font-medium text-gray-500 shrink-0">{c.year}</span>
                    </div>
                    <p className="text-xs text-gray-500 mb-2">{c.court}</p>
                    <p className="text-sm text-gray-700 mb-2"><span className="font-medium">Holding:</span> {c.holding}</p>
                    <p className="text-sm text-gray-600"><span className="font-medium text-amber-700">Significance:</span> {c.significance}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {entry.notes && (
            <div className="px-6 pb-5">
              <div className="bg-amber-50 border border-amber-100 rounded-lg p-4">
                <p className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-1">Note</p>
                <p className="text-sm text-amber-800 leading-relaxed">{entry.notes}</p>
              </div>
            </div>
          )}

          {/* Source links */}
          {(entry.sourceUrl || entry.additionalLinks) && (
            <div className="px-6 pb-5 flex flex-wrap items-center gap-x-6 gap-y-2">
              {entry.sourceUrl && (
                <a href={entry.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors">
                  <ExternalLink className="w-3.5 h-3.5" />
                  {entry.sourceName || 'View Source'}
                </a>
              )}
              {entry.additionalLinks?.map((link, i) => (
                <a key={i} href={link.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors">
                  <ExternalLink className="w-3.5 h-3.5" />
                  {link.label}
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Empty State Card ───

function EmptyStateCard({ stateName, stateCode }: { stateName: string; stateCode: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-6 py-5">
      <div className="flex items-center gap-3 mb-1">
        <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded uppercase tracking-wider">{stateCode}</span>
        <h3 className="text-lg font-bold text-gray-900">{stateName}</h3>
      </div>
      <p className="text-sm text-gray-400 mt-2">
        Diminished value data for {stateName} is coming soon.
      </p>
    </div>
  )
}

// ─── Main Page ───

export default function DiminishedValuePage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedStates, setExpandedStates] = useState<Set<string>>(new Set())
  const [filterMode, setFilterMode] = useState<'all' | 'available'>('available')
  const [activeTab, setActiveTab] = useState<'states' | 'methodologies' | 'types'>('states')

  const toggleState = (code: string) => {
    setExpandedStates(prev => {
      const next = new Set(prev)
      next.has(code) ? next.delete(code) : next.add(code)
      return next
    })
  }

  const expandAll = () => setExpandedStates(new Set(dvStateData.map(e => e.stateCode)))
  const collapseAll = () => setExpandedStates(new Set())

  const dataMap = new Map(dvStateData.map(e => [e.stateCode, e]))

  const filteredStates = allStates.filter(s => {
    const q = searchQuery.toLowerCase().trim()
    if (q && !s.name.toLowerCase().includes(q) && !s.code.toLowerCase().includes(q)) return false
    if (filterMode === 'available' && !dataMap.has(s.code)) return false
    return true
  })

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <AppHeader />

      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/rules-laws" className="text-gray-400 hover:text-gray-900 transition-colors"><ArrowLeft className="w-5 h-5" /></Link>
          <h1 className="text-2xl font-bold text-gray-900">Diminished Value Laws</h1>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm mb-6 w-fit">
          {[
            { key: 'states' as const, label: 'State Laws' },
            { key: 'methodologies' as const, label: 'Methodologies' },
            { key: 'types' as const, label: 'DV Types' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'px-5 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors',
                activeTab === tab.key ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Methodologies Tab */}
        {activeTab === 'methodologies' && (
          <div className="space-y-3">
            {dvMethodologies.map((m, i) => (
              <MethodologyCard key={i} m={m} />
            ))}
          </div>
        )}

        {/* DV Types Tab */}
        {activeTab === 'types' && (
          <div className="space-y-3">
            {dvTypes.map((t, i) => (
              <DVTypeCard key={i} t={t} />
            ))}
          </div>
        )}

        {/* States Tab */}
        {activeTab === 'states' && (
          <>
            {/* Search and filters */}
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by state..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-lg pl-10 pr-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm"
                />
              </div>

              <div className="flex items-center bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                <button
                  onClick={() => setFilterMode('available')}
                  className={cn(
                    'px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors',
                    filterMode === 'available' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'
                  )}
                >
                  Available ({dvStateData.length})
                </button>
                <button
                  onClick={() => setFilterMode('all')}
                  className={cn(
                    'px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors',
                    filterMode === 'all' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'
                  )}
                >
                  All States
                </button>
              </div>

              <div className="flex items-center gap-2 ml-auto">
                <button onClick={expandAll} className="text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors">Expand all</button>
                <span className="text-gray-300">|</span>
                <button onClick={collapseAll} className="text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors">Collapse all</button>
              </div>
            </div>

            {/* State list */}
            <div className="space-y-3">
              {filteredStates.map(s => {
                const entry = dataMap.get(s.code)
                if (entry) {
                  return (
                    <StateCard
                      key={s.code}
                      entry={entry}
                      expanded={expandedStates.has(s.code)}
                      onToggle={() => toggleState(s.code)}
                    />
                  )
                }
                return <EmptyStateCard key={s.code} stateName={s.name} stateCode={s.code} />
              })}
              {filteredStates.length === 0 && (
                <div className="text-center py-16 text-gray-400">No states match your search.</div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
