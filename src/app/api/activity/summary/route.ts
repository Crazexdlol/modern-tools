import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth/require-admin'
import { createServiceClient } from '@/lib/supabase/service'
import { laCalendarDate, laMondayOf, laMonthStart, laMinusDays } from '@/lib/activity/formatters'

export const runtime = 'nodejs'

interface SummaryUser {
  userId: string
  name: string
  email: string
  isActive: boolean
  today: number
  thisWeek: number
  thisMonth: number
  last6Months: number
  lastActiveAt: string | null
}

// GET /api/activity/summary
// Super-admin only. Returns per-user totals over four rolling windows.
export async function GET() {
  const auth = await requireSuperAdmin()
  if (auth.errorResponse) return auth.errorResponse

  const today = laCalendarDate()
  const weekStart = laMondayOf(today)
  const monthStart = laMonthStart(today)
  const sixMonthsStart = laMinusDays(today, 180)

  const service = createServiceClient()

  // Fetch all profiles.
  const { data: profiles, error: profilesErr } = await service
    .from('profiles')
    .select('id, name, email, is_active')
    .order('name', { ascending: true })
  if (profilesErr) {
    return NextResponse.json({ error: profilesErr.message }, { status: 500 })
  }

  // Fetch daily rows for the 6-month window. May not exist if migration wasn't run.
  const { data: rows, error: rowsErr } = await service
    .from('user_activity_daily')
    .select('user_id, activity_date, active_seconds, last_tick_minute')
    .gte('activity_date', sixMonthsStart)

  if (rowsErr) {
    // 42P01 = relation does not exist. Return empty totals so the UI stays alive.
    if (rowsErr.code === '42P01') {
      const users: SummaryUser[] = (profiles ?? []).map(p => ({
        userId: p.id,
        name: p.name,
        email: p.email,
        isActive: p.is_active !== false,
        today: 0, thisWeek: 0, thisMonth: 0, last6Months: 0,
        lastActiveAt: null,
      }))
      return NextResponse.json({ users, warning: 'user_activity_daily table not found' })
    }
    return NextResponse.json({ error: rowsErr.message }, { status: 500 })
  }

  // Bucket rows per user.
  const byUser = new Map<string, { today: number; week: number; month: number; sixMonths: number; lastActive: string | null }>()
  for (const row of rows ?? []) {
    let b = byUser.get(row.user_id)
    if (!b) {
      b = { today: 0, week: 0, month: 0, sixMonths: 0, lastActive: null }
      byUser.set(row.user_id, b)
    }
    const secs = row.active_seconds ?? 0
    b.sixMonths += secs
    if (row.activity_date >= monthStart) b.month += secs
    if (row.activity_date >= weekStart) b.week += secs
    if (row.activity_date === today) b.today += secs
    if (row.last_tick_minute && (!b.lastActive || row.last_tick_minute > b.lastActive)) {
      b.lastActive = row.last_tick_minute
    }
  }

  const users: SummaryUser[] = (profiles ?? []).map(p => {
    const b = byUser.get(p.id)
    return {
      userId: p.id,
      name: p.name,
      email: p.email,
      isActive: p.is_active !== false,
      today: b?.today ?? 0,
      thisWeek: b?.week ?? 0,
      thisMonth: b?.month ?? 0,
      last6Months: b?.sixMonths ?? 0,
      lastActiveAt: b?.lastActive ?? null,
    }
  })

  // Default sort: most recently active first, nulls last.
  users.sort((a, b) => {
    if (a.lastActiveAt && b.lastActiveAt) return b.lastActiveAt.localeCompare(a.lastActiveAt)
    if (a.lastActiveAt) return -1
    if (b.lastActiveAt) return 1
    return a.name.localeCompare(b.name)
  })

  return NextResponse.json({ users })
}
