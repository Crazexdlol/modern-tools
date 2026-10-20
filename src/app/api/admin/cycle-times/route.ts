import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

// Admin-only cycle-time aggregations. Reads the claim_stage_events ledger
// and rolls it up into:
//   - stageAverages: avg duration (ms) per stage across all events
//   - appraiserTotals: sum of time each profile spent as assignee
//   - claimTotals: per-claim totals, excluding Payment stage
// All durations are returned as milliseconds; the UI formats to days/hours.
//
// NOTE: We don't try to compute live elapsed time for still-open events on
// the server. The UI adds `(now - entered_at)` to any null-exited_at row
// so counters tick forward in real time without round-tripping.

type Event = {
  id: number
  claim_id: string
  stage: 'main' | 'qc' | 'billing_delivery' | 'payment'
  assigned_to: string | null
  entered_at: string
  exited_at: string | null
}

export async function GET() {
  const { caller, errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const service = createServiceClient()

  // Pull every event — single query. At ~7 events per claim × 500 claims
  // that's ~3,500 rows, trivially small for in-memory aggregation.
  const { data: events, error } = await service
    .from('claim_stage_events')
    .select('id, claim_id, stage, assigned_to, entered_at, exited_at')
    .order('entered_at', { ascending: true })
  if (error) {
    // Pre-migration safety: table doesn't exist yet → return empty data.
    if (error.code === '42P01') {
      return NextResponse.json({
        stageAverages: {},
        appraiserTotals: [],
        claimTotals: [],
        trackingStartedAt: null,
      })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Also fetch MA numbers for per-claim rendering + profile names for the
  // appraiser leaderboard. Scoped by company so cross-tenant admins only see
  // their own numbers.
  const [claimsRes, profilesRes] = await Promise.all([
    service
      .from('acv_history')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select('id, ma_number, status, company_id, cycle_tracked_from' as any)
      .eq('company_id', caller!.activeCompanyId ?? '')
      // Fallback: if company_id scoping fails (pre-migration row), the
      // SELECT above returns nothing — the UI shows what it can.
      ,
    service.from('profiles').select('id, name, email'),
  ])
  // Cycle-time scoping: only count claims that opted into tracking (via
  // the cycle_tracked_from column — new claims from 2026-10-12 onward).
  // Legacy / NULL claims are excluded entirely so pre-reset time doesn't
  // leak back into aggregates after the reset.
  //
  // Pre-migration safety: if cycle_tracked_from doesn't exist yet, the
  // SELECT returns rows without that field — treated as !cycle_tracked_from
  // and the whole aggregation reads empty (safer than displaying stale
  // pre-migration numbers).
  const claimRowsRaw = (claimsRes.data ?? []) as unknown as {
    id: string
    ma_number: string | null
    status: string
    cycle_tracked_from?: string | null
  }[]
  const claimRows = claimRowsRaw.filter(c => !!c.cycle_tracked_from)
  const claimIds = new Set(claimRows.map(c => c.id))
  const claimMeta = new Map(claimRows.map(c => [c.id, c]))
  const profileMeta = new Map(
    (profilesRes.data ?? []).map(p => [p.id as string, (p.name as string) || (p.email as string)]),
  )

  const scoped = (events ?? []).filter(e => claimIds.has(e.claim_id)) as Event[]
  const nowMs = Date.now()
  const durMs = (e: Event) => {
    const start = new Date(e.entered_at).getTime()
    const end = e.exited_at ? new Date(e.exited_at).getTime() : nowMs
    return Math.max(0, end - start)
  }

  // Per-stage averages.
  const stageTotals: Record<string, { total: number; count: number }> = {}
  for (const e of scoped) {
    const d = durMs(e)
    const s = stageTotals[e.stage] ?? { total: 0, count: 0 }
    s.total += d
    s.count += 1
    stageTotals[e.stage] = s
  }
  const stageAverages: Record<string, { avgMs: number; count: number; totalMs: number }> = {}
  for (const [k, v] of Object.entries(stageTotals)) {
    stageAverages[k] = { avgMs: v.count ? Math.round(v.total / v.count) : 0, count: v.count, totalMs: v.total }
  }

  // Per-appraiser totals (only events where someone is assigned).
  const appraiserTotalsMap: Map<string, { ms: number; events: number }> = new Map()
  for (const e of scoped) {
    if (!e.assigned_to) continue
    const cur = appraiserTotalsMap.get(e.assigned_to) ?? { ms: 0, events: 0 }
    cur.ms += durMs(e)
    cur.events += 1
    appraiserTotalsMap.set(e.assigned_to, cur)
  }
  const appraiserTotals = Array.from(appraiserTotalsMap.entries())
    .map(([userId, v]) => ({
      userId,
      name: profileMeta.get(userId) ?? '(removed user)',
      ms: v.ms,
      events: v.events,
    }))
    .sort((a, b) => b.ms - a.ms)

  // Per-claim totals (exclude Payment stage from the headline total).
  const perClaim: Map<string, { total: number; payment: number; stages: Record<string, number> }> = new Map()
  for (const e of scoped) {
    const cur = perClaim.get(e.claim_id) ?? { total: 0, payment: 0, stages: {} }
    const d = durMs(e)
    cur.stages[e.stage] = (cur.stages[e.stage] ?? 0) + d
    if (e.stage === 'payment') cur.payment += d
    else cur.total += d
    perClaim.set(e.claim_id, cur)
  }
  const claimTotals = Array.from(perClaim.entries())
    .map(([claimId, v]) => {
      const meta = claimMeta.get(claimId)
      return {
        claimId,
        maNumber: meta?.ma_number ?? '(no MA #)',
        status: meta?.status ?? 'open',
        totalMs: v.total,
        paymentMs: v.payment,
        stages: v.stages,
      }
    })
    .sort((a, b) => b.totalMs - a.totalMs)

  // Earliest event timestamp = when tracking effectively started (migration
  // + first transition). Lets the UI show "Tracking since <date>".
  const trackingStartedAt = scoped.length > 0 ? scoped[0].entered_at : null

  return NextResponse.json({
    stageAverages,
    appraiserTotals,
    claimTotals,
    trackingStartedAt,
  })
}
