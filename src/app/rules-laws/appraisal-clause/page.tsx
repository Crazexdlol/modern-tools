"use client"

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { LogoutButton } from '@/components/logout-button'
import { Search, ExternalLink, ChevronDown, ChevronUp, Clock, Gavel, Users, FileText, MapPin, ListChecks, AlertTriangle, Scale, DollarSign, ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { appraisalClauseData, allStates, type AppraisalClauseEntry } from '@/lib/rules-laws/appraisal-clause-data'

function StateCard({ entry, expanded, onToggle }: {
  entry: AppraisalClauseEntry
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden transition-all duration-200 hover:shadow-md">
      {/* Header - always visible */}
      <button
        onClick={onToggle}
        className="w-full text-left px-6 py-5 flex items-start justify-between gap-4 cursor-pointer"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded uppercase tracking-wider">
              {entry.stateCode}
            </span>
            <h3 className="text-lg font-bold text-gray-900">{entry.state}</h3>
          </div>
          <p className="text-sm text-gray-500 font-medium">{entry.statute}</p>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">{entry.summary}</p>
        </div>
        <div className="shrink-0 mt-1">
          {expanded ? (
            <ChevronUp className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          )}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-gray-100">
          {/* Key info cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 px-6 py-5">
            {entry.timeframes && (
              <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
                <Clock className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Timeframes</p>
                  <p className="text-sm text-gray-800 font-medium">{entry.timeframes}</p>
                </div>
              </div>
            )}
            {entry.binding && (
              <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
                <Gavel className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Binding</p>
                  <p className="text-sm text-gray-800 font-medium">{entry.binding}</p>
                </div>
              </div>
            )}
            {entry.umpireProcess && (
              <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
                <Users className="w-4 h-4 text-purple-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Umpire</p>
                  <p className="text-sm text-gray-800 font-medium">{entry.umpireProcess}</p>
                </div>
              </div>
            )}
          </div>

          {/* Additional info cards row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 px-6 pb-5">
            {entry.geographicRequirements && (
              <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-lg">
                <MapPin className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-1">Geographic Area</p>
                  <p className="text-sm text-blue-900 font-medium">{entry.geographicRequirements}</p>
                </div>
              </div>
            )}
            {entry.totalLossThreshold && (
              <div className="flex items-start gap-3 p-4 bg-red-50 rounded-lg">
                <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-red-600 uppercase tracking-wider mb-1">Total Loss Threshold</p>
                  <p className="text-sm text-red-900 font-medium">{entry.totalLossThreshold}</p>
                </div>
              </div>
            )}
            {entry.penalties && (
              <div className="flex items-start gap-3 p-4 bg-orange-50 rounded-lg">
                <DollarSign className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-orange-600 uppercase tracking-wider mb-1">Penalties</p>
                  <p className="text-sm text-orange-900 font-medium">{entry.penalties}</p>
                </div>
              </div>
            )}
          </div>

          {/* Process Steps */}
          {entry.process && entry.process.length > 0 && (
            <div className="px-6 pb-5">
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                <ListChecks className="w-3.5 h-3.5" />
                How to Complete the Appraisal Process
              </h4>
              <ol className="space-y-2">
                {entry.process.map((step, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-gray-700">
                    <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <span className="leading-relaxed">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* ACV Methods */}
          {entry.acvMethods && entry.acvMethods.length > 0 && (
            <div className="px-6 pb-5">
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Scale className="w-3.5 h-3.5" />
                Accepted ACV Determination Methods
              </h4>
              <ul className="space-y-2">
                {entry.acvMethods.map((method, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-gray-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                    {method}
                  </li>
                ))}
              </ul>
            </div>
          )}

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

          {/* Full Text */}
          <div className="px-6 pb-5">
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <FileText className="w-3.5 h-3.5" />
              Full Statute Text
            </h4>
            <div className="bg-gray-50 rounded-lg p-5 border border-gray-100">
              <p className="text-sm text-gray-700 leading-[1.8] whitespace-pre-wrap font-[450]">
                {entry.fullText}
              </p>
            </div>
          </div>

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
          <div className="px-6 pb-5 flex flex-wrap items-center gap-x-6 gap-y-2">
            {entry.sourceUrl && (
              <a
                href={entry.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                {entry.sourceName || 'View Source'}
              </a>
            )}
            {entry.additionalLinks?.map((link, i) => (
              <a
                key={i}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                {link.label}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function EmptyStateCard({ stateName, stateCode }: { stateName: string; stateCode: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-6 py-5">
      <div className="flex items-center gap-3 mb-1">
        <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded uppercase tracking-wider">
          {stateCode}
        </span>
        <h3 className="text-lg font-bold text-gray-900">{stateName}</h3>
      </div>
      <p className="text-sm text-gray-400 mt-2">
        Appraisal clause data for {stateName} is coming soon. Most states follow the standard fire policy appraisal provision.
      </p>
    </div>
  )
}

export default function AppraisalClausePage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedStates, setExpandedStates] = useState<Set<string>>(new Set())
  const [filterMode, setFilterMode] = useState<'all' | 'available'>('available')

  const toggleState = (stateCode: string) => {
    setExpandedStates(prev => {
      const next = new Set(prev)
      if (next.has(stateCode)) {
        next.delete(stateCode)
      } else {
        next.add(stateCode)
      }
      return next
    })
  }

  const expandAll = () => {
    const available = appraisalClauseData.map(e => e.stateCode)
    setExpandedStates(new Set(available))
  }

  const collapseAll = () => {
    setExpandedStates(new Set())
  }

  const dataMap = new Map(appraisalClauseData.map(e => [e.stateCode, e]))

  const filteredStates = allStates.filter(s => {
    const q = searchQuery.toLowerCase().trim()
    if (q && !s.name.toLowerCase().includes(q) && !s.code.toLowerCase().includes(q)) {
      return false
    }
    if (filterMode === 'available' && !dataMap.has(s.code)) {
      return false
    }
    return true
  })

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-800 bg-gray-950 shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-8">
          <Link href="/"><Image src="/logo.png" alt="Modern Appraisers" width={160} height={48} className="h-9 w-auto" /></Link>
          <nav className="flex items-center gap-6">
            <Link href="/estimate-dispute" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">Estimate Dispute</Link>
            <Link href="/acv" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">ACV</Link>
            <Link href="/rules-laws" className="text-sm font-medium text-white">Rules / Laws</Link>
            <Link href="/negotiations" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">Negotiations</Link>
            <Link href="/summary-page" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">Summary Page</Link>
          </nav>
          <div className="ml-auto">
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center gap-3 mb-1">
          <Link href="/rules-laws" className="text-gray-400 hover:text-gray-900 transition-colors"><ArrowLeft className="w-5 h-5" /></Link>
          <h1 className="text-2xl font-bold text-gray-900">Appraisal Clause Laws</h1>
        </div>
        <p className="text-sm text-gray-500 mb-6">State-by-state appraisal clause statutes, process steps, ACV methods, geographic requirements, and source links.</p>

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
              Available ({appraisalClauseData.length})
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
            <button onClick={expandAll} className="text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors">
              Expand all
            </button>
            <span className="text-gray-300">|</span>
            <button onClick={collapseAll} className="text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors">
              Collapse all
            </button>
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
            <div className="text-center py-16 text-gray-400">
              No states match your search.
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
