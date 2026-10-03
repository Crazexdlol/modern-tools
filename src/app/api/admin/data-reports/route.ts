import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

// Admin-only data-report aggregations.
// Returns three counts:
//   received     — claims where created_at falls in [from, to]
//   closed       — claims where closed_at falls in [from, to] AND status = 'closed'
//   overDays     — OPEN claims where (now - created_at) > overDaysThreshold days
//
// Query params:
//   from           ISO date string (required)
//   to             ISO date string (required)
//   overDays       number, default 60
//   includePhases  comma-separated phase codes; empty = all
//   excludePhases  comma-separated phase codes to exclude; empty = none

export async function GET(request: NextRequest) {
  const { errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

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

  // Convert YYYY-MM-DD to UTC start/end timestamps.
  const fromIso = new Date(from).toISOString()
  // End of the "to" day at 23:59:59.999 UTC.
  const toIso = new Date(to + 'T23:59:59.999Z').toISOString()

  // Cut-off for "over X days old": claims created before this timestamp.
  const overDaysCutoff = new Date(Date.now() - overDaysThreshold * 24 * 60 * 60 * 1000).toISOString()

  const service = createServiceClient()

  function applyPhaseFilter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): any {
    if (includePhases.length > 0) {
      return query.in('status_phase', includePhases)
    }
    if (excludePhases.length > 0) {
      // supabase-js .not('col', 'in', '(a,b,c)') syntax for array exclusion.
      return query.not('status_phase', 'in', `(${excludePhases.join(',')})`)
    }
    return query
  }

  try {
    const [receivedRes, closedRes, overDaysRes] = await Promise.all([
      // 1. Claims received: created_at in [from, to]
      applyPhaseFilter(
        service
          .from('acv_history')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', fromIso)
          .lte('created_at', toIso),
      ),

      // 2. Claims closed: closed_at in [from, to] AND status = 'closed'
      applyPhaseFilter(
        service
          .from('acv_history')
          .select('id', { count: 'exact', head: true })
          .gte('closed_at', fromIso)
          .lte('closed_at', toIso)
          .eq('status', 'closed'),
      ),

      // 3. Open claims over X days old: status != 'closed' AND created_at < cutoff
      applyPhaseFilter(
        service
          .from('acv_history')
          .select('id', { count: 'exact', head: true })
          .neq('status', 'closed')
          .lt('created_at', overDaysCutoff),
      ),
    ])

    // Pre-migration safety: closed_at column may not exist (42703) or the
    // table may not exist (42P01). Return 0 for that metric instead of 500ing.
    const isMigrationError = (code: string | undefined) =>
      code === '42703' || code === '42P01'

    if (receivedRes.error && !isMigrationError(receivedRes.error.code)) {
      return NextResponse.json({ error: receivedRes.error.message }, { status: 500 })
    }
    if (overDaysRes.error && !isMigrationError(overDaysRes.error.code)) {
      return NextResponse.json({ error: overDaysRes.error.message }, { status: 500 })
    }

    return NextResponse.json({
      received: receivedRes.count ?? 0,
      closed: isMigrationError(closedRes.error?.code) ? 0 : (closedRes.count ?? 0),
      overDays: isMigrationError(overDaysRes.error?.code) ? 0 : (overDaysRes.count ?? 0),
      range: { from, to },
      overDaysThreshold,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
