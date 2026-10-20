import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin } from '@/lib/auth/require-admin'
import { recordPhaseChange } from '@/lib/supabase/stage-events'
import { postPhaseAutoMessage } from '@/lib/supabase/phase-auto-message'

export const runtime = 'nodejs'

/**
 * Set or clear the status phase on a claim. ADMIN-ONLY — phase changes are
 * a management action, not something the assigned appraiser can do.
 * Body: { phase: string | null }
 *   - string: set/change phase; resets status_phase_set_at to now(). Posts an
 *     auto message "Claim has been phased: {label}" to the thread.
 *   - null: clear phase; nulls both columns. Posts "Phase removed from claim".
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const { caller, errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const body = await request.json().catch(() => null) as { phase?: string | null } | null
  if (body === null || body.phase === undefined) {
    return NextResponse.json({ error: 'phase required (string or null)' }, { status: 400 })
  }

  const service = createServiceClient()

  // Cross-company guard: admin from MA session can't operate on EV claim
  // (service client bypasses RLS, so we check explicitly).
  if (caller!.activeCompanyId) {
    const { data: row } = await service
      .from('acv_history')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select('company_id' as any)
      .eq('id', id)
      .maybeSingle()
    if (!row) return NextResponse.json({ error: 'Claim not found' }, { status: 404 })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rowCompanyId = (row as any).company_id as string | null | undefined
    if (rowCompanyId && rowCompanyId !== caller!.activeCompanyId) {
      return NextResponse.json({ error: 'Claim not found' }, { status: 404 })
    }
  }

  // Resolve the phase label if setting a phase. Also validates the code exists.
  let label: string | null = null
  if (body.phase !== null) {
    const { data: cfg, error: cfgErr } = await service
      .from('status_phase_configs')
      .select('label')
      .eq('code', body.phase)
      .maybeSingle()
    if (cfgErr) return NextResponse.json({ error: cfgErr.message }, { status: 400 })
    if (!cfg) return NextResponse.json({ error: `Unknown phase code: ${body.phase}` }, { status: 400 })
    label = (cfg as { label: string }).label
  }

  // Read the current phase so we can tell cycle-time tracking whether this
  // crosses a pause boundary (hold / pending_information / pending_repairs).
  const { data: prevRow } = await service
    .from('acv_history')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .select('status_phase' as any)
    .eq('id', id)
    .maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prevPhase = ((prevRow as any)?.status_phase ?? null) as string | null

  // Keep the proceeded_to_umpire flag in sync with the phase (Henry 2026-10-15):
  //   - If the new phase is 'umpire' or 'court_umpire', mark the claim as having
  //     proceeded to umpire and set umpire_agreement to match (umpire = true,
  //     court_umpire = false). Keeps the flag coherent when an admin moves a
  //     claim into umpire directly from the phase dropdown.
  //   - If the new phase is anything else (including null), clear the flag so
  //     the UI doesn't keep showing "Umpire Ruling Award" on a claim that's
  //     no longer phased umpire. Agreement resets to the default `true`.
  const patch: Record<string, unknown> = body.phase === null
    ? { status_phase: null, status_phase_set_at: null }
    : { status_phase: body.phase, status_phase_set_at: new Date().toISOString() }

  if (body.phase === 'umpire') {
    patch.proceeded_to_umpire = true
    patch.umpire_agreement    = true
  } else if (body.phase === 'court_umpire') {
    patch.proceeded_to_umpire = true
    patch.umpire_agreement    = false
  } else {
    patch.proceeded_to_umpire = false
    patch.umpire_agreement    = true
  }

  let { error: upErr } = await service.from('acv_history').update(patch).eq('id', id)
  // Pre-migration safety: proceeded_to_umpire / umpire_agreement might not
  // exist yet. Retry without them so the phase change itself still lands.
  if (upErr && (upErr.code === '42703' || upErr.code === 'PGRST204')) {
    delete patch.proceeded_to_umpire
    delete patch.umpire_agreement
    ;({ error: upErr } = await service.from('acv_history').update(patch).eq('id', id))
  }
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 })

  // Cycle-time pause bookkeeping. Pauses the ledger when entering a
  // pause phase and reopens when leaving. No-op for non-pause → non-pause
  // transitions. Fail-safe internally; never bubbles.
  await recordPhaseChange(service, id, body.phase ?? null, prevPhase)

  // Auto-message. Fire-and-forget style — if this fails, we still return ok
  // because the phase change already succeeded. Coalesces into the latest
  // phase auto-message on this claim if it's <60s old, so flipping the
  // phase dropdown back-and-forth doesn't spam the thread.
  const msgBody = body.phase === null
    ? 'Phase removed from claim'
    : `Claim has been phased: ${label}`
  await postPhaseAutoMessage(service, id, msgBody, caller!.activeCompanyId)

  return NextResponse.json({ ok: true, phase: body.phase })
}
