import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/auth/require-admin'
import { recordPhaseChange } from '@/lib/supabase/stage-events'
import { postPhaseAutoMessage } from '@/lib/supabase/phase-auto-message'

export const runtime = 'nodejs'

/**
 * POST /api/claims/[id]/umpire
 *
 * Toggles the "proceeded to umpire" flag + umpire-agreement flag on a claim,
 * and automatically syncs the status_phase to match:
 *   proceededToUmpire=false              → clears flags; clears phase if currently umpire/court_umpire
 *   proceededToUmpire=true, agreement=true  → phase 'umpire'
 *   proceededToUmpire=true, agreement=false → phase 'court_umpire'
 *
 * Body: { proceededToUmpire: boolean, umpireAgreement?: boolean }
 *   - umpireAgreement defaults to true when proceededToUmpire=true and the
 *     field is omitted (Henry's spec: "automatically yes").
 *
 * Permissions: admin OR the currently-assigned appraiser on this claim.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const { caller, errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse

  const body = await request.json().catch(() => null) as {
    proceededToUmpire?: boolean
    umpireAgreement?: boolean
  } | null
  if (body === null || typeof body.proceededToUmpire !== 'boolean') {
    return NextResponse.json({ error: 'proceededToUmpire (boolean) required' }, { status: 400 })
  }

  const service = createServiceClient()

  // Load claim for permission + current state.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: row, error: rowErr } = await service
    .from('acv_history')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .select('id, assigned_to, status_phase, company_id, proceeded_to_umpire, umpire_agreement' as any)
    .eq('id', id)
    .maybeSingle()
  if (rowErr) return NextResponse.json({ error: rowErr.message }, { status: 500 })
  if (!row) return NextResponse.json({ error: 'Claim not found' }, { status: 404 })

  // Cross-company guard (same shape as /phase route).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rowCompanyId = (row as any).company_id as string | null | undefined
  if (caller!.activeCompanyId && rowCompanyId && rowCompanyId !== caller!.activeCompanyId) {
    return NextResponse.json({ error: 'Claim not found' }, { status: 404 })
  }

  // Permission: admin OR the currently-assigned appraiser on this claim.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const assignedTo = (row as any).assigned_to as string | null
  const isAdmin = caller!.role === 'admin'
  const isAssigned = assignedTo === caller!.userId
  if (!isAdmin && !isAssigned) {
    return NextResponse.json({ error: 'Not authorized to update umpire status for this claim' }, { status: 403 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prevPhase = ((row as any).status_phase ?? null) as string | null

  const proceeded = body.proceededToUmpire
  const agreement = proceeded ? (body.umpireAgreement ?? true) : true  // default-yes per spec

  // Target phase derivation:
  //   false → if currently umpire/court_umpire, clear it. Otherwise leave untouched.
  //   true  → 'umpire' or 'court_umpire' based on agreement.
  let targetPhase: string | null | undefined
  if (!proceeded) {
    targetPhase = (prevPhase === 'umpire' || prevPhase === 'court_umpire') ? null : undefined
  } else {
    targetPhase = agreement ? 'umpire' : 'court_umpire'
  }

  const patch: Record<string, unknown> = {
    proceeded_to_umpire: proceeded,
    umpire_agreement: agreement,
  }
  if (targetPhase !== undefined) {
    patch.status_phase = targetPhase
    patch.status_phase_set_at = targetPhase === null ? null : new Date().toISOString()
  }

  const { error: upErr } = await service.from('acv_history').update(patch).eq('id', id)
  if (upErr) {
    if (upErr.code === '42703' || upErr.code === 'PGRST204') {
      return NextResponse.json({ error: 'migration pending — run migration-claim-proceeded-to-umpire.sql' }, { status: 503 })
    }
    return NextResponse.json({ error: upErr.message }, { status: 400 })
  }

  // Cycle-time pause bookkeeping — same as /phase route.
  if (targetPhase !== undefined) {
    await recordPhaseChange(service, id, targetPhase ?? null, prevPhase)
  }

  // Auto-message for the activity thread. Mirrors the /phase route and
  // coalesces into the latest phase auto-message on this claim if it's
  // less than 60 seconds old — stops the thread from filling with
  // duplicates when a user yo-yos the umpire toggle.
  let msgBody: string | null = null
  if (!proceeded && targetPhase === null) msgBody = 'Phase removed from claim (umpire flag cleared)'
  else if (proceeded && targetPhase === 'umpire') msgBody = 'Claim has been phased: Umpire'
  else if (proceeded && targetPhase === 'court_umpire') msgBody = 'Claim has been phased: Court Appointed Umpire'
  if (msgBody) {
    await postPhaseAutoMessage(service, id, msgBody, caller!.activeCompanyId)
  }

  return NextResponse.json({
    ok: true,
    proceededToUmpire: proceeded,
    umpireAgreement: agreement,
    phase: targetPhase === undefined ? prevPhase : targetPhase,
  })
}
