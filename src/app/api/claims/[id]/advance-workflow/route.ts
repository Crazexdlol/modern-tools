import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth, fetchClaim } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Stage = 'main' | 'qc' | 'billing' | 'delivery' | 'payment'
const STAGES: readonly Stage[] = ['main', 'qc', 'billing', 'delivery', 'payment'] as const

function nextStage(current: Stage): Stage | 'closed' {
  const i = STAGES.indexOf(current)
  if (i < 0) return 'qc'                 // defensive: unknown current → QC
  if (i === STAGES.length - 1) return 'closed'  // payment → closed
  return STAGES[i + 1]
}

// Permission table:
//   main → qc:        assignee OR admin  (same semantic as /submit)
//   qc → billing:     admin OR user with 'billing' access  (admin can escalate)
//   billing → delivery:   user with 'billing' access OR admin
//   delivery → payment:   user with 'delivery' access OR admin
//   payment → closed:     user with 'payment' access OR admin
//   send_back (any):      admin only
async function canAdvance(
  supabase: ReturnType<typeof createServiceClient>,
  caller: { userId: string; role: string },
  claim: { assignedTo: string | null },
  fromStage: Stage,
): Promise<boolean> {
  const isAdmin = caller.role === 'admin'
  if (isAdmin) return true
  if (fromStage === 'main') return claim.assignedTo === caller.userId
  // For the later stages, require matching dashboard access on the FROM stage
  // (completing a stage you have access to advances it out).
  const { data } = await supabase
    .from('user_dashboard_access')
    .select('dashboard_code')
    .eq('user_id', caller.userId)
    .eq('dashboard_code', fromStage)
    .maybeSingle()
  return !!data
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { caller, errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse

  const { id } = await params
  const body = (await request.json().catch(() => ({}))) as {
    action?: 'advance' | 'send_back'
    toStage?: Stage
  }
  const action = body.action
  if (action !== 'advance' && action !== 'send_back') {
    return NextResponse.json({ error: 'action must be "advance" or "send_back"' }, { status: 400 })
  }

  const claim = await fetchClaim(id, caller!.activeCompanyId ?? undefined)
  if (!claim) return NextResponse.json({ error: 'Claim not found' }, { status: 404 })
  if (claim.status !== 'open') return NextResponse.json({ error: 'Claim is not open' }, { status: 400 })

  const service = createServiceClient()
  const now = new Date().toISOString()
  const currentStage = (claim.workflowStage ?? 'main') as Stage

  // ---- send_back: admin only, must specify toStage ----
  if (action === 'send_back') {
    if (caller!.role !== 'admin') {
      return NextResponse.json({ error: 'Send-back is admin only' }, { status: 403 })
    }
    const toStage = body.toStage
    if (!toStage || !STAGES.includes(toStage)) {
      return NextResponse.json({ error: 'toStage must be one of ' + STAGES.join(', ') }, { status: 400 })
    }
    const { error } = await service
      .from('acv_history')
      .update({
        workflow_stage: toStage,
        workflow_stage_set_at: now,
      })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, action: 'send_back', toStage })
  }

  // ---- advance: must match stage permission ----
  const allowed = await canAdvance(service, caller!, claim, currentStage)
  if (!allowed) {
    return NextResponse.json({ error: `Not authorized to advance from ${currentStage}` }, { status: 403 })
  }

  const target = nextStage(currentStage)

  if (target === 'closed') {
    // Payment → closed.
    const patch: Record<string, unknown> = {
      status: 'closed',
      close_reason: 'completed',
      closed_at: now,
      workflow_stage_set_at: now,
    }
    let { error } = await service.from('acv_history').update(patch).eq('id', id)
    // Pre-migration safety: close_reason/closed_at missing → retry minimal.
    if (error && error.code === '42703') {
      const { error: e2 } = await service.from('acv_history').update({ status: 'closed' }).eq('id', id)
      error = e2
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, action: 'advance', toStage: 'closed' })
  }

  const patch: Record<string, unknown> = {
    workflow_stage: target,
    workflow_stage_set_at: now,
  }
  // main → qc also stamps submitted_at the first time (preserves the existing
  // Submit semantics so downstream consumers that watch submitted_at keep working).
  if (currentStage === 'main' && target === 'qc' && !claim.submittedAt) {
    patch.submitted_at = now
    patch.submitted_by = caller!.userId
  }
  const { error } = await service.from('acv_history').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, action: 'advance', toStage: target })
}
