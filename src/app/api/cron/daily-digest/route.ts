import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { buildDailyDigest, getDailyDigestRecipients, sendDailyDigest } from '@/lib/email/claim-notifications'
import { isWeekendET } from '@/lib/business-days'
import { createServiceClient } from '@/lib/supabase/service'
import { runStatusRequests, type RunResult } from '@/lib/status-requests/run'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Daily cron. Fires at 00:00 UTC = 5pm PDT (summer) / 4pm PST (winter).
// Pacific DST shifts local time by one hour between April and October.
//
// Two phases, independent weekend handling:
//   1. Digest email — WEEKDAYS ONLY. Skipped when ET weekday is Sat or Sun
//      (at 00:00 UTC that's already 20:00 ET of the previous day, so
//      the Sat/Sun check prevents the Sun-morning and Mon-morning emails).
//      Saturday morning digest (summarising Friday) still fires.
//   2. Status requests — EVERY DAY (shared with the dedicated
//      /api/cron/status-requests cron). Weekends count the same as weekdays
//      for the silence clock, by design (see src/lib/status-requests/run.ts).
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  const header = request.headers.get('authorization') ?? ''
  const provided = header.startsWith('Bearer ') ? header.slice(7) : ''
  const want = Buffer.from(secret)
  const have = Buffer.from(provided)
  if (want.length !== have.length || !timingSafeEqual(want, have)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const force = url.searchParams.get('force') === '1'
  const isWeekend = !force && isWeekendET(new Date())

  // --- Phase 1: Digest email (weekdays only) ---
  let digestResult: {
    ran: boolean
    sentTo: number
    opened: number
    delivered: number
    skipped?: string
  } = { ran: false, sentTo: 0, opened: 0, delivered: 0, skipped: 'weekend' }

  if (!isWeekend) {
    const now = new Date()
    const start = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const dateLabel = now.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'America/Los_Angeles',
    })

    const [digest, recipients] = await Promise.all([
      buildDailyDigest(start.toISOString(), now.toISOString(), dateLabel),
      getDailyDigestRecipients(),
    ])

    const digestSent = recipients.length > 0
    if (digestSent) await sendDailyDigest(digest, recipients)

    digestResult = {
      ran: true,
      sentTo: digestSent ? recipients.length : 0,
      opened: digest.opened.length,
      delivered: digest.delivered.length,
      skipped: digestSent ? undefined : 'No digest recipients configured',
    }
  }

  // --- Phase 2: Status requests (every day) ---
  // Isolated so a status-request failure doesn't retroactively 500 the digest
  // step above.
  let statusRequests: RunResult | { error: string }
  try {
    statusRequests = await runStatusRequests(createServiceClient())
  } catch (err) {
    statusRequests = { error: err instanceof Error ? err.message : String(err) }
  }

  return NextResponse.json({
    ok: true,
    digest: digestResult,
    statusRequests,
  })
}
