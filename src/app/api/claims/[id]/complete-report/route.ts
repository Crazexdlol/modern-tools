import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth, fetchClaim } from '@/lib/auth/require-admin'
import { recordStageTransition } from '@/lib/supabase/stage-events'

export const runtime = 'nodejs'

// Report-complete handoff. The appraiser doing the report work (comps,
// adjustments, DV, etc.) marks their portion done, and the claim is
// reassigned to the Negotiating Appraiser on the file. Claim stays in
// Main — it does NOT advance to QC. The next Submit, by the negotiating
// appraiser, is what moves it to QC.
//
// Permission: current assignee OR admin.
// Guards:
//   - must be in Main stage
//   - must have a negotiating appraiser set on the file
//   - negotiating appraiser must resolve to a profile DIFFERENT from the
//     current assignee (otherwise the report + negotiation are the same
//     person and they should use Submit directly)
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

  // Load the negotiating appraiser name from the claim jsonb. Dual-read
  // the legacy handlingAppraiser key for pre-migration rows.
  const { data: row } = await service
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from('acv_history').select('claim' as any).eq('id', id).maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawClaim = (row as any)?.claim ?? {}
  const negotiatingName = (rawClaim.negotiatingAppraiser ?? rawClaim.handlingAppraiser ?? '').toString().trim()
  if (!negotiatingName) {
    return NextResponse.json(
      { error: 'Set a Negotiating Appraiser on the claim first — the report hands off to them.' },
      { status: 400 },
    )
  }

  // Resolve to a profile by name or email.
  const needle = negotiatingName.toLowerCase()
  const { data: profiles } = await service.from('profiles').select('id, name, email')
  const match = (profiles ?? []).find(p => {
    const n = (p.name ?? '').trim().toLowerCase()
    const e = (p.email ?? '').trim().toLowerCase()
    return n === needle || e === needle
  })
  if (!match) {
    return NextResponse.json(
      { error: `Negotiating appraiser "${negotiatingName}" does not match a user profile. Pick from the dropdown.` },
      { status: 400 },
    )
  }
  if (match.id === claim.assignedTo) {
    return NextResponse.json(
      { error: 'You are already the negotiating appraiser — use Submit for QC instead.' },
      { status: 400 },
    )
  }

  const now = new Date().toISOString()
  const { error } = await service
    .from('acv_history')
    .update({
      assigned_to: match.id,
      assigned_at: now,
      // Clear the unread/opened handshake so the new assignee gets a fresh
      // "new assignment" indicator on their dashboard.
      last_status_request_at: null,
    })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  // Cycle-time ledger: close the report-appraiser's Main span, open a new
  // Main span under the handling appraiser.
  await recordStageTransition(service, id, 'main', match.id as string)
  return NextResponse.json({ ok: true, assignedTo: match.id, assignedToName: match.name ?? match.email })
}
