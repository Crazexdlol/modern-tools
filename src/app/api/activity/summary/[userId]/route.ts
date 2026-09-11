import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth/require-admin'
import { createServiceClient } from '@/lib/supabase/service'
import { laCalendarDate, laMinusDays } from '@/lib/activity/formatters'

export const runtime = 'nodejs'

// GET /api/activity/summary/[userId]
// Super-admin only. Returns raw daily rows for the last 180 days for one user.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const auth = await requireSuperAdmin()
  if (auth.errorResponse) return auth.errorResponse

  const { userId } = await params
  const today = laCalendarDate()
  const sixMonthsStart = laMinusDays(today, 180)

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

  if (rowsErr) {
    if (rowsErr.code === '42P01') {
      return NextResponse.json({
        userId, name: profile.name, email: profile.email,
        isActive: profile.is_active !== false,
        days: [],
        warning: 'user_activity_daily table not found',
      })
    }
    return NextResponse.json({ error: rowsErr.message }, { status: 500 })
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
  })
}
