import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { createServiceClient } from '@/lib/supabase/service'
import { businessDaysBetween, isWeekendET } from '@/lib/business-days'

export const runtime = 'nodejs'

// Business-day thresholds:
//   FIRST: 2 business days (= 48 business hours) before the first nag
//   REPEAT: 1 business day (= 24 business hours) between repeat nags
const FIRST_NAG_BUSINESS_DAYS = 2
const REPEAT_NAG_BUSINESS_DAYS = 1

const NAG_BODY =
  'This is an automated status request from HamsPortal. Please post a quick ' +
  'update on this claim (what’s next, any blockers, expected close date).'

interface ClaimRow {
  id: string
  ma_number: string | null
  assigned_to: string | null
  assigned_at: string | null
  last_status_request_at: string | null
}

interface LatestApprMsgRow {
  claim_id: string
  created_at: string
}

interface ProfileRow {
  id: string
  name: string | null
  email: string
  auto_status_requests_override?: boolean | null
}

// GET /api/cron/status-requests
//
// Called by Vercel Cron once a day. Skips weekends in-code so a daily
// schedule still works on Vercel Hobby (which only permits daily crons).
//
// Auth: requires `Authorization: Bearer <CRON_SECRET>` header. Vercel's
// built-in cron runner sends exactly this header when the env var is set.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  const auth = request.headers.get('authorization') ?? ''
  // Constant-time compare so a timing side-channel can't leak the secret
  // over many requests. Fast-return on length mismatch is fine (the length
  // itself isn't the sensitive value).
  const expected = Buffer.from(`Bearer ${secret}`)
  const actual = Buffer.from(auth)
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  if (isWeekendET(now)) {
    return NextResponse.json({ sent: 0, skipped: 'weekend' })
  }

  const service = createServiceClient()

  // 1. Fetch every open + assigned claim.
  const { data: claims, error: claimErr } = await service
    .from('acv_history')
    .select('id, ma_number, assigned_to, assigned_at, last_status_request_at')
    .eq('status', 'open')
    .not('assigned_to', 'is', null)
  if (claimErr) return NextResponse.json({ error: claimErr.message }, { status: 500 })
  const openClaims = (claims as ClaimRow[]) ?? []
  if (openClaims.length === 0) return NextResponse.json({ sent: 0, checked: 0 })

  const claimIds = openClaims.map(c => c.id)

  // 3. For each claim, find the timestamp of the LATEST message where the
  //    sender is the currently-assigned appraiser AND it's not an auto
  //    request. That's the timer anchor when it exists; otherwise
  //    assigned_at is the anchor.
  //
  //    We can't do a per-row correlated subquery cleanly in supabase-js, so
  //    we pull all appraiser-authored messages for these claims in one
  //    round-trip and reduce client-side. Volume is bounded (few thousand
  //    messages at worst for this app).
  const { data: msgs, error: msgErr } = await service
    .from('messages')
    .select('claim_id, sender_id, created_at')
    .in('claim_id', claimIds)
    .eq('is_auto_request', false)
    .order('created_at', { ascending: false })
  if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 })

  const latestApprMsg = new Map<string, string>() // claim_id -> created_at ISO
  for (const m of (msgs as LatestApprMsgRow[] & Array<{ sender_id: string | null }>) ?? []) {
    const claim = openClaims.find(c => c.id === m.claim_id)
    if (!claim) continue
    if (m.sender_id !== claim.assigned_to) continue
    if (latestApprMsg.has(m.claim_id)) continue // ordered desc — first hit is latest
    latestApprMsg.set(m.claim_id, m.created_at)
  }

  // 4. Fetch appraiser display names + per-user overrides.
  const uniqueAssignees = Array.from(new Set(openClaims.map(c => c.assigned_to!).filter(Boolean)))
  const { data: profs } = await service
    .from('profiles')
    .select('id, name, email, auto_status_requests_override')
    .in('id', uniqueAssignees)
  const profMap = new Map<string, ProfileRow>()
  for (const p of (profs as ProfileRow[]) ?? []) profMap.set(p.id, p)

  // 5. Decide which claims need a nag.
  interface Nag {
    claimId: string
    recipientId: string
    recipientName: string
  }
  const nags: Nag[] = []
  for (const c of openClaims) {
    if (!c.assigned_to) continue

    // Per-user override is the source of truth after 2026-08-29 migration.
    // Null (never explicitly set) is treated as OFF.
    const effectiveEnabled = profMap.get(c.assigned_to)?.auto_status_requests_override === true
    if (!effectiveEnabled) continue

    const anchorIso = latestApprMsg.get(c.id) ?? c.assigned_at
    if (!anchorIso) continue // no anchor at all (very old row, backfill skipped) — leave alone
    const anchor = new Date(anchorIso)

    const businessDaysSinceAnchor = businessDaysBetween(anchor, now)

    // Not overdue for a first nag yet.
    if (businessDaysSinceAnchor < FIRST_NAG_BUSINESS_DAYS) continue

    // Overdue. If we've never sent one, send. Otherwise check repeat cadence.
    if (c.last_status_request_at) {
      const daysSinceLastNag = businessDaysBetween(new Date(c.last_status_request_at), now)
      if (daysSinceLastNag < REPEAT_NAG_BUSINESS_DAYS) continue
      // ALSO make sure the appraiser hasn't replied since the last nag.
      // If they did (latestApprMsg > last_status_request_at), the reference
      // point moved forward and we've already re-evaluated above via the
      // anchor recalc — no extra check needed.
    }

    const p = profMap.get(c.assigned_to)
    const recipientName = p?.name || p?.email || 'Assigned Appraiser'
    nags.push({ claimId: c.id, recipientId: c.assigned_to, recipientName })
  }

  if (nags.length === 0) return NextResponse.json({ sent: 0, checked: openClaims.length })

  // 6. Insert messages + update last_status_request_at. Best-effort per
  //    claim (one failure shouldn't kill the whole batch).
  const nowIso = now.toISOString()
  let sent = 0
  const errors: Array<{ claimId: string; error: string }> = []

  for (const n of nags) {
    const id = crypto.randomUUID()
    const { error: insertErr } = await service.from('messages').insert({
      id,
      claim_id: n.claimId,
      sender_id: null,
      sender_name: 'HamsPortal (Auto)',
      recipient_ids: [n.recipientId],
      recipient_names: [n.recipientName],
      body: NAG_BODY,
      is_auto_request: true,
    })
    if (insertErr) { errors.push({ claimId: n.claimId, error: insertErr.message }); continue }
    const { error: updateErr } = await service
      .from('acv_history')
      .update({ last_status_request_at: nowIso })
      .eq('id', n.claimId)
    if (updateErr) { errors.push({ claimId: n.claimId, error: updateErr.message }); continue }
    sent++
  }

  return NextResponse.json({
    sent,
    checked: openClaims.length,
    errors: errors.length > 0 ? errors : undefined,
  })
}
