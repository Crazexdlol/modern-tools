import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin, fetchClaim } from '@/lib/auth/require-admin'
import { recordStageTransition, type Stage } from '@/lib/supabase/stage-events'
import { notifyAppraiserAssigned, notifyStageEntry } from '@/lib/email/claim-notifications'

export const runtime = 'nodejs'

// POST body contract (new 2026-10-12):
//   { as: 'supplement' | 'revision', assignTo: string | null }
//
// - as='supplement' increments supplement_count by 1 (Supp N pill).
// - as='revision' sets is_revision=true (idempotent; a repeat revision
//   reopen just re-applies true).
// - assignTo is the user id of the appraiser the reopened claim should
//   be routed to, or null for Unassigned. Required field.
//
// Legacy body shape (no body, or body with no `as` field) is still
// accepted for backward compat: it reopens the claim without touching
// labels OR assignment (so the dashboard bulk-reopen upgrade can roll
// out independently of any lagging callers). New callers always pass
// {as, assignTo}.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { caller, errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const { id } = await params
  const claim = await fetchClaim(id, caller!.activeCompanyId ?? undefined)
  if (!claim) return NextResponse.json({ error: 'Claim not found' }, { status: 404 })
  if (claim.status !== 'closed') return NextResponse.json({ error: 'Claim is not closed' }, { status: 400 })

  const body = (await request.json().catch(() => null)) as {
    as?: 'supplement' | 'revision'
    assignTo?: string | null
  } | null

  const asKind = body?.as
  if (asKind !== undefined && asKind !== 'supplement' && asKind !== 'revision') {
    return NextResponse.json({ error: "as must be 'supplement' or 'revision'" }, { status: 400 })
  }

  // assignTo is only validated when the new-contract `as` field is present.
  // Legacy no-body callers (bulk Reopen before the UI upgrade lands) skip
  // the assignment step entirely so they keep working.
  let assignTo: string | null | undefined
  if (asKind !== undefined) {
    const raw = body?.assignTo
    if (raw === undefined) {
      return NextResponse.json({ error: 'assignTo (uuid string or null) required' }, { status: 400 })
    }
    if (raw !== null && typeof raw !== 'string') {
      return NextResponse.json({ error: 'assignTo must be a uuid string or null' }, { status: 400 })
    }
    assignTo = raw
  }

  const service = createServiceClient()

  // Validate assignTo (if provided): must be an active profile. Mirrors
  // the guard in /api/claims/[id]/assign.
  if (assignTo) {
    const { data: targetProfile } = await service
      .from('profiles')
      .select('id, is_active, name, email')
      .eq('id', assignTo)
      .maybeSingle()
    if (!targetProfile) {
      return NextResponse.json({ error: 'Target user not found' }, { status: 400 })
    }
    if (targetProfile.is_active === false) {
      return NextResponse.json({ error: 'Target user is inactive' }, { status: 400 })
    }
  }

  // Read the current supplement_count so we can increment it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: currentRow } = await (service
    .from('acv_history')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .select('claim, supplement_count, is_revision' as any)
    .eq('id', id)
    .maybeSingle() as any)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = (currentRow ?? {}) as any
  const currentSupplementCount = Number(row.supplement_count ?? 0)
  const currentIsRevision = row.is_revision === true

  // Clear the 'completed' phase alongside submitted_at so the reopened
  // claim goes back to a clean active state. Other admin-set phases
  // (Umpire, Hold, etc.) are left alone.
  const patch: Record<string, unknown> = {
    status: 'open',
    submitted_at: null,
    submitted_by: null,
    closed_at: null,
  }
  if (claim.statusPhase === 'completed') {
    patch.status_phase = null
    patch.status_phase_set_at = null
  }

  // Apply the new label fields when the caller used the new contract.
  // Legacy no-body calls skip these — labels remain unchanged.
  let nextSupplementCount = currentSupplementCount
  let nextIsRevision = currentIsRevision
  if (asKind === 'supplement') {
    nextSupplementCount = currentSupplementCount + 1
    patch.supplement_count = nextSupplementCount
  } else if (asKind === 'revision') {
    nextIsRevision = true
    patch.is_revision = true
  }

  // When new-contract: also route the reopened claim to the picked
  // appraiser. negotiatingAppraiser is a SEPARATE, admin-managed field and
  // is intentionally NOT touched here (Henry 2026-10-12 — same policy as
  // /api/claims/[id]/assign). Admins change the negotiating-appraiser via
  // the dropdown on the claim workspace; reassigning never overwrites it.
  if (assignTo !== undefined) {
    patch.assigned_to = assignTo
    patch.assigned_at = assignTo ? new Date().toISOString() : null
    patch.last_status_request_at = null
  }

  let { error } = await service
    .from('acv_history')
    .update(patch)
    .eq('id', id)
  if (error && error.code === '42703') {
    // One or more of closed_at / supplement_count / is_revision haven't
    // been migrated. Drop them and retry so reopen still succeeds. The
    // reopen labels silently don't record until the migration runs.
    delete patch.closed_at
    delete patch.supplement_count
    delete patch.is_revision
    ;({ error } = await service
      .from('acv_history')
      .update(patch)
      .eq('id', id))
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Cycle-time ledger: reopening pushes the claim back to its last known
  // stage with its new assignee (or the existing one if the caller didn't
  // provide assignTo). The previous event was closed at approve-time, so
  // we open a fresh span now.
  const stage: Stage = (claim.workflowStage ?? 'main') as Stage
  const newAssignee = assignTo !== undefined ? assignTo : claim.assignedTo
  await recordStageTransition(service, id, stage, newAssignee ?? null)

  // Fire assignment emails whenever the caller sent an assignee — mirrors
  // /api/claims/[id]/assign. Legacy no-body callers skip emails since the
  // assignment is unchanged. Failures are swallowed inside the helpers.
  if (assignTo !== undefined && assignTo) {
    await notifyAppraiserAssigned({ claimId: id, appraiserId: assignTo })
    await notifyStageEntry({ claimId: id, stage: 'main', actorId: caller!.userId })
  }

  return NextResponse.json({
    ok: true,
    supplementCount: nextSupplementCount,
    isRevision: nextIsRevision,
    assignedTo: assignTo !== undefined ? assignTo : (claim.assignedTo ?? null),
  })
}
