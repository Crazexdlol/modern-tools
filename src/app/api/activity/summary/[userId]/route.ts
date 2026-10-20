import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth/require-admin'
import { createServiceClient } from '@/lib/supabase/service'
import { laCalendarDate, laMinusDays } from '@/lib/activity/formatters'

export const runtime = 'nodejs'

// GET /api/activity/summary/[userId]?date=YYYY-MM-DD
// Super-admin only. Returns:
//   - days: raw daily rows for the last 180 days (for the 30/90-day chart)
//   - sessions: last 30 days of session rows (started_at, ended_at, active_seconds)
//   - ticksForDate: minute-granularity ticks for the requested `date` (defaults
//     to today in LA calendar). Powers the hourly timeline view.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const auth = await requireSuperAdmin()
  if (auth.errorResponse) return auth.errorResponse

  const { userId } = await params
  const today = laCalendarDate()
  const sixMonthsStart = laMinusDays(today, 180)
  const thirtyDaysAgoIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const url = new URL(req.url)
  const requestedDate = url.searchParams.get('date') || today

  // Build LA-calendar midnight bounds for the requested date so ticks can
  // be filtered to that specific day. Date is YYYY-MM-DD in LA — treat as
  // the LA-midnight-to-next-LA-midnight range. We approximate with a UTC
  // window that spans at least that LA day (±2h padding is overkill but
  // avoids off-by-one on DST transitions).
  const dayStart = new Date(`${requestedDate}T00:00:00-08:00`)
  const dayEnd = new Date(dayStart.getTime() + 26 * 60 * 60 * 1000)

  const service = createServiceClient()

  const { data: profile, error: profileErr } = await service
    .from('profiles')
    .select('id, name, email, is_active')
    .eq('id', userId)
    .maybeSingle()
  if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 500 })
  if (!profile) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const { data: rows, error: rowsErr } = await service
    .from('user_activity_daily')
    .select('activity_date, active_seconds, last_tick_minute')
    .eq('user_id', userId)
    .gte('activity_date', sixMonthsStart)
    .order('activity_date', { ascending: true })

  if (rowsErr && rowsErr.code !== '42P01') {
    return NextResponse.json({ error: rowsErr.message }, { status: 500 })
  }

  // Optional (migration might not be run yet). Both return [] on 42P01.
  const { data: sessionRows, error: sessErr } = await service
    .from('user_sessions')
    .select('started_at, ended_at, active_seconds')
    .eq('user_id', userId)
    .gte('started_at', thirtyDaysAgoIso)
    .order('started_at', { ascending: false })
  if (sessErr && sessErr.code !== '42P01') {
    console.warn('[summary/userId] sessions query failed:', sessErr.message)
  }

  const { data: tickRows, error: tickErr } = await service
    .from('user_activity_ticks')
    .select('tick_minute')
    .eq('user_id', userId)
    .gte('tick_minute', dayStart.toISOString())
    .lt('tick_minute', dayEnd.toISOString())
    .order('tick_minute', { ascending: true })
  if (tickErr && tickErr.code !== '42P01') {
    console.warn('[summary/userId] ticks query failed:', tickErr.message)
  }

  return NextResponse.json({
    userId,
    name: profile.name,
    email: profile.email,
    isActive: profile.is_active !== false,
    days: (rows ?? []).map(r => ({
      date: r.activity_date,
      activeSeconds: r.active_seconds ?? 0,
      lastTickAt: r.last_tick_minute,
    })),
    sessions: (sessionRows ?? []).map(s => ({
      startedAt: s.started_at,
      endedAt: s.ended_at,
      activeSeconds: s.active_seconds ?? 0,
    })),
    ticksForDate: requestedDate,
    ticks: (tickRows ?? []).map(t => t.tick_minute as string),
    warning: rowsErr?.code === '42P01' ? 'user_activity_daily table not found' : undefined,
  })
}
