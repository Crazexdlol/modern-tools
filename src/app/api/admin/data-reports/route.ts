import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

// Admin-only data-report aggregations. Returns both counts AND the
// underlying claim rows for each category so the client can show lists
// without a second round-trip (and so the printed report has data).
//
// Four categories:
//   received   — claims where created_at in [from, to]
//   closed     — claims where closed_at in [from, to] AND status='closed' AND close_reason != 'cancelled'
//   cancelled  — claims where closed_at in [from, to] AND status='closed' AND close_reason='cancelled'
//   overDays   — OPEN claims where (now - created_at) > overDaysThreshold days.
//                This is the ONLY category the phase filter applies to —
//                phases are meaningful for "stale open" bucketing (hide
//                Hold / Umpire / etc. so they don't look stale) but
//                irrelevant to received/closed/cancelled which are date-
//                bounded by the picked range.
//
// Query params:
//   from           ISO date string (required)
//   to             ISO date string (required)
//   overDays       number, default 60
//   includePhases  comma-separated phase codes (overDays only)
//   excludePhases  comma-separated phase codes to exclude (overDays only)

interface ClaimRow {
  id: string
  ma_number: string | null
  claim: { insuredName?: string | null } | null
  status: string | null
  close_reason: string | null
  created_at: string | null
  closed_at: string | null
  assigned_to: string | null
  status_phase: string | null
  status_phase_set_at: string | null
}

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

// Columns pulled for list rendering. Keep narrow — we're returning up to
// four lists per request and the response gets printed verbatim.
const LIST_COLS =
  'id, ma_number, claim, status, close_reason, created_at, closed_at, assigned_to, status_phase, status_phase_set_at'

function toListItem(row: ClaimRow): ClaimListItem {
  return {
    id: row.id,
    maNumber: row.ma_number ?? '',
    insuredName: (row.claim?.insuredName ?? '').trim(),
    status: row.status ?? 'open',
    closeReason: row.close_reason ?? null,
    createdAt: row.created_at ?? null,
    closedAt: row.closed_at ?? null,
    assignedTo: row.assigned_to ?? null,
    statusPhase: row.status_phase ?? null,
  }
}

export async function GET(request: NextRequest) {
  const { caller, errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse
  const activeCompanyId = caller!.activeCompanyId

  const { searchParams } = request.nextUrl
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  if (!from || !to) {
    return NextResponse.json({ error: '`from` and `to` query params are required' }, { status: 400 })
  }

  const overDaysThreshold = Math.max(1, parseInt(searchParams.get('overDays') ?? '60', 10) || 60)
  const includeRaw = searchParams.get('includePhases') ?? ''
  const excludeRaw = searchParams.get('excludePhases') ?? ''
  const includePhases = includeRaw ? includeRaw.split(',').map(s => s.trim()).filter(Boolean) : []
  const excludePhases = excludeRaw ? excludeRaw.split(',').map(s => s.trim()).filter(Boolean) : []

  const fromIso = new Date(from).toISOString()
  const toIso = new Date(to + 'T23:59:59.999Z').toISOString()
  const overDaysCutoff = new Date(Date.now() - overDaysThreshold * 24 * 60 * 60 * 1000).toISOString()

  const service = createServiceClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function applyPhaseFilter(query: any): any {
    if (includePhases.length > 0) {
      return query.in('status_phase', includePhases)
    }
    if (excludePhases.length > 0) {
      return query.not('status_phase', 'in', `(${excludePhases.join(',')})`)
    }
    return query
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function applyCompanyFilter(query: any): any {
    return activeCompanyId ? query.eq('company_id', activeCompanyId) : query
  }

  const isMigrationError = (code: string | undefined) => code === '42703' || code === '42P01'

  // Hard cap on list length per category to keep payloads sane. 500 open
  // claims over the threshold at any one time would be an unusual week
  // and the on-screen view / print output both get unwieldy past that.
  const LIST_LIMIT = 500

  try {
    const [receivedRes, closedRes, cancelledRes, overDaysRes] = await Promise.all([
      // 1. Received: created in range. No phase filter (all intake counts).
      applyCompanyFilter(
        service
          .from('acv_history')
          .select(LIST_COLS, { count: 'exact' })
          .gte('created_at', fromIso)
          .lte('created_at', toIso)
          .order('created_at', { ascending: false })
          .limit(LIST_LIMIT),
      ),

      // 2. Closed as COMPLETED in range. close_reason filter uses OR so
      // legacy rows (null close_reason) still count as "completed".
      applyCompanyFilter(
        service
          .from('acv_history')
          .select(LIST_COLS, { count: 'exact' })
          .gte('closed_at', fromIso)
          .lte('closed_at', toIso)
          .eq('status', 'closed')
          .or('close_reason.is.null,close_reason.eq.completed')
          .order('closed_at', { ascending: false })
          .limit(LIST_LIMIT),
      ),

      // 3. Cancelled in range (new). Explicit close_reason='cancelled'.
      applyCompanyFilter(
        service
          .from('acv_history')
          .select(LIST_COLS, { count: 'exact' })
          .gte('closed_at', fromIso)
          .lte('closed_at', toIso)
          .eq('status', 'closed')
          .eq('close_reason', 'cancelled')
          .order('closed_at', { ascending: false })
          .limit(LIST_LIMIT),
      ),

      // 4. Over X days old (OPEN only). Phase filter applies HERE and only here.
      applyCompanyFilter(
        applyPhaseFilter(
          service
            .from('acv_history')
            .select(LIST_COLS, { count: 'exact' })
            .neq('status', 'closed')
            .lt('created_at', overDaysCutoff)
            .order('created_at', { ascending: true })
            .limit(LIST_LIMIT),
        ),
      ),
    ])

    // Build each list, tolerating pre-migration 42703 for close_reason /
    // closed_at by returning an empty list for the affected category.
    const extract = (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      res: any,
    ): { count: number; items: ClaimListItem[] } => {
      if (res.error && !isMigrationError(res.error.code)) throw new Error(res.error.message)
      if (res.error && isMigrationError(res.error.code)) return { count: 0, items: [] }
      const rows = (res.data ?? []) as ClaimRow[]
      return { count: res.count ?? rows.length, items: rows.map(toListItem) }
    }

    const received = extract(receivedRes)
    const closed = extract(closedRes)
    const cancelled = extract(cancelledRes)
    const overDays = extract(overDaysRes)

    return NextResponse.json({
      received: received.count,
      closed: closed.count,
      cancelled: cancelled.count,
      overDays: overDays.count,
      lists: {
        received: received.items,
        closed: closed.items,
        cancelled: cancelled.items,
        overDays: overDays.items,
      },
      range: { from, to },
      overDaysThreshold,
      listLimit: LIST_LIMIT,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
