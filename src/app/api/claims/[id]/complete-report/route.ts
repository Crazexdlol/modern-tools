import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth, fetchClaim } from '@/lib/auth/require-admin'
import { recordStageTransition } from '@/lib/supabase/stage-events'

export const runtime = 'nodejs'

// Report-complete handoff. The appraiser doing the report work (comps,
// adjustments, DV, etc.) marks their portion done, and the claim is
// reassigned to the handoff target. Claim stays in Main — it does NOT
// advance to QC. The next Submit, by the handoff target, is what moves
// it to QC.
//
// Target resolution:
//   - If body.toAssignee is provided (UI picker path), use it after
//     validating the target handles this claim's types. The claim's
//     negotiatingAppraiser name on the file is NOT changed — it still
//     prints on the final docs (licensed-state scenario where the
//     signatory and the actual negotiator are different people).
//   - If body.toAssignee is omitted (legacy / scripted calls), fall back
//     to name-resolving the Negotiating Appraiser from the claim jsonb.
//
// Permission: current assignee OR admin.
// Guards:
//   - must be in Main stage, not already submitted
//   - target must resolve to an active, appraiser-role, picker-visible
//     profile DIFFERENT from the current assignee
//   - target must handle at least one of the claim's claim types
//     (empty claim_types on a profile = handles everything)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { caller, errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse

  const { id } = await params
  const body = await request.json().catch(() => null) as { toAssignee?: string } | null
  const explicitTarget = typeof body?.toAssignee === 'string' && body.toAssignee.trim()
    ? body.toAssignee.trim()
    : null

  const claim = await fetchClaim(id, caller!.activeCompanyId ?? undefined)
  if (!claim) return NextResponse.json({ error: 'Claim not found' }, { status: 404 })
  if (claim.status !== 'open') return NextResponse.json({ error: 'Claim is not open' }, { status: 400 })
  if ((claim.workflowStage ?? 'main') !== 'main') {
    return NextResponse.json({ error: 'Report-complete only applies to Appraiser-stage claims' }, { status: 400 })
  }
  if (claim.submittedAt) {
    return NextResponse.json({ error: 'Claim already submitted' }, { status: 400 })
  }

  const isAdmin = caller!.role === 'admin'
  const isAssignee = claim.assignedTo === caller!.userId
  if (!isAdmin && !isAssignee) {
    return NextResponse.json({ error: 'Not authorized to complete this report' }, { status: 403 })
  }

  const service = createServiceClient()

  // Load the claim's claim types for the type-overlap check.
  const { data: row } = await service
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from('acv_history').select('claim' as any).eq('id', id).maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawClaim = (row as any)?.claim ?? {}
  const claimTypes: string[] = Array.isArray(rawClaim.claimTypes) ? rawClaim.claimTypes : []

  // Override picker is ACV-only (Henry 2026-10-20). Non-ACV claims use the
  // legacy single-target handoff (Negotiating Appraiser name resolution).
  // Reject toAssignee overrides on non-ACV claims so a stale UI or scripted
  // caller can't bypass this.
  if (explicitTarget && !claimTypes.includes('acv')) {
    return NextResponse.json(
      { error: 'Handoff override is only available on ACV claims.' },
      { status: 400 },
    )
  }

  // Report-only claims (no 'rta' in claimTypes) have no handoff — the
  // appraiser was hired to write the report, nobody is negotiating this
  // file. Any Negotiating Appraiser value on the claim is metadata only
  // (likely for licensing display). Direct submit to QC is the right
  // action; this route refuses to run.
  if (!claimTypes.includes('rta')) {
    return NextResponse.json(
      { error: 'This is a report-only claim (no RTA). Submit for QC directly instead.' },
      { status: 400 },
    )
  }

  // Rough-numbers-pending claims always route to the Rough Numbers inbox
  // owner via /submit first. Mirror the UI gate on the server so stale
  // clients and scripted callers can't bypass the admin-review step.
  const needsRoughNumbers = claim.needsRoughNumbers === true
  const roughNumbersHandoffAt = claim.roughNumbersHandoffAt ?? null
  if (needsRoughNumbers && !roughNumbersHandoffAt) {
    return NextResponse.json(
      { error: 'Rough numbers pending — submit for admin review first instead of handing off.' },
      { status: 400 },
    )
  }

  // Resolve the target profile. Two paths:
  //   (1) UI picker — toAssignee passed in, look up by id
  //   (2) Legacy — name-match the negotiatingAppraiser value
  interface TargetProfile {
    id: string
    name: string | null
    email: string | null
    role: string | null
    is_active: boolean | null
    is_super_admin: boolean | null
    claim_types: string[] | null
  }
  let target: TargetProfile | null = null

  if (explicitTarget) {
    const { data: p } = await service
      .from('profiles')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select('id, name, email, role, is_active, is_super_admin, claim_types' as any)
      .eq('id', explicitTarget)
      .maybeSingle()
    target = (p as unknown as TargetProfile | null) ?? null
    if (!target) {
      return NextResponse.json({ error: 'Target user not found' }, { status: 400 })
    }
  } else {
    const negotiatingName = (rawClaim.negotiatingAppraiser ?? rawClaim.handlingAppraiser ?? '').toString().trim()
    if (!negotiatingName) {
      return NextResponse.json(
        { error: 'Set a Negotiating Appraiser on the claim first — the report hands off to them.' },
        { status: 400 },
      )
    }
    const needle = negotiatingName.toLowerCase()
    const { data: profiles } = await service
      .from('profiles')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select('id, name, email, role, is_active, is_super_admin, claim_types' as any)
    target = ((profiles ?? []) as unknown as TargetProfile[]).find(p => {
      const n = (p.name ?? '').trim().toLowerCase()
      const e = (p.email ?? '').trim().toLowerCase()
      return n === needle || e === needle
    }) ?? null
    if (!target) {
      return NextResponse.json(
        { error: `Negotiating appraiser "${negotiatingName}" does not match a user profile. Pick from the dropdown.` },
        { status: 400 },
      )
    }
  }

  // Shared validation (applies to both paths).
  if (target.id === claim.assignedTo) {
    return NextResponse.json(
      { error: 'You are already the handoff target — use Submit for QC instead.' },
      { status: 400 },
    )
  }
  if (target.is_active === false) {
    return NextResponse.json({ error: 'Target user is inactive' }, { status: 400 })
  }
  if (target.is_super_admin === true) {
    return NextResponse.json({ error: 'Target user is not eligible for handoff' }, { status: 400 })
  }
  if (target.role !== 'appraiser') {
    return NextResponse.json({ error: 'Handoff target must be an appraiser' }, { status: 400 })
  }
  // Claim-type coverage. Empty profile.claim_types = handles everything
  // (back-compat default); empty claim.claimTypes = any appraiser qualifies.
  const targetTypes: string[] = Array.isArray(target.claim_types) ? target.claim_types : []
  if (targetTypes.length > 0 && claimTypes.length > 0) {
    const have = new Set(targetTypes)
    const overlaps = claimTypes.some(t => have.has(t))
    if (!overlaps) {
      return NextResponse.json(
        { error: `${target.name ?? target.email ?? 'Target'} does not handle this claim's types.` },
        { status: 400 },
      )
    }
  }

  const now = new Date().toISOString()
  const { error } = await service
    .from('acv_history')
    .update({
      assigned_to: target.id,
      assigned_at: now,
      // Clear the unread/opened handshake so the new assignee gets a fresh
      // "new assignment" indicator on their dashboard.
      last_status_request_at: null,
    })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  // Cycle-time ledger: close the report-appraiser's Main span, open a new
  // Main span under the handling appraiser.
  await recordStageTransition(service, id, 'main', target.id)
  return NextResponse.json({ ok: true, assignedTo: target.id, assignedToName: target.name ?? target.email })
}
