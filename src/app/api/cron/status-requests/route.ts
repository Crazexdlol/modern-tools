import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { createServiceClient } from '@/lib/supabase/service'
import { runStatusRequests } from '@/lib/status-requests/run'

export const runtime = 'nodejs'

// GET /api/cron/status-requests
//
// Called by Vercel Cron once a day (14:00 UTC = 7am PT weekdays).
// Delegates to runStatusRequests() which is also called from the daily-digest
// cron — both crons sharing a single logic path gives us two shots per day
// and resilience if one Vercel cron ever hiccups.
//
// Auth: requires `Authorization: Bearer <CRON_SECRET>` header. Vercel's
// built-in cron runner sends exactly this header when the env var is set.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  const auth = request.headers.get('authorization') ?? ''
  const expected = Buffer.from(`Bearer ${secret}`)
  const actual = Buffer.from(auth)
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runStatusRequests(createServiceClient())
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
