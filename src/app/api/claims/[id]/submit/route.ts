import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth, fetchClaim } from '@/lib/auth/require-admin'

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
      })
      .eq('id', id)
    error = e2
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
