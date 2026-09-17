import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/service'
import { laCalendarDate } from '@/lib/activity/formatters'

export const runtime = 'nodejs'

// POST /api/activity/heartbeat
// Credits the caller with one 60-second tick against today's LA-calendar
// activity_date, deduped per-minute across tabs. Silent — returns 204 on
// success and on almost every error path. Called by the client every 60s
// from a focused, recently-interacted tab (see ActivityHeartbeat).
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
      }
      return new NextResponse(null, { status: 204 })
    }

    // Dedup: if this minute has already been credited by another tab,
    // last_tick_minute >= our tickMinuteIso — no-op.
    if (existing.last_tick_minute && existing.last_tick_minute >= tickMinuteIso) {
      return new NextResponse(null, { status: 204 })
    }

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

    const { error: updErr } = existing.last_tick_minute
      ? await casQuery.eq('last_tick_minute', existing.last_tick_minute)
      : await casQuery.is('last_tick_minute', null)

    if (updErr) console.warn('[heartbeat] update failed', updErr.message)
    return new NextResponse(null, { status: 204 })
  } catch (e) {
    console.warn('[heartbeat] unexpected', e instanceof Error ? e.message : String(e))
    return new NextResponse(null, { status: 204 })
  }
}
