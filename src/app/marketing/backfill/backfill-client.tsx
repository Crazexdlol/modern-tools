"use client"

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Check, Loader2, User } from 'lucide-react'
import { CLIENT_TYPE_LABELS, SELECTABLE_CLIENT_TYPES, type ClientType } from '@/lib/supabase/clients'
import { alertDialog } from '@/components/ui/dialog-service'

interface AnalyzedCluster {
  key: string
  canonicalName: string
  proposedType: ClientType
  typeConfident: boolean
  variants: Array<{ raw: string; count: number }>
  claimCount: number
  likelyConsumer: boolean
  needsReview: boolean
}

interface Analysis {
  totalClaims: number
  withClientName: number
  clusters: AnalyzedCluster[]
}

interface Decision {
  key: string
  canonicalName: string
  type: ClientType
  action: 'create' | 'skip'
}

type Phase = 'loading' | 'review' | 'committing' | 'done'

export function BackfillClient() {
  const [phase, setPhase] = useState<Phase>('loading')
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [decisions, setDecisions] = useState<Map<string, Decision>>(new Map())
  const [result, setResult] = useState<null | { clientsCreated: number; clientsReused: number; claimsBackfilled: number; failures: Array<{ canonicalName: string; error: string }> }>(null)
  const [hideSkipped, setHideSkipped] = useState(false)

  useEffect(() => {
    fetch('/api/marketing/backfill/analyze').then(async r => {
      const data = await r.json()
      if (!r.ok) { await alertDialog({ title: 'Analyze failed', message: data.error ?? 'The analyzer returned an error.', variant: 'danger' }); return }
      setAnalysis(data)
      const m = new Map<string, Decision>()
      for (const c of data.clusters as AnalyzedCluster[]) {
        m.set(c.key, {
          key: c.key,
          canonicalName: c.canonicalName,
          type: c.proposedType,
          action: c.likelyConsumer ? 'skip' : 'create',
        })
      }
      setDecisions(m)
      setPhase('review')
    })
  }, [])

  const updateDecision = (key: string, patch: Partial<Decision>) => {
    setDecisions(prev => {
      const next = new Map(prev)
      const d = next.get(key)
      if (!d) return prev
      next.set(key, { ...d, ...patch })
      return next
    })
  }

  const commit = async () => {
    if (!analysis) return
    const approvals = Array.from(decisions.values())
      .filter(d => d.action === 'create')
      .map(d => {
        const cluster = analysis.clusters.find(c => c.key === d.key)!
        return {
          canonicalName: d.canonicalName,
          type: d.type,
          variants: cluster.variants.map(v => v.raw),
        }
      })
    setPhase('committing')
    const res = await fetch('/api/marketing/backfill/commit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approvals }),
    })
    const data = await res.json()
    setResult(data)
    setPhase('done')
  }

  if (phase === 'loading' || !analysis) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-600"><Loader2 className="w-4 h-4 animate-spin" /> Analyzing claims…</div>
    )
  }

  if (phase === 'committing') {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-600"><Loader2 className="w-4 h-4 animate-spin" /> Creating clients and backfilling…</div>
    )
  }

  if (phase === 'done' && result) {
    return (
      <div className="space-y-4">
        <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">
          <div className="font-semibold mb-1 inline-flex items-center gap-2"><Check className="w-4 h-4" /> Backfill complete.</div>
          <div>Clients created: <b>{result.clientsCreated}</b> · reused: <b>{result.clientsReused}</b> · claims linked: <b>{result.claimsBackfilled}</b></div>
          {result.failures.length > 0 && (
            <div className="mt-2 text-red-700 text-xs">
              <div className="font-semibold">Failures ({result.failures.length}):</div>
              <ul className="list-disc pl-4">
                {result.failures.map((f, i) => <li key={i}>{f.canonicalName}: {f.error}</li>)}
              </ul>
            </div>
          )}
        </div>
        <Link href="/marketing" className="inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-700">
          <ArrowLeft className="w-4 h-4" /> Back to Marketing
        </Link>
      </div>
    )
  }

  const decisionArr = Array.from(decisions.values())
  const summary = {
    create: decisionArr.filter(d => d.action === 'create').length,
    skip: decisionArr.filter(d => d.action === 'skip').length,
  }
  const visibleClusters = hideSkipped
    ? analysis.clusters.filter(c => decisions.get(c.key)?.action !== 'skip')
    : analysis.clusters

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <div className="text-gray-700">
          <b>{analysis.clusters.length}</b> clusters found across <b>{analysis.withClientName}</b> claims with client names ({analysis.totalClaims} total).
        </div>
        <div className="ml-auto flex items-center gap-3">
          <label className="inline-flex items-center gap-1 text-xs text-gray-600">
            <input type="checkbox" checked={hideSkipped} onChange={(e) => setHideSkipped(e.target.checked)} />
            Hide skipped
          </label>
          <div className="text-xs">
            <span className="text-emerald-700 font-semibold">{summary.create} create</span>
            {' · '}<span className="text-gray-500">{summary.skip} skip</span>
          </div>
          <button onClick={commit} disabled={summary.create === 0}
                  className="text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg disabled:opacity-50">
            Commit {summary.create}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {visibleClusters.map(c => {
          const d = decisions.get(c.key)
          if (!d) return null
          return (
            <div key={c.key} className={`rounded-lg border p-3 bg-white ${d.action === 'skip' ? 'opacity-60 border-gray-200' : c.needsReview ? 'border-amber-300 bg-amber-50/40' : 'border-gray-200'}`}>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-0">
                  <input
                    value={d.canonicalName}
                    onChange={(e) => updateDecision(c.key, { canonicalName: e.target.value })}
                    className="text-sm font-bold text-gray-900 bg-transparent border-b border-transparent focus:border-blue-500 focus:outline-none w-full max-w-md"
                  />
                  <div className="text-xs text-gray-500 mt-0.5">
                    {c.variants.length} variant{c.variants.length === 1 ? '' : 's'} · {c.claimCount} claim{c.claimCount === 1 ? '' : 's'}
                    {c.likelyConsumer && (
                      <span className="ml-2 inline-flex items-center gap-1 text-red-700 font-semibold"><User className="w-3 h-3" /> looks like a person</span>
                    )}
                    {c.needsReview && (
                      <span className="ml-2 inline-flex items-center gap-1 text-amber-700 font-semibold">needs review</span>
                    )}
                  </div>
                </div>
                <select value={d.type} onChange={(e) => updateDecision(c.key, { type: e.target.value as ClientType })}
                        className="text-xs border border-gray-200 rounded-md px-2 py-1 bg-white">
                  {SELECTABLE_CLIENT_TYPES.map(t => (
                    <option key={t} value={t}>{CLIENT_TYPE_LABELS[t]}</option>
                  ))}
                </select>
                <div className="inline-flex rounded-md border border-gray-200 overflow-hidden">
                  {(['create', 'skip'] as const).map(a => (
                    <button key={a} type="button" onClick={() => updateDecision(c.key, { action: a })}
                            className={`px-2 py-0.5 border-l first:border-l-0 border-gray-200 text-[10px] font-semibold uppercase ${d.action === a ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                      {a}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {c.variants.slice(0, 30).map(v => (
                  <span key={v.raw} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 border border-gray-200 text-gray-700">
                    {v.raw} <span className="text-gray-400">×{v.count}</span>
                  </span>
                ))}
                {c.variants.length > 30 && <span className="text-[10px] text-gray-400">+ {c.variants.length - 30} more</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
