"use client"

import Link from 'next/link'
import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { Loader2, Search, ExternalLink, X, RefreshCw } from 'lucide-react'
import { CLIENT_TYPE_LABELS, type Client } from '@/lib/supabase/clients'
import { normalizeCompanyName, groupByCompanyName } from '@/lib/company-match'

interface ClaimRow {
  id: string
  maNumber: string | null
  insuredName: string | null
  insuranceCompany: string | null
  vehicle: string | null
  closedAt: string | null
  award: number | null
  insCoOffer: number | null
  oaValue: number | null
  maAcv: number | null
  deltaInsCo: number | null
  deltaMA: number | null
  deltaOA: number | null
  // 2026-10-15: lets the admin toggle umpire claims out of KPIs. Pre-
  // migration rows arrive as false by default.
  proceededToUmpire?: boolean
}

interface AnalyticsResponse {
  totalClaims: number
  claims: ClaimRow[]
}

type ViewMode =
  | { kind: 'all' }
  | { kind: 'filter-ins-co'; threshold: number }
  | { kind: 'missing-ins-co' }
  | { kind: 'missing-oa' }
  | { kind: 'missing-ma' }
  | { kind: 'missing-award' }
  | { kind: 'violations' }

// A "data mistake" is only flagged when our MA ACV is above BOTH the Award
// AND the OA value — meaning our starting number was somehow higher than
// everything else, which is almost always a typo in one of the three. Any
// other ordering is possible in real life (we might settle below the Ins.
// Co. offer on a weak claim, or exceed OA on a strong one) so we don't flag
// those. Partial claims (any of the three missing) never flag — we don't
// have enough to judge.
function getViolations(r: ClaimRow): string[] {
  if (r.maAcv === null || r.award === null || r.oaValue === null) return []
  if (r.maAcv > r.award && r.maAcv > r.oaValue) {
    return ['MA ACV above both Award and OA value']
  }
  return []
}

export function SettlementAnalyticsClient() {
  const [clients, setClients] = useState<Client[]>([])
  const [clientsLoading, setClientsLoading] = useState(true)
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [clientSearch, setClientSearch] = useState('')
  const [insCoFilter, setInsCoFilter] = useState<string>('')
  // Henry 2026-10-15: optional filter to drop claims that proceeded to a
  // third-party umpire out of the KPIs and table. Default off so existing
  // behavior is unchanged.
  const [excludeUmpire, setExcludeUmpire] = useState(false)
  const [filterInput, setFilterInput] = useState('')
  const [view, setView] = useState<ViewMode>({ kind: 'all' })
  // Timestamp of the last successful analytics fetch. Shown next to the
  // Refresh button so the admin can see whether the KPIs reflect their most
  // recent claim edits — a common point of confusion after updating missing
  // Ins. Co. / OA / Award values in another tab and coming back expecting
  // the averages to shift.
  const [fetchedAt, setFetchedAt] = useState<number | null>(null)
  // Live-updating "N seconds ago" badge. Re-renders every 5s while the tab
  // is visible so the admin notices when the data has aged. Pauses on
  // visibility-hidden (user switched to another tab) so a long-lived
  // Settlement Analytics tab doesn't burn CPU in the background.
  const [, setClockTick] = useState(0)
  useEffect(() => {
    if (fetchedAt === null) return
    let h: ReturnType<typeof setInterval> | null = null
    const start = () => { if (!h) h = setInterval(() => setClockTick(t => t + 1), 5000) }
    const stop  = () => { if (h) { clearInterval(h); h = null } }
    const onVis = () => (document.hidden ? stop() : start())
    if (!document.hidden) start()
    document.addEventListener('visibilitychange', onVis)
    return () => { stop(); document.removeEventListener('visibilitychange', onVis) }
  }, [fetchedAt])
  // Latest in-flight fetch's AbortController. Lives in a ref so the Refresh
  // button can cancel a previous slow request before firing a new one.
  const abortRef = useRef<AbortController | null>(null)
  // Baseline KPI snapshot captured on the first load for the currently
  // selected client. Lets us render "+12 since you opened this client"
  // badges on each counter so the user sees their edits land after a
  // Refresh. Resets when the client changes. Pool-size shifts are usually
  // tiny (~1-2% move on a ~170-row pool) so the raw averages look identical;
  // the eligible delta is the real signal that writes are flowing.
  interface KpiBaseline {
    eligible: number
    missingAward: number
    missingInsCo: number
    missingOA: number
    missingMA: number
    violations: number
  }
  const [baseline, setBaseline] = useState<KpiBaseline | null>(null)

  useEffect(() => {
    // Admin-only endpoint — bypasses the clients-table RLS that would
    // otherwise return [] for admins without `marketing_access=true`.
    fetch('/api/admin/clients')
      .then(async r => {
        if (!r.ok) throw new Error('Failed to load clients')
        const body = await r.json() as { clients: Client[] }
        setClients(body.clients ?? [])
        setClientsLoading(false)
      })
      .catch(() => { setClients([]); setClientsLoading(false) })
  }, [])

  // Fetches analytics for the given clientId. Separate function so the
  // Refresh button can call it directly without unmounting / remounting the
  // panel. Resets view filters on first-load (keeps them on explicit refresh
  // so the admin's "I was looking at missing Ins. Co." narrowing isn't lost).
  const loadAnalytics = useCallback(async (clientId: string, isFirstLoad: boolean) => {
    // Abort any previous in-flight fetch (slow client A → fast refresh B
    // race) so B's response can't be overwritten by A's late reply.
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setAnalyticsLoading(true)
    setError(null)
    try {
      // cache: 'no-store' is defensive — the API route is dynamic + sends no
      // Cache-Control, so no layer should cache it, but the admin workflow
      // (edit a claim in another tab, come back here, hit Refresh) depends on
      // every click actually hitting the DB.
      const r = await fetch(
        `/api/admin/settlement-analytics?clientId=${encodeURIComponent(clientId)}`,
        { signal: ctrl.signal, cache: 'no-store' },
      )
      if (!r.ok) {
        const b = await r.json().catch(() => ({}))
        throw new Error((b as { error?: string }).error ?? 'Failed to load analytics')
      }
      const a = await r.json() as AnalyticsResponse
      if (ctrl.signal.aborted) return
      setAnalytics(a)
      setFetchedAt(Date.now())
      if (isFirstLoad) {
        setView({ kind: 'all' })
        setFilterInput('')
        setInsCoFilter('')
        // Baseline captured AFTER useMemo re-runs — see the useEffect
        // below. Clearing here guarantees the next kpi recompute installs
        // a fresh baseline for this client.
        setBaseline(null)
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setError((e as Error).message)
    } finally {
      if (!ctrl.signal.aborted) setAnalyticsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!selectedClientId) { setAnalytics(null); setFetchedAt(null); return }
    loadAnalytics(selectedClientId, true)
    return () => abortRef.current?.abort()
  }, [selectedClientId, loadAnalytics])

  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase()
    if (!q) return clients
    return clients.filter(c => c.name.toLowerCase().includes(q))
  }, [clients, clientSearch])

  const selectedClient = clients.find(c => c.id === selectedClientId) ?? null

  // Unique Ins. Co. values present in this client's dataset. Normalized so
  // "Allstate", "Allstate Ins. Co.", and "Allstate Insurance Company" group
  // into a single option. Display label = the shortest spelling seen.
  const insCoGroups = useMemo(() => {
    if (!analytics) return []
    return groupByCompanyName(
      analytics.claims.filter(c => !!c.insuranceCompany),
      c => c.insuranceCompany,
    )
  }, [analytics])

  // Step 1: apply Ins. Co. filter to the full dataset. `insCoFilter` is a
  // normalized key — any claim whose insuranceCompany normalizes to the same
  // key passes. KPIs + missing counts compute from this subset so the
  // headline numbers always reflect what's actually in the table below.
  const baseRows = useMemo((): ClaimRow[] => {
    if (!analytics) return []
    let rows = analytics.claims
    if (insCoFilter) rows = rows.filter(r => normalizeCompanyName(r.insuranceCompany) === insCoFilter)
    if (excludeUmpire) rows = rows.filter(r => !r.proceededToUmpire)
    return rows
  }, [analytics, insCoFilter, excludeUmpire])

  // Step 2: apply the view mode (missing-X or above-$X). This narrows the
  // table only — KPIs stay anchored to the Ins. Co.-filtered subset.
  const visibleRows = useMemo((): ClaimRow[] => {
    switch (view.kind) {
      case 'all':             return baseRows
      case 'filter-ins-co':   return baseRows.filter(r => r.deltaInsCo !== null && r.deltaInsCo >= view.threshold)
      case 'missing-ins-co':  return baseRows.filter(r => r.insCoOffer === null)
      case 'missing-oa':      return baseRows.filter(r => r.oaValue    === null)
      case 'missing-ma':      return baseRows.filter(r => r.maAcv      === null)
      case 'missing-award':   return baseRows.filter(r => r.award      === null)
      case 'violations':      return baseRows.filter(r => getViolations(r).length > 0)
    }
  }, [baseRows, view])

  // Client-side KPIs computed over the Ins. Co.-filtered subset.
  //
  // Averages are only computed across "eligible" claims — those with (a) all
  // four required fields filled in (Award, Ins. Co. offer, OA value, MA ACV)
  // AND (b) no data-sanity violations. This keeps the three KPIs comparable
  // (same denominator / same population) and prevents known-bad data from
  // skewing the numbers. Partial claims still feed the "missing data" chips
  // and violating claims still feed the "data mistakes" chip — they're just
  // excluded from the averages until the data is fixed.
  const kpis = useMemo(() => {
    const avg = (xs: number[]) => xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length
    // A "settlement" is a claim where Award > $0. A $0 Award is almost always
    // a cancelled / denied / dropped claim that got marked closed without an
    // actual settlement. Averaging those against ~$30k offers would make the
    // numbers meaningless (every $0 pulls the average down by the full offer
    // amount). We exclude them from averages but still surface a count so
    // they can be audited.
    const settled = baseRows.filter(r => r.award !== null && r.award > 0)
    const nonSettlements = baseRows.filter(r => r.award === 0).length
    const complete = settled.filter(r =>
      r.insCoOffer !== null &&
      r.oaValue    !== null &&
      r.maAcv      !== null,
    )
    const eligible = complete.filter(r => getViolations(r).length === 0)
    const excludedForNonSettlement = nonSettlements
    const excludedForMissing       = settled.length - complete.length
    const excludedForMistakes      = complete.length - eligible.length
    return {
      total:          baseRows.length,
      eligible:       eligible.length,
      excludedForNonSettlement,
      excludedForMissing,
      excludedForMistakes,
      missingAward:   baseRows.filter(r => r.award      === null).length,
      missingInsCo:   baseRows.filter(r => r.insCoOffer === null).length,
      missingOA:      baseRows.filter(r => r.oaValue    === null).length,
      missingMA:      baseRows.filter(r => r.maAcv      === null).length,
      violations:     baseRows.filter(r => getViolations(r).length > 0).length,
      avgDeltaInsCo:  avg(eligible.map(r => r.deltaInsCo!).filter((n): n is number => n !== null)),
      avgDeltaMA:     avg(eligible.map(r => r.deltaMA!).filter((n): n is number => n !== null)),
      avgDeltaOA:     avg(eligible.map(r => r.deltaOA!).filter((n): n is number => n !== null)),
    }
  }, [baseRows])

  // Install the baseline the first time an analytics payload lands for a
  // given client (baseline === null after the client-switch reset above).
  // Every subsequent Refresh for the same client leaves the baseline intact
  // so the "+N since opened" badges keep accumulating.
  //
  // IMPORTANT: baseline is computed over `analytics.claims` directly, NOT
  // over `kpis` (which is filtered by `insCoFilter`). If we used the filtered
  // kpis, switching the Ins. Co. filter mid-session would make the delta
  // badges meaningless (e.g. "−44 missing" from filter narrowing, not from
  // the admin fixing claims). Deltas are only rendered when the filter is
  // empty — otherwise we'd be comparing an unfiltered baseline against a
  // filtered current, which is apples to oranges.
  useEffect(() => {
    if (!analytics) return
    if (baseline !== null) return
    const all = analytics.claims
    const settledAll = all.filter(r => r.award !== null && r.award > 0)
    const completeAll = settledAll.filter(r =>
      r.insCoOffer !== null && r.oaValue !== null && r.maAcv !== null,
    )
    const eligibleAll = completeAll.filter(r => getViolations(r).length === 0)
    setBaseline({
      eligible: eligibleAll.length,
      missingAward: all.filter(r => r.award      === null).length,
      missingInsCo: all.filter(r => r.insCoOffer === null).length,
      missingOA:    all.filter(r => r.oaValue    === null).length,
      missingMA:    all.filter(r => r.maAcv      === null).length,
      violations:   all.filter(r => getViolations(r).length > 0).length,
    })
  }, [analytics, baseline])

  const toggleMissing = (target: Extract<ViewMode['kind'], `missing-${string}`>) => {
    setView(view.kind === target ? { kind: 'all' } : { kind: target })
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 shadow-sm rounded-lg p-5 space-y-4">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Pick a client</div>
        {clientsLoading ? (
          <div className="text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading clients…</div>
        ) : (
          <div className="space-y-3">
            <div className="relative max-w-md">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search clients by name…"
                value={clientSearch}
                onChange={e => setClientSearch(e.target.value)}
                className="w-full bg-white border border-gray-200 rounded-md pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto border border-gray-100 rounded-md p-2 bg-gray-50/50">
              {filteredClients.length === 0 ? (
                <div className="text-xs text-gray-400 italic px-2 py-1">No matching clients.</div>
              ) : (
                filteredClients.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedClientId(c.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${
                      selectedClientId === c.id
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300 hover:text-blue-700'
                    }`}
                  >
                    {c.name}
                    <span className={`text-[10px] uppercase tracking-wider opacity-70`}>· {CLIENT_TYPE_LABELS[c.type]}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {!selectedClientId && (
        <div className="bg-white border border-gray-200 shadow-sm rounded-lg p-10 text-center text-sm text-gray-500">
          Select a client above to see settlement deltas across their closed ACV claims.
        </div>
      )}

      {selectedClientId && analyticsLoading && (
        <div className="bg-white border border-gray-200 shadow-sm rounded-lg p-10 flex items-center justify-center gap-3 text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm font-medium">Crunching numbers…</span>
        </div>
      )}

      {error && (
        <div className="p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
      )}

      {analytics && !analyticsLoading && (
        <>
          <div className="bg-white border border-gray-200 shadow-sm rounded-lg p-5 space-y-4">
            <div className="flex items-baseline justify-between flex-wrap gap-3">
              <div>
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">ACV claims closed for</div>
                <div className="text-lg font-bold text-gray-900">
                  {selectedClient?.name ?? '—'}
                  {insCoFilter && (
                    <span className="text-sm font-medium text-blue-700 ml-2">
                      · {insCoGroups.find(g => g.key === insCoFilter)?.display ?? insCoFilter}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {fetchedAt !== null && (
                  <span className="text-[11px] text-gray-500 tabular-nums" title={new Date(fetchedAt).toLocaleString()}>
                    Updated {fmtAgo(fetchedAt)}
                  </span>
                )}
                <button
                  onClick={() => selectedClientId && loadAnalytics(selectedClientId, false)}
                  disabled={analyticsLoading || !selectedClientId}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:border-blue-300 hover:text-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Re-fetch analytics from the database"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${analyticsLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
                <div className="text-sm text-gray-500">
                  <span className="font-semibold text-gray-900 tabular-nums">{kpis.total}</span>
                  {insCoFilter ? <> of <span className="font-medium">{analytics.totalClaims}</span> total</> : <> total</>}
                </div>
              </div>
            </div>

            {insCoGroups.length > 0 && (
              <div className="flex items-end gap-2 flex-wrap pt-1">
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider block mb-1">Insurance Company</label>
                  <select
                    value={insCoFilter}
                    onChange={e => setInsCoFilter(e.target.value)}
                    className="bg-white border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[260px]"
                  >
                    <option value="">All insurance companies</option>
                    {insCoGroups.map(g => (
                      <option key={g.key} value={g.key} title={g.variants.length > 1 ? `Matches: ${g.variants.join(', ')}` : undefined}>
                        {g.display} ({g.items.length}){g.variants.length > 1 ? ` · ${g.variants.length} spellings` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                {insCoFilter && (
                  <button
                    onClick={() => setInsCoFilter('')}
                    className="h-9 inline-flex items-center gap-1 px-3 text-sm font-medium text-gray-600 hover:text-gray-900"
                  >
                    <X className="w-3.5 h-3.5" /> Clear
                  </button>
                )}
                {/* Umpire filter — drops claims that proceeded to a third-
                    party umpire out of KPIs and the table. Positioned next
                    to the Ins. Co. filter so both narrowings read together. */}
                <label className="inline-flex items-center gap-2 h-9 px-3 bg-white border border-gray-200 rounded-md text-sm font-medium text-gray-700 cursor-pointer hover:border-gray-300">
                  <input
                    type="checkbox"
                    checked={excludeUmpire}
                    onChange={e => setExcludeUmpire(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  Exclude umpire claims
                  {analytics && analytics.claims.some(c => c.proceededToUmpire) && (
                    <span className="text-xs text-gray-400 tabular-nums">
                      ({analytics.claims.filter(c => c.proceededToUmpire).length})
                    </span>
                  )}
                </label>
              </div>
            )}

            {kpis.total > 0 && (
              <div className={`text-xs rounded-md border px-3 py-2 ${
                kpis.eligible === kpis.total
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-amber-50 border-amber-200 text-amber-900'
              }`}>
                {kpis.eligible === kpis.total ? (
                  <>Averages below cover all <span className="font-semibold tabular-nums">{kpis.total}</span> claims — every one is a real settlement with MA ACV, Ins. Co. offer, Award, and OA Value filled in and passes the data-sanity check.</>
                ) : (
                  <>
                    Averages below cover <span className="font-semibold tabular-nums">{kpis.eligible}</span>{baseline && !insCoFilter && kpis.eligible !== baseline.eligible && (
                      <span className={`ml-1 text-[11px] font-semibold tabular-nums ${kpis.eligible > baseline.eligible ? 'text-emerald-700' : 'text-red-700'}`} title={`Pool was ${baseline.eligible} when you opened this client; now ${kpis.eligible}`}>
                        ({kpis.eligible > baseline.eligible ? '+' : ''}{kpis.eligible - baseline.eligible} since opened)
                      </span>
                    )} of <span className="font-semibold tabular-nums">{kpis.total}</span> claims.
                    {kpis.excludedForNonSettlement > 0 && (
                      <> <span className="font-semibold tabular-nums">{kpis.excludedForNonSettlement}</span> excluded as non-settlements ($0 Award — cancelled, denied, or dropped claims).</>
                    )}
                    {kpis.excludedForMissing > 0 && (
                      <> <span className="font-semibold tabular-nums">{kpis.excludedForMissing}</span> excluded for missing data (MA ACV / Ins. Co. offer / Award / OA Value).</>
                    )}
                    {kpis.excludedForMistakes > 0 && (
                      <> <span className="font-semibold tabular-nums">{kpis.excludedForMistakes}</span> excluded as data mistakes (MA ACV above both Award and OA Value — likely a typo).</>
                    )}
                    {' '}Fix those claims to pull them into the averages.
                  </>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <KpiCard
                label="Avg Settled Above Ins. Co."
                value={kpis.avgDeltaInsCo}
                help={`award − ins. co. offer, avg across ${kpis.eligible} claim${kpis.eligible === 1 ? '' : 's'} with all 4 fields filled`}
                tone={kpis.avgDeltaInsCo !== null && kpis.avgDeltaInsCo > 0 ? 'positive' : 'neutral'}
              />
              <KpiCard
                label="Avg We Moved Up (vs. MA ACV)"
                value={kpis.avgDeltaMA}
                help={`award − MA ACV, avg across ${kpis.eligible} claim${kpis.eligible === 1 ? '' : 's'} with all 4 fields filled`}
                tone={kpis.avgDeltaMA !== null && kpis.avgDeltaMA > 0 ? 'positive' : 'neutral'}
              />
              <KpiCard
                label="Avg vs. OA Value"
                value={kpis.avgDeltaOA}
                help={`award − OA value, avg across ${kpis.eligible} claim${kpis.eligible === 1 ? '' : 's'} with all 4 fields filled`}
                tone={kpis.avgDeltaOA === null ? 'neutral' : (kpis.avgDeltaOA > 0 ? 'positive' : 'negative')}
              />
            </div>

            <div className="pt-4 border-t border-gray-100 space-y-3">
              <div>
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Missing data</div>
                <div className="flex flex-wrap gap-2">
                  {/* Deltas are only passed when no Ins. Co. filter is active — baseline is unfiltered
                      so a filtered current count would compare apples to oranges and mislead. */}
                  <MissingChip label="Ins. Co. offer" count={kpis.missingInsCo} baseline={insCoFilter ? undefined : baseline?.missingInsCo} onClick={() => toggleMissing('missing-ins-co')} active={view.kind === 'missing-ins-co'} />
                  <MissingChip label="OA value"        count={kpis.missingOA}    baseline={insCoFilter ? undefined : baseline?.missingOA}    onClick={() => toggleMissing('missing-oa')}    active={view.kind === 'missing-oa'} />
                  <MissingChip label="MA ACV"          count={kpis.missingMA}    baseline={insCoFilter ? undefined : baseline?.missingMA}    onClick={() => toggleMissing('missing-ma')}    active={view.kind === 'missing-ma'} />
                  <MissingChip label="Award"           count={kpis.missingAward} baseline={insCoFilter ? undefined : baseline?.missingAward} onClick={() => toggleMissing('missing-award')} active={view.kind === 'missing-award'} />
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                  Data sanity
                  <span className="ml-2 font-normal normal-case tracking-normal text-gray-400">Flags claims where our MA ACV is above BOTH the Award and the OA value — almost always a typo in one of the three.</span>
                </div>
                <ViolationChip count={kpis.violations} onClick={() => setView(view.kind === 'violations' ? { kind: 'all' } : { kind: 'violations' })} active={view.kind === 'violations'} />
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 shadow-sm rounded-lg p-5 space-y-4">
            <div className="flex items-end justify-between gap-3 flex-wrap">
              <div className="flex items-end gap-2">
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider block mb-1">Settled above Ins. Co. by at least</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      placeholder="3000"
                      value={filterInput}
                      onChange={e => setFilterInput(e.target.value)}
                      className="w-40 bg-white border border-gray-200 rounded-md pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 tabular-nums"
                    />
                  </div>
                </div>
                <button
                  onClick={() => {
                    const n = Number(filterInput)
                    if (!isFinite(n) || n < 0) return
                    setView({ kind: 'filter-ins-co', threshold: n })
                  }}
                  disabled={!filterInput}
                  className="h-9 px-4 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded disabled:opacity-40"
                >
                  Apply
                </button>
                {view.kind !== 'all' && (
                  <button
                    onClick={() => { setView({ kind: 'all' }); setFilterInput('') }}
                    className="h-9 px-3 text-sm font-medium text-gray-600 hover:text-gray-900"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="text-sm text-gray-500 tabular-nums">
                Showing <span className="font-semibold text-gray-900">{visibleRows.length}</span> of {kpis.total}
                {view.kind === 'filter-ins-co' && <span className="ml-2 text-xs text-blue-700">(≥ {fmtCurrency(view.threshold)} above Ins. Co.)</span>}
                {view.kind === 'missing-ins-co' && <span className="ml-2 text-xs text-amber-700">(missing Ins. Co. offer)</span>}
                {view.kind === 'missing-oa'      && <span className="ml-2 text-xs text-amber-700">(missing OA value)</span>}
                {view.kind === 'missing-ma'      && <span className="ml-2 text-xs text-amber-700">(missing MA ACV)</span>}
                {view.kind === 'missing-award'   && <span className="ml-2 text-xs text-amber-700">(missing Award)</span>}
                {view.kind === 'violations'      && <span className="ml-2 text-xs text-red-700">(data sanity violations)</span>}
              </div>
            </div>

            <ClaimsTable rows={visibleRows} showInsCo={!insCoFilter} />
          </div>
        </>
      )}
    </div>
  )
}

function KpiCard({ label, value, help, tone }: { label: string; value: number | null; help: string; tone: 'positive' | 'negative' | 'neutral' }) {
  const toneCls = tone === 'positive' ? 'text-emerald-700' : tone === 'negative' ? 'text-red-700' : 'text-gray-900'
  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-gray-50/40">
      <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-2xl font-bold tabular-nums ${toneCls}`}>
        {value === null ? <span className="text-gray-300">—</span> : fmtCurrency(value)}
      </div>
      <div className="text-[11px] text-gray-500 mt-1 leading-snug">{help}</div>
    </div>
  )
}

function ViolationChip({ count, onClick, active }: { count: number; onClick: () => void; active: boolean }) {
  if (count === 0 && !active) {
    return (
      <span className="inline-flex items-center px-3 py-1 rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-medium">
        No data mistakes detected
      </span>
    )
  }
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-3 py-1 rounded-md border text-xs font-medium transition-colors ${
        active
          ? 'bg-red-600 text-white border-red-600'
          : 'bg-red-50 text-red-800 border-red-300 hover:border-red-500'
      }`}
      title={active ? 'Click to clear this filter' : 'Click to view claims with ordering violations'}
    >
      <span className="tabular-nums font-semibold">{count}</span>
      <span>data mistake{count === 1 ? '' : 's'}</span>
      <span className="text-[10px] uppercase tracking-wider opacity-80">{active ? 'Clear' : 'View'}</span>
    </button>
  )
}

function MissingChip({ label, count, baseline, onClick, active }: { label: string; count: number; baseline?: number; onClick: () => void; active: boolean }) {
  // Delta vs. the baseline captured when this client was first opened. A
  // negative delta (count dropped) means the admin fixed one or more
  // missing-field claims this session — surface it as a small green badge
  // so edits are visible immediately after Refresh. Hidden on the "all
  // clean" chip (nothing to compare to).
  const delta = baseline !== undefined ? count - baseline : 0
  if (count === 0 && !active) {
    return (
      <span className="inline-flex items-center px-3 py-1 rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-medium">
        All claims have {label}
      </span>
    )
  }
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-3 py-1 rounded-md border text-xs font-medium transition-colors ${
        active
          ? 'bg-amber-600 text-white border-amber-600'
          : 'bg-amber-50 text-amber-800 border-amber-200 hover:border-amber-400'
      }`}
      title={active ? 'Click to clear this filter' : 'Click to view only these claims'}
    >
      <span className="tabular-nums font-semibold">{count}</span>
      <span>missing {label}</span>
      {delta !== 0 && (
        <span
          className={`text-[10px] font-bold tabular-nums ${active ? 'opacity-80' : (delta < 0 ? 'text-emerald-700' : 'text-red-700')}`}
          title={`Was ${baseline} when you opened this client`}
        >
          ({delta > 0 ? '+' : ''}{delta})
        </span>
      )}
      <span className="text-[10px] uppercase tracking-wider opacity-80">{active ? 'Clear' : 'View'}</span>
    </button>
  )
}

function ClaimsTable({ rows, showInsCo }: { rows: ClaimRow[]; showInsCo: boolean }) {
  if (rows.length === 0) {
    return <div className="py-10 text-center text-sm text-gray-400 italic">No claims match the current view.</div>
  }
  return (
    <div className="border border-gray-200 rounded-lg overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">MA#</th>
            <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Insured</th>
            {showInsCo && <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Ins. Co.</th>}
            <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Vehicle</th>
            <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">MA ACV</th>
            <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Ins. Co. Offer</th>
            <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Award</th>
            <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">OA Value</th>
            <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Δ Ins. Co.</th>
            <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Δ MA</th>
            <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Δ OA</th>
            <th className="px-2 py-2 w-10"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const violations = getViolations(r)
            const hasViolation = violations.length > 0
            return (
              <tr key={r.id} className={`border-b border-gray-100 last:border-b-0 hover:bg-gray-50 ${hasViolation ? 'bg-red-50/40 hover:bg-red-50/70' : ''}`}>
                <td className="px-3 py-2 font-mono text-xs text-gray-900 font-semibold" title={hasViolation ? `Data mistake: ${violations.join('; ')}` : undefined}>
                  {r.maNumber ?? '—'}
                </td>
                <td className="px-3 py-2 text-gray-800">{r.insuredName ?? <span className="text-gray-300">—</span>}</td>
                {showInsCo && <td className="px-3 py-2 text-gray-700 text-xs">{r.insuranceCompany ?? <span className="text-gray-300">—</span>}</td>}
                <td className="px-3 py-2 text-gray-700 text-xs">{r.vehicle ?? <span className="text-gray-300">—</span>}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-700">{fmtCurrencyOrDash(r.maAcv)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-700">{fmtCurrencyOrDash(r.insCoOffer)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-900 font-semibold">{fmtCurrencyOrDash(r.award)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-700">{fmtCurrencyOrDash(r.oaValue)}</td>
                <td className="px-3 py-2 text-right tabular-nums"><DeltaCell n={r.deltaInsCo} /></td>
                <td className="px-3 py-2 text-right tabular-nums"><DeltaCell n={r.deltaMA} /></td>
                <td className="px-3 py-2 text-right tabular-nums"><DeltaCell n={r.deltaOA} /></td>
                <td className="px-2 py-2 text-right">
                  <Link href={`/claims/${r.id}`} target="_blank" rel="noreferrer" className="text-gray-400 hover:text-blue-600" title="Open claim in new tab">
                    <ExternalLink className="w-4 h-4" />
                  </Link>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// Delta cells are sign-colored only (green for positive, red for negative).
// The "violation" / "data mistake" indicator lives at the row level — the
// whole row gets a red tint, and the MA# cell carries a hover tooltip
// listing which rule was violated — because the current mistake definition
// (MA ACV above BOTH Award and OA value) is a combined condition that
// can't be attributed to any single cell.
function DeltaCell({ n }: { n: number | null }) {
  if (n === null) return <span className="text-gray-300">—</span>
  const cls = n > 0 ? 'text-emerald-700 font-semibold' : n < 0 ? 'text-red-700 font-semibold' : 'text-gray-700'
  const sign = n > 0 ? '+' : ''
  return <span className={cls}>{sign}{fmtCurrency(n)}</span>
}

function fmtCurrency(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function fmtCurrencyOrDash(n: number | null): React.ReactNode {
  if (n === null) return <span className="text-gray-300">—</span>
  return fmtCurrency(n)
}

// Short "N seconds/minutes/hours ago" for the Updated-timestamp badge.
// Caps at hours — if someone leaves the page open longer than that, the
// precise time isn't the point; they should just hit Refresh.
function fmtAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  return `${h}h ago`
}
