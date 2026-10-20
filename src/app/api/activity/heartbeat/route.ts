import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/service'
import { laCalendarDate } from '@/lib/activity/formatters'

export const runtime = 'nodejs'

// Session boundary: a heartbeat arriving more than SESSION_GAP_MS after the
// previous session's ended_at starts a new session. Matches the IDLE_MS
// client gate (5 min) so a user who goes idle for exactly the client-gate
// period is treated as the start of a new session when they come back.
const SESSION_GAP_MS = 5 * 60 * 1000

// POST /api/activity/heartbeat
// Credits the caller with one 60-second tick against today's LA-calendar
// activity_date, deduped per-minute across tabs. Silent — returns 204 on
// success and on almost every error path. Called by the client every 60s
// from a focused, recently-interacted tab (see ActivityHeartbeat).
//
// Also writes two side tables (Henry 2026-10-15 — ticks + sessions migration):
//   - user_activity_ticks (user, minute) for hourly / per-day timeline.
//   - user_sessions (user, started_at, ended_at, active_seconds): extends
//     the latest open session if within SESSION_GAP_MS, else starts a new
//     one. Lets the admin view compute avg session length and sessions/day.
export async function POST() {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
    )
    const { data: { user } } = await supabase.auth.getUser()
    // Return 401 for unauth callers so this endpoint isn't a silent probe
    // for whether the service is up. The client tolerates errors.
    if (!user) return NextResponse.json(null, { status: 401 })

    const activityDate = laCalendarDate()
    // Minute bucket: current UTC time truncated to the minute.
    const now = new Date()
    now.setUTCSeconds(0, 0)
    const tickMinuteIso = now.toISOString()

    const service = createServiceClient()

    // supabase-js can't express the "WHERE last_tick_minute < EXCLUDED"
    // guard on an atomic upsert, so we do read → compare-and-set. The CAS
    // uses .eq('last_tick_minute', <prev>) so a racing tab that updated
    // between our select and update sees 0 rows affected — safe dedup.
    const { data: existing } = await service
      .from('user_activity_daily')
      .select('active_seconds, last_tick_minute')
      .eq('user_id', user.id)
      .eq('activity_date', activityDate)
      .maybeSingle()

    let credited = false

    if (!existing) {
      // Insert with 60s. If a race inserts first, this errors — swallow.
      const { error: insertErr } = await service
        .from('user_activity_daily')
        .insert({
          user_id: user.id,
          activity_date: activityDate,
          active_seconds: 60,
          last_tick_minute: tickMinuteIso,
        })
      if (insertErr && insertErr.code !== '23505') {
        console.warn('[heartbeat] insert failed', insertErr.message)
      } else {
        credited = insertErr === null
      }
    } else if (existing.last_tick_minute && existing.last_tick_minute >= tickMinuteIso) {
      // Dedup: another tab already credited this minute. Not credited by us.
      credited = false
    } else {
      // Compare-and-set update. Filter on the OLD last_tick_minute so a
      // racing tab that updated between our select and update loses.
      const casQuery = service
        .from('user_activity_daily')
        .update({
          active_seconds: existing.active_seconds + 60,
          last_tick_minute: tickMinuteIso,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .eq('activity_date', activityDate)
        .select('user_id')  // ask Postgres to return the touched row so we can detect race-loss

      const casRes = existing.last_tick_minute
        ? await casQuery.eq('last_tick_minute', existing.last_tick_minute)
        : await casQuery.is('last_tick_minute', null)
      if (casRes.error) console.warn('[heartbeat] update failed', casRes.error.message)
      credited = (casRes.data?.length ?? 0) > 0
    }

    // Only touch the side tables (ticks / sessions) when we actually credited
    // this minute — avoids a losing-tab race double-recording the same tick.
    if (credited) {
      // 1. Insert the tick. Dup-key errors (23505) swallowed — belt-and-
      //    suspenders in case a second CAS slips through on the same minute.
      const { error: tickErr } = await service
        .from('user_activity_ticks')
        .insert({ user_id: user.id, tick_minute: tickMinuteIso })
      if (tickErr && tickErr.code !== '23505') {
        console.warn('[heartbeat] tick insert failed', tickErr.message)
      }

      // 2. Session: extend the latest open session if gap <= SESSION_GAP_MS,
      //    else start a new one.
      const { data: latest } = await service
        .from('user_sessions')
        .select('id, ended_at, active_seconds')
        .eq('user_id', user.id)
        .order('ended_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const nowMs = now.getTime()
      const latestEndMs = latest ? new Date(latest.ended_at as string).getTime() : -Infinity
      const gap = nowMs - latestEndMs
      if (latest && gap <= SESSION_GAP_MS) {
        const { error: extErr } = await service
          .from('user_sessions')
          .update({
            ended_at: tickMinuteIso,
            active_seconds: (latest.active_seconds as number) + 60,
          })
          .eq('id', latest.id as string)
        if (extErr) console.warn('[heartbeat] session extend failed', extErr.message)
      } else {
        const { error: newErr } = await service
          .from('user_sessions')
          .insert({
            user_id: user.id,
            started_at: tickMinuteIso,
            ended_at: tickMinuteIso,
            active_seconds: 60,
          })
        if (newErr) console.warn('[heartbeat] session insert failed', newErr.message)
      }
    }

    return new NextResponse(null, { status: 204 })
  } catch (e) {
    console.warn('[heartbeat] unexpected', e instanceof Error ? e.message : String(e))
    return new NextResponse(null, { status: 204 })
  }
}
