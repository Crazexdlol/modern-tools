import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin } from '@/lib/auth/require-admin'
import { notifyClaimMessage } from '@/lib/email/claim-notifications'

export const runtime = 'nodejs'

const MAX_BODY_LEN = 8000

// POST /api/claims/[id]/status-on-behalf
// Admin-only. Posts a status update message as the admin (sender_id = admin's
// user id, sender_name = admin's display name) AND resets the auto-status
// nag state on the claim so the appraiser doesn't get a request immediately
// after an out-of-band verbal/email status.
//
// Why this is a separate route and not a flag on /messages:
//   - The DB trigger `trg_clear_status_lockout_on_appraiser_message` only
//     fires when sender_id = assigned_to. Admin posts (sender_id != assigned_to)
//     don't match that condition, so we have to clear the columns manually in
//     this route.
//   - Keeping it separate makes the "admin bypass" surface auditable: there's
//     exactly one route that resets the counter without an appraiser post.
//
// Behavior:
//   - Validates claim exists, is open, has a current assignee (status-on-behalf
//     only makes sense when there's an appraiser whose clock we're resetting).
//   - Inserts a message addressed TO the assignee so it hits their unread
//     queue + fires the normal email path.
//   - Clears status_request_count, last_status_request_at, status_lockout_at
//     on the claim. If the appraiser was locked out, this unlocks them.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { caller, errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const { id: claimId } = await params

  const body = await request.json().catch(() => null) as { body?: unknown } | null
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  const text = typeof body.body === 'string' ? body.body.trim() : ''
  if (!text) return NextResponse.json({ error: 'Status text is required' }, { status: 400 })
  if (text.length > MAX_BODY_LEN) {
    return NextResponse.json(
      { error: `Status is too long (max ${MAX_BODY_LEN} characters)` },
      { status: 400 },
    )
  }

  const service = createServiceClient()

  // Load the claim: must exist, open, and have an active assignee.
  const { data: claimRow, error: claimErr } = await service
    .from('acv_history')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .select('id, status, assigned_to, company_id' as any)
    .eq('id', claimId)
    .maybeSingle()
  if (claimErr) return NextResponse.json({ error: claimErr.message }, { status: 400 })
  if (!claimRow) return NextResponse.json({ error: 'Claim not found' }, { status: 404 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = claimRow as any
  if (row.status !== 'open') {
    return NextResponse.json({ error: 'Claim is not open' }, { status: 400 })
  }
  if (caller!.activeCompanyId && row.company_id && row.company_id !== caller!.activeCompanyId) {
    return NextResponse.json({ error: 'Claim not found' }, { status: 404 })
  }
  const assigneeId = row.assigned_to as string | null
  if (!assigneeId) {
    return NextResponse.json(
      { error: 'Claim has no assignee — nothing to status on behalf of.' },
      { status: 400 },
    )
  }

  // Resolve admin + assignee display names.
  const { data: profiles } = await service
    .from('profiles')
    .select('id, name, email')
    .in('id', [caller!.userId, assigneeId])
  const profMap = new Map<string, { name: string; email: string }>()
  for (const p of profiles ?? []) {
    profMap.set(p.id as string, { name: (p.name as string) ?? '', email: (p.email as string) ?? '' })
  }
  const adminProf = profMap.get(caller!.userId)
  const assigneeProf = profMap.get(assigneeId)
  if (!adminProf) {
    return NextResponse.json({ error: 'Admin profile not found' }, { status: 403 })
  }
  const adminName = adminProf.name.trim() || adminProf.email || 'Admin'
  const assigneeName = (assigneeProf?.name ?? '').trim() || assigneeProf?.email || 'Assignee'

  // Insert the message. sender_id = admin so the thread shows "Henry
  // Aleksanyan" (or whoever), not "HamsPortal". Recipient = assignee so
  // notifyClaimMessage fires the normal email + the unread queue picks it
  // up. is_auto_request stays false so the message is a real admin post,
  // not an amber "Auto" badge.
  const messageId = crypto.randomUUID()
  const insertPayload: Record<string, unknown> = {
    id: messageId,
    claim_id: claimId,
    sender_id: caller!.userId,
    sender_name: adminName,
    recipient_ids: [assigneeId],
    recipient_names: [assigneeName],
    body: text,
    is_auto_request: false,
  }
  if (row.company_id) insertPayload.company_id = row.company_id

  const { error: insertErr } = await service
    .from('messages')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert(insertPayload as any)
  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 400 })
  }

  // Reset the nag state. These three columns are the auto-status clock. The
  // trigger that clears them when an appraiser posts a message can't fire here
  // (admin sender_id != assigned_to), so we clear explicitly.
  const { error: updateErr } = await service
    .from('acv_history')
    .update({
      status_request_count: 0,
      last_status_request_at: null,
      status_lockout_at: null,
    })
    .eq('id', claimId)
  if (updateErr) {
    // Message already posted — surface the error but acknowledge the message
    // insert so the UI reflects reality.
    return NextResponse.json(
      { ok: false, messagePosted: true, error: `Message posted but clock reset failed: ${updateErr.message}` },
      { status: 500 },
    )
  }

  // Fire the normal recipient email path. Swallows its own errors.
  await notifyClaimMessage({
    claimId,
    recipientId: assigneeId,
    senderName: adminName,
    messageBody: text,
  })

  return NextResponse.json({ ok: true, messageId })
}
