// Shared status-request runner. Called from both /api/cron/status-requests
// (dedicated daily cron at 14:00 UTC) and /api/cron/daily-digest (midnight
// UTC). Running from two different crons gives us two shots per day — if
// one Vercel cron ever hiccups, the other picks it up. The logic is
// idempotent per-claim because every action advances state
// (`status_request_count`, `last_status_request_at`, or `status_lockout_at`)
// so a double-fire within the same day no-ops after the first.
//
// See supabase/migration-status-lockout.sql for the DB side.

import type { SupabaseClient } from '@supabase/supabase-js'
import { businessDaysBetween, isWeekendET } from '@/lib/business-days'
import { notifyClaimMessage } from '@/lib/email/claim-notifications'

// Default thresholds, in BUSINESS DAYS from anchor = latest non-auto
// appraiser message, or assigned_at if they've never posted. Henry 2026-10-17
// switched from calendar-day accounting after receiving Saturday nags — the
// clock now pauses over Sat/Sun and resumes Monday. A Thursday-silent
// anchor hits the 3-business-day threshold the following Tuesday.
//   Business day 3 silent → 1st nag  (count 0 → 1)
//   Business day 4 silent → 2nd nag  (count 1 → 2)
//   Business day 5 silent → LOCKOUT  (count stays at 2; status_lockout_at = now)
const FIRST_NAG_DAYS = 3
const REPEAT_NAG_DAYS = 1
const MAX_NAGS_BEFORE_LOCKOUT = 2

// Paused-phase cadence (Henry 2026-10-15). Claims whose status_phase pauses
// cycle time (Hold / Pending Repairs / Pending Information / Rough Numbers)
// should NOT be nagged on the fast 3-day cadence — these are known paused
// states where silence is expected. Switch to business days + a longer
// first-nag threshold so the appraiser only gets pinged roughly every two
// work weeks, then the normal +1 / +1 pattern for the second nag + lockout.
//   Business day 10 silent → 1st nag
//   Business day 11 silent → 2nd nag
//   Business day 12 silent → LOCKOUT
const PAUSED_FIRST_NAG_BUSINESS_DAYS = 10
const PAUSED_REPEAT_NAG_BUSINESS_DAYS = 1

const NAG_BODY = 'Please post a quick update on this claim.'
const pausedNagBody = (phaseLabel: string) =>
  `This claim has been phased as "${phaseLabel}" for 10+ business days. Please confirm the status is still accurate and post an update.`

interface ClaimRow {
  id: string
  ma_number: string | null
  assigned_to: string | null
  assigned_at: string | null
  last_status_request_at: string | null
  status_request_count: number | null
  status_lockout_at: string | null
  company_id: string | null
  status_phase: string | null
}

interface LatestApprMsgRow {
  claim_id: string
  created_at: string
  sender_id: string | null
}

interface ProfileRow {
  id: string
  name: string | null
  email: string
  auto_status_requests_override?: boolean | null
}

export interface RunResult {
  sent: number
  locked: number
  checked: number
  skipped?: string
  errors?: Array<{ claimId: string; error: string }>
}

// Run one pass of the status-request logic. The caller supplies a service-
// role Supabase client. Belt-and-suspenders weekend guard: Vercel crons fire
// every day of the week, so the first thing we do is bail if today is Sat
// or Sun in ET. The business-days accounting below would also prevent any
// weekend sends on its own, but the explicit skip makes the intent obvious
// and short-circuits all the SQL work for free. Henry 2026-10-17.
export async function runStatusRequests(service: SupabaseClient): Promise<RunResult> {
  const now = new Date()
  if (isWeekendET(now)) {
    return { sent: 0, locked: 0, checked: 0, skipped: 'weekend' }
  }

  const { data: claims, error: claimErr } = await service
    .from('acv_history')
    .select('id, ma_number, assigned_to, assigned_at, last_status_request_at, status_request_count, status_lockout_at, company_id, status_phase')
    .eq('status', 'open')
    .not('assigned_to', 'is', null)
  if (claimErr) throw new Error(claimErr.message)
  const openClaims = (claims as unknown as ClaimRow[]) ?? []
  if (openClaims.length === 0) return { sent: 0, locked: 0, checked: 0 }

  // Load paused status-phase configs once per run. A phase that pauses
  // cycle time also pauses the fast-cadence nag track and switches to the
  // business-days / 10-day cadence (Henry 2026-10-15).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: phaseRows } = await service
    .from('status_phase_configs')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .select('code, label, pauses_cycle_time' as any)
  const pausedPhaseLabels = new Map<string, string>()
  for (const p of ((phaseRows ?? []) as unknown as { code: string; label: string; pauses_cycle_time: boolean }[])) {
    if (p.pauses_cycle_time === true) pausedPhaseLabels.set(p.code, p.label)
  }

  const claimIds = openClaims.map(c => c.id)

  const { data: msgs, error: msgErr } = await service
    .from('messages')
    .select('claim_id, sender_id, created_at')
    .in('claim_id', claimIds)
    .eq('is_auto_request', false)
    .order('created_at', { ascending: false })
  if (msgErr) throw new Error(msgErr.message)

  const latestApprMsg = new Map<string, string>()
  for (const m of (msgs as unknown as LatestApprMsgRow[]) ?? []) {
    const claim = openClaims.find(c => c.id === m.claim_id)
    if (!claim) continue
    if (m.sender_id !== claim.assigned_to) continue
    if (latestApprMsg.has(m.claim_id)) continue
    latestApprMsg.set(m.claim_id, m.created_at)
  }

  const uniqueAssignees = Array.from(new Set(openClaims.map(c => c.assigned_to!).filter(Boolean)))
  const { data: profs } = await service
    .from('profiles')
    .select('id, name, email, auto_status_requests_override')
    .in('id', uniqueAssignees)
  const profMap = new Map<string, ProfileRow>()
  for (const p of (profs as unknown as ProfileRow[]) ?? []) profMap.set(p.id, p)

  interface Action {
    kind: 'nag' | 'lockout'
    claim: ClaimRow
    recipientId: string
    recipientName: string
    body: string          // nag text — paused phases get the longer phase-aware body
  }
  const actions: Action[] = []
  for (const c of openClaims) {
    if (!c.assigned_to) continue
    if (c.status_lockout_at) continue

    const effectiveEnabled = profMap.get(c.assigned_to)?.auto_status_requests_override === true
    if (!effectiveEnabled) continue

    const anchorIso = latestApprMsg.get(c.id) ?? c.assigned_at
    if (!anchorIso) continue
    const anchor = new Date(anchorIso)

    // Paused-phase branch (Hold / Pending Repairs / Pending Information /
    // Rough Numbers) uses a longer 10-business-day first threshold; default
    // branch uses the 3-business-day threshold. Both branches now count in
    // BUSINESS days (Henry 2026-10-17) so weekends don't tick either clock.
    const pausedLabel = c.status_phase ? pausedPhaseLabels.get(c.status_phase) : undefined
    const paused = pausedLabel !== undefined
    const firstNagThreshold = paused ? PAUSED_FIRST_NAG_BUSINESS_DAYS : FIRST_NAG_DAYS
    const repeatThreshold = paused ? PAUSED_REPEAT_NAG_BUSINESS_DAYS : REPEAT_NAG_DAYS
    const since = (from: Date) => businessDaysBetween(from, now)

    const daysSinceAnchor = since(anchor)
    const count = c.status_request_count ?? 0

    if (daysSinceAnchor < firstNagThreshold) continue

    const p = profMap.get(c.assigned_to)
    const recipientName = p?.name || p?.email || 'Assigned Appraiser'
    const nagBody = paused ? pausedNagBody(pausedLabel!) : NAG_BODY

    if (count >= MAX_NAGS_BEFORE_LOCKOUT) {
      if (!c.last_status_request_at) continue
      const daysSinceLastNag = since(new Date(c.last_status_request_at))
      if (daysSinceLastNag < repeatThreshold) continue
      actions.push({ kind: 'lockout', claim: c, recipientId: c.assigned_to, recipientName, body: nagBody })
      continue
    }

    if (count === 0) {
      actions.push({ kind: 'nag', claim: c, recipientId: c.assigned_to, recipientName, body: nagBody })
      continue
    }

    if (c.last_status_request_at) {
      const daysSinceLastNag = since(new Date(c.last_status_request_at))
      if (daysSinceLastNag < repeatThreshold) continue
    }
    actions.push({ kind: 'nag', claim: c, recipientId: c.assigned_to, recipientName, body: nagBody })
  }

  if (actions.length === 0) return { sent: 0, locked: 0, checked: openClaims.length }

  const nowIso = now.toISOString()
  let sent = 0
  let locked = 0
  const errors: Array<{ claimId: string; error: string }> = []

  for (const a of actions) {
    if (a.kind === 'lockout') {
      const { error: updateErr } = await service
        .from('acv_history')
        .update({ status_lockout_at: nowIso })
        .eq('id', a.claim.id)
      if (updateErr) { errors.push({ claimId: a.claim.id, error: updateErr.message }); continue }
      locked++
      continue
    }

    const id = crypto.randomUUID()
    // messages.company_id is NOT NULL since the multi-company rollout. Each
    // claim is tied to a company (immutable), so inherit it directly.
    const insertPayload: Record<string, unknown> = {
      id,
      claim_id: a.claim.id,
      sender_id: null,
      sender_name: 'HamsPortal',
      recipient_ids: [a.recipientId],
      recipient_names: [a.recipientName],
      body: a.body,
      is_auto_request: true,
    }
    if (a.claim.company_id) insertPayload.company_id = a.claim.company_id
    const { error: insertErr } = await service.from('messages').insert(insertPayload)
    if (insertErr) { errors.push({ claimId: a.claim.id, error: insertErr.message }); continue }
    const nextCount = (a.claim.status_request_count ?? 0) + 1
    const { error: updateErr } = await service
      .from('acv_history')
      .update({ last_status_request_at: nowIso, status_request_count: nextCount })
      .eq('id', a.claim.id)
    if (updateErr) { errors.push({ claimId: a.claim.id, error: updateErr.message }); continue }
    // Email the appraiser the same way a human-posted message would. Direct
    // DB insert above bypasses /api/claims/[id]/messages so the normal email
    // path is skipped — mirror it here. notifyClaimMessage swallows its own
    // errors so a flaky Resend can't fail the cron.
    await notifyClaimMessage({
      claimId: a.claim.id,
      recipientId: a.recipientId,
      senderName: 'HamsPortal',
      messageBody: a.body,
    })
    sent++
  }

  return {
    sent,
    locked,
    checked: openClaims.length,
    errors: errors.length > 0 ? errors : undefined,
  }
}
