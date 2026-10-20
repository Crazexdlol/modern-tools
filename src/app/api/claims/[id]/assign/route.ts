import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth, fetchClaim } from '@/lib/auth/require-admin'
import { recordStageTransition, type Stage } from '@/lib/supabase/stage-events'
import { notifyAppraiserAssigned, notifyAppraiserRemoved, notifyStageEntry } from '@/lib/email/claim-notifications'

export const runtime = 'nodejs'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { caller, errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse

  const { id } = await params
  const body = await request.json().catch(() => null) as { assignedTo?: string | null } | null
  if (body === null || (body.assignedTo !== null && typeof body.assignedTo !== 'string')) {
    return NextResponse.json({ error: 'assignedTo (uuid string or null) required' }, { status: 400 })
  }

  const service = createServiceClient()

  // Validate target: assignedTo must be null (unassign) OR reference an
  // active profile. Prevents accidental (or malicious) reassignment to a
  // random / non-existent user id.
  if (body.assignedTo !== null) {
    const { data: targetProfile } = await service
      .from('profiles')
      .select('id, is_active')
      .eq('id', body.assignedTo)
      .maybeSingle()
    if (!targetProfile) {
      return NextResponse.json({ error: 'Target user not found' }, { status: 400 })
    }
    if (targetProfile.is_active === false) {
      return NextResponse.json({ error: 'Target user is inactive' }, { status: 400 })
    }
  }

  // Authorization: admins can reassign any claim. Non-admins need the
  // per-user `can_reassign_claims` grant AND the claim must currently be
  // assigned to them.
  if (caller!.role !== 'admin') {
    const claim = await fetchClaim(id, caller!.activeCompanyId ?? undefined)
    if (!claim) return NextResponse.json({ error: 'Claim not found' }, { status: 404 })
    if (claim.assignedTo !== caller!.userId) {
      return NextResponse.json({ error: 'You can only reassign claims currently assigned to you' }, { status: 403 })
    }
    const { data: prof } = await service
      .from('profiles')
      .select('can_reassign_claims')
      .eq('id', caller!.userId)
      .maybeSingle()
    if (!prof?.can_reassign_claims) {
      return NextResponse.json({ error: 'Not authorized to reassign claims' }, { status: 403 })
    }
  }
  // Fetch the current row (also used to 404 admin-path reassigns of
  // non-existent ids — the UPDATE below would otherwise silently touch 0
  // rows and the caller would see {ok:true} despite the id being bogus).
  // Also read company_id so admin cross-company operations are blocked
  // (RLS would catch this for non-admins, but this route runs on service
  // client and bypasses RLS entirely).
  const { data: currentRow } = await service
    .from('acv_history')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .select('claim, status_phase, company_id, workflow_stage, assigned_to' as any)
    .eq('id', id)
    .maybeSingle()
  if (!currentRow) return NextResponse.json({ error: 'Claim not found' }, { status: 404 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currentRowAny = currentRow as any
  const rowCompanyId = currentRowAny.company_id as string | null | undefined
  if (
    caller!.activeCompanyId &&
    rowCompanyId &&
    rowCompanyId !== caller!.activeCompanyId
  ) {
    return NextResponse.json({ error: 'Claim not found' }, { status: 404 })
  }

  // IMPORTANT: negotiatingAppraiser is a SEPARATE field from assigned_to
  // and is managed independently by the admin via the top-of-claim dropdown.
  // Reassigning a claim must NOT overwrite negotiatingAppraiser (Henry
  // 2026-10-12 — the two names represent different roles: the person
  // doing the work vs. the person whose name prints on the final docs).
  // Previously this route stamped negotiatingAppraiser = new-assignee.name,
  // which silently clobbered the admin's picked value on every reassign.

  // Also reset last_status_request_at so the new appraiser gets a fresh
  // 48-hour window, and stamp assigned_at so the cron has an anchor when
  // the appraiser hasn't messaged yet. Clear submitted_at/submitted_by so
  // a reassigned claim returns to active work for the new assignee — the
  // previous submission was by the prior appraiser and doesn't apply to
  // the new one.
  const patch: Record<string, unknown> = {
    assigned_to: body.assignedTo,
    assigned_at: body.assignedTo ? new Date().toISOString() : null,
    last_status_request_at: null,
    submitted_at: null,
    submitted_by: null,
  }
  // If the claim was phased 'completed' (via submit), clear the phase too —
  // the new appraiser hasn't submitted anything yet. Other phases (Umpire,
  // Hold, etc.) are admin-managed and stay set across reassignment.
  if (currentRowAny.status_phase === 'completed') {
    patch.status_phase = null
    patch.status_phase_set_at = null
  }
  const { error } = await service
    .from('acv_history')
    .update(patch)
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  // Cycle-time ledger: closes the prior assignee's span (if any) and opens
  // a new one under the new assignee at the current workflow stage. Pulls
  // the stage from the fetched currentRow since /assign doesn't change it.
  const rowStage = (currentRowAny.workflow_stage ?? 'main') as string
  // Tolerate transitional pre-merge values ('billing' / 'delivery' both roll
  // into 'billing_delivery') for any row that hadn't been updated yet.
  const normalizedStage = (rowStage === 'billing' || rowStage === 'delivery') ? 'billing_delivery' : rowStage
  const stage: Stage = (['main','qc','billing_delivery','payment'].includes(normalizedStage) ? normalizedStage : 'main') as Stage
  await recordStageTransition(service, id, stage, body.assignedTo ?? null)
  // Fire assignment emails after the DB mutation lands. Only when the
  // assignment actually changed (self-reassign to same person is a no-op).
  // Email failures never surface to the client — logged in the helper.
  const prevAssignedTo = (currentRowAny.assigned_to as string | null) ?? null
  if (prevAssignedTo !== body.assignedTo) {
    if (prevAssignedTo) {
      await notifyAppraiserRemoved({ claimId: id, appraiserId: prevAssignedTo })
    }
    if (body.assignedTo) {
      await notifyAppraiserAssigned({ claimId: id, appraiserId: body.assignedTo })
      // "New Assignments" stage-entry watchers get pinged on every claim
      // that gains an assignee (both brand-new and reassignments). The
      // main stage itself doesn't change here, but the dashboard view it
      // populates does — which is what the watcher config represents.
      await notifyStageEntry({ claimId: id, stage: 'main', actorId: caller!.userId })
    }
  }
  return NextResponse.json({ ok: true })
}
