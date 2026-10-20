import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth, fetchClaim } from '@/lib/auth/require-admin'
import { recordStageTransition } from '@/lib/supabase/stage-events'
import { getSubmissionAdminForClaim, notifyAdminClaimSubmitted, notifyStageEntry, notifyRoughNumbersHandoff, fetchClaimSummary } from '@/lib/email/claim-notifications'
import { getRoughNumbersInboxOwner } from '@/lib/supabase/rough-numbers'

export const runtime = 'nodejs'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { caller, errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse

  const { id } = await params
  const claim = await fetchClaim(id, caller!.activeCompanyId ?? undefined)
  if (!claim) return NextResponse.json({ error: 'Claim not found' }, { status: 404 })
  if (claim.status !== 'open') return NextResponse.json({ error: 'Claim is not open' }, { status: 400 })
  if (claim.submittedAt) return NextResponse.json({ error: 'Claim already submitted' }, { status: 400 })

  const isAdmin = caller!.role === 'admin'
  const isAssignee = claim.assignedTo === caller!.userId
  if (!isAdmin && !isAssignee) {
    return NextResponse.json({ error: 'Not authorized to submit this claim' }, { status: 403 })
  }

  const service = createServiceClient()
  const now = new Date().toISOString()

  // Rough-numbers branch. Fires only on the FIRST submit of a claim created
  // with needs_rough_numbers=true. The second Submit (by the inbox owner or
  // whomever they reassigned to) sees rough_numbers_handoff_at populated and
  // falls through to the standard QC branch below. Pre-migration both
  // fields are undefined → guard evaluates false → standard QC path fires.
  if (claim.needsRoughNumbers && !claim.roughNumbersHandoffAt) {
    const ownerId = await getRoughNumbersInboxOwner()
    if (!ownerId) {
      return NextResponse.json(
        { error: 'Rough Numbers inbox owner is not configured. Set one in Admin → Settings before using rough numbers.' },
        { status: 400 },
      )
    }

    const { error: roughErr } = await service
      .from('acv_history')
      .update({
        rough_numbers_handoff_at: now,
        status_phase: 'rough_numbers',
        status_phase_set_at: now,
        assigned_to: ownerId,
        assigned_at: now,
        // Clear the unread/opened handshake so the inbox owner sees a fresh
        // "new assignment" indicator on their dashboard.
        last_status_request_at: null,
      })
      .eq('id', id)
    if (roughErr) return NextResponse.json({ error: roughErr.message }, { status: 400 })

    // Cycle-time ledger: close the submitter's Main span, open the inbox
    // owner's. The rough_numbers phase has pauses_cycle_time=true so the
    // inbox owner's span contributes zero to their aggregate until it's
    // reassigned or submitted onward.
    await recordStageTransition(service, id, 'main', ownerId)

    const { data: submitterRow } = await service
      .from('profiles')
      .select('name, email')
      .eq('id', caller!.userId)
      .maybeSingle()
    const submitterName = (submitterRow?.name as string | null)?.trim()
      || (submitterRow?.email as string | null)?.trim()
      || 'An appraiser'

    await notifyRoughNumbersHandoff({
      claimId: id,
      inboxOwnerId: ownerId,
      submitterName,
    })

    return NextResponse.json({ ok: true, roughNumbersHandoff: true })
  }
  // Post workflow-dashboards: advance to the QC tab (workflow_stage='qc').
  // Pre-migration fallback: fall back to the old status_phase='completed'
  // write so a deploy that lands before the migration keeps working.
  let { error } = await service
    .from('acv_history')
    .update({
      submitted_at: now,
      submitted_by: caller!.userId,
      workflow_stage: 'qc',
      workflow_stage_set_at: now,
      // Clear assigned_to on submit so the claim leaves the appraiser's
      // Main dashboard. submitted_by preserves who submitted it so QC can
      // send it back if needed.
      assigned_to: null,
    })
    .eq('id', id)
  if (error && error.code === '42703') {
    const { error: e2 } = await service
      .from('acv_history')
      .update({
        submitted_at: now,
        submitted_by: caller!.userId,
        status_phase: 'completed',
        status_phase_set_at: now,
        assigned_to: null,
      })
      .eq('id', id)
    error = e2
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  // Cycle-time ledger: Main (as the submitter) → QC (unassigned).
  await recordStageTransition(service, id, 'qc', null)

  // Resolve the admin to notify. Per-client override wins over the global
  // default (both configured on /admin/settings/notifications).
  const summary = await fetchClaimSummary(id)
  const notifyAdminId = await getSubmissionAdminForClaim(summary?.clientName ?? null)
  if (notifyAdminId) {
    const { data: submitterRow } = await service
      .from('profiles')
      .select('name, email')
      .eq('id', caller!.userId)
      .maybeSingle()
    const submitterName = (submitterRow?.name as string | null)?.trim()
      || (submitterRow?.email as string | null)?.trim()
      || 'An appraiser'
    await notifyAdminClaimSubmitted({
      claimId: id,
      adminId: notifyAdminId,
      submitterName,
    })
  }
  // Stage-entry notification for QC (any configured watchers get pinged
  // the moment the claim lands on the QC dashboard).
  await notifyStageEntry({ claimId: id, stage: 'qc', actorId: caller!.userId })
  return NextResponse.json({ ok: true })
}
