import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth, fetchClaim } from '@/lib/auth/require-admin'
import { recordStageTransition, closeOpenStageEvent } from '@/lib/supabase/stage-events'
import {
  notifyStageEntry,
  notifyAdminStageAdvance,
  getBillingAdminForClaim,
  getPaymentAdminForClaim,
  fetchClaimSummary,
} from '@/lib/email/claim-notifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Stage = 'main' | 'qc' | 'billing_delivery' | 'payment'
const STAGES: readonly Stage[] = ['main', 'qc', 'billing_delivery', 'payment'] as const

function nextStage(current: Stage): Stage | 'closed' {
  const i = STAGES.indexOf(current)
  if (i < 0) return 'qc'                 // defensive: unknown current → QC
  if (i === STAGES.length - 1) return 'closed'  // payment → closed
  return STAGES[i + 1]
}

// Permission table:
//   main → qc:                    assignee OR admin  (same semantic as /submit)
//   qc → billing_delivery:        admin OR user with 'billing_delivery' access
//   billing_delivery → payment:   user with 'billing_delivery' access OR admin
//   payment → closed:             user with 'payment' access OR admin
//   send_back (any):              admin only
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
  // (completing a stage you have access to advances it out). For the merged
  // billing_delivery stage, accept any of the legacy codes too so this works
  // before the merge-migration has rewritten user_dashboard_access rows.
  const codes = fromStage === 'billing_delivery'
    ? ['billing_delivery', 'billing', 'delivery']
    : [fromStage]
  const { data } = await supabase
    .from('user_dashboard_access')
    .select('dashboard_code')
    .eq('user_id', caller.userId)
    .in('dashboard_code', codes)
    .limit(1)
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
    // Optional override for send-back: route to this user_id instead of
    // auto-resolving the handling appraiser. Admin UI exposes this via a
    // dropdown next to the Send Back button.
    toAssignee?: string
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
    const patch: Record<string, unknown> = {
      workflow_stage: toStage,
      workflow_stage_set_at: now,
    }
    // Sending back to Main → by default route the claim to whoever
    // SUBMITTED it (submitted_by). Admins can override by passing
    // toAssignee from the Send Back dropdown. Falls back to the handling
    // appraiser on the file if neither resolves (very rare — would only
    // happen if submitted_by got nulled externally).
    // Clears submitted_at/submitted_by so a fresh Submit is required after
    // the appraiser fixes whatever QC flagged.
    if (toStage === 'main') {
      let assignee: string | null = null
      if (body.toAssignee) {
        assignee = body.toAssignee
      } else if (claim.submittedBy) {
        assignee = claim.submittedBy
      } else {
        // Last-ditch fallback: match on negotiating appraiser name from the
        // claim JSON. Only hit when submitted_by is missing. Dual-reads the
        // legacy handlingAppraiser key for pre-migration rows.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: row } = await service.from('acv_history').select('claim' as any).eq('id', id).maybeSingle()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawClaim = (row as any)?.claim ?? {}
        const negotiatingName = (rawClaim.negotiatingAppraiser ?? rawClaim.handlingAppraiser) as string | undefined
        if (negotiatingName && negotiatingName.trim()) {
          const needle = negotiatingName.trim().toLowerCase()
          const { data: profiles } = await service.from('profiles').select('id, name, email')
          const match = (profiles ?? []).find(p => {
            const n = (p.name ?? '').trim().toLowerCase()
            const e = (p.email ?? '').trim().toLowerCase()
            return n === needle || e === needle
          })
          if (match) assignee = match.id as string
        }
      }
      patch.assigned_to = assignee
      patch.assigned_at = assignee ? now : null
      patch.submitted_at = null
      patch.submitted_by = null
    }
    const { error } = await service.from('acv_history').update(patch).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    // Cycle-time ledger: open a new span at the destination stage.
    await recordStageTransition(service, id, toStage, patch.assigned_to as string | null ?? null)
    // Stage-entry notification for the destination stage (send-back is still
    // a stage entry from the watcher's point of view).
    await notifyStageEntry({ claimId: id, stage: toStage, actorId: caller!.userId })
    return NextResponse.json({ ok: true, action: 'send_back', toStage })
  }

  // ---- advance: must match stage permission ----
  const allowed = await canAdvance(service, caller!, claim, currentStage)
  if (!allowed) {
    return NextResponse.json({ error: `Not authorized to advance from ${currentStage}` }, { status: 403 })
  }

  const target = nextStage(currentStage)

  if (target === 'closed') {
    // Payment → closed. Nag state (status_request_count, last_status_request_at,
    // status_lockout_at) is explicitly cleared so a reopened claim starts fresh
    // and historical closed rows don't carry stale counters forward (Henry
    // 2026-10-24).
    const patch: Record<string, unknown> = {
      status: 'closed',
      close_reason: 'completed',
      closed_at: now,
      workflow_stage_set_at: now,
      status_request_count: 0,
      last_status_request_at: null,
      status_lockout_at: null,
    }
    let { error } = await service.from('acv_history').update(patch).eq('id', id)
    // Pre-migration safety: close_reason/closed_at missing → retry minimal.
    if (error && error.code === '42703') {
      const { error: e2 } = await service.from('acv_history').update({ status: 'closed' }).eq('id', id)
      error = e2
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    // Cycle-time ledger: close the final payment-stage event. No new event
    // opens — the claim is terminal.
    await closeOpenStageEvent(service, id)
    return NextResponse.json({ ok: true, action: 'advance', toStage: 'closed' })
  }

  const patch: Record<string, unknown> = {
    workflow_stage: target,
    workflow_stage_set_at: now,
  }
  // main → qc: stamp submitted_at/submitted_by on the first submit, and
  // UNASSIGN the claim so appraisers can't keep working on it while QC is
  // reviewing. The submitter is remembered on submitted_by (shown on the
  // QC dashboard in place of Assigned To) so admins know who to send back to.
  // Also clear any nag state so a subsequent reopen/send-back starts clean
  // (Henry 2026-10-24). The reassign trigger clears these too when assigned_to
  // changes, but we set them explicitly as belt-and-suspenders in case the
  // claim was already assigned_to=null for some reason.
  if (currentStage === 'main' && target === 'qc') {
    if (!claim.submittedAt) {
      patch.submitted_at = now
      patch.submitted_by = caller!.userId
    }
    patch.assigned_to = null
    patch.status_request_count = 0
    patch.last_status_request_at = null
    patch.status_lockout_at = null
  }
  const { error } = await service.from('acv_history').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  // Cycle-time ledger: open a new span at the target stage. On main → qc
  // the assignee is now null (we clear it above), which the helper records
  // correctly so Payment-stage events show up without an owner.
  await recordStageTransition(service, id, target, (patch.assigned_to as string | null | undefined) ?? claim.assignedTo ?? null)
  // Stage-entry notification for the target stage.
  await notifyStageEntry({ claimId: id, stage: target, actorId: caller!.userId })

  // Per-stage primary routing: email the single designated admin (per-client
  // override → stage default) when a claim lands on Billing/Delivery or
  // Payment. QC routing is handled by /submit, not here, so we skip main→qc.
  if (target === 'billing_delivery' || target === 'payment') {
    const summary = await fetchClaimSummary(id)
    const adminId = target === 'billing_delivery'
      ? await getBillingAdminForClaim(summary?.clientName ?? null)
      : await getPaymentAdminForClaim(summary?.clientName ?? null)
    if (adminId) {
      const { data: actorRow } = await service
        .from('profiles')
        .select('name, email')
        .eq('id', caller!.userId)
        .maybeSingle()
      const actorName = (actorRow?.name as string | null)?.trim()
        || (actorRow?.email as string | null)?.trim()
        || 'An admin'
      await notifyAdminStageAdvance({ claimId: id, adminId, actorName, stage: target })
    }
  }

  return NextResponse.json({ ok: true, action: 'advance', toStage: target })
}
