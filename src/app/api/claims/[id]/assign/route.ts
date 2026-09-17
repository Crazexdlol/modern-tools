import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth, fetchClaim } from '@/lib/auth/require-admin'

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
    const claim = await fetchClaim(id)
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
  // Sync claim.handlingAppraiser (a text field in the claim jsonb, used by
  // the printed assignment sheet + signature block) with the new assignee's
  // display name. Otherwise the printed docs keep showing the prior
  // appraiser after a reassign. Clear it on unassign so the fallback in
  // the assignment sheet renders "Unassigned".
  let newHandlingName = ''
  if (body.assignedTo) {
    const { data: targetProf } = await service
      .from('profiles')
      .select('name, email')
      .eq('id', body.assignedTo)
      .maybeSingle()
    newHandlingName = (targetProf?.name || targetProf?.email || '').trim()
  }
  // Fetch the current row (also used to 404 admin-path reassigns of
  // non-existent ids — the UPDATE below would otherwise silently touch 0
  // rows and the caller would see {ok:true} despite the id being bogus).
  const { data: currentRow } = await service
    .from('acv_history')
    .select('claim, status_phase')
    .eq('id', id)
    .maybeSingle()
  if (!currentRow) return NextResponse.json({ error: 'Claim not found' }, { status: 404 })
  const currentClaim = (currentRow.claim ?? {}) as Record<string, unknown>
  const nextClaim = { ...currentClaim, handlingAppraiser: newHandlingName }

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
    claim: nextClaim,
  }
  // If the claim was phased 'completed' (via submit), clear the phase too —
  // the new appraiser hasn't submitted anything yet. Other phases (Umpire,
  // Hold, etc.) are admin-managed and stay set across reassignment.
  if (currentRow.status_phase === 'completed') {
    patch.status_phase = null
    patch.status_phase_set_at = null
  }
  const { error } = await service
    .from('acv_history')
    .update(patch)
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
