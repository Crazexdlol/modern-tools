import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin } from '@/lib/auth/require-admin'

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

  const patch = body.phase === null
    ? { status_phase: null, status_phase_set_at: null }
    : { status_phase: body.phase, status_phase_set_at: new Date().toISOString() }

  const { error: upErr } = await service.from('acv_history').update(patch).eq('id', id)
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 })

  // Auto-message. Fire-and-forget style — if this fails, we still return ok
  // because the phase change already succeeded. Empty recipient list so it
  // doesn't hit anyone's unread queue (informational).
  // messages.id has no default and messages.recipient_names is NOT NULL —
  // both must be provided or the insert silently 500s and no history entry
  // is written for the phase change.
  const msgBody = body.phase === null
    ? 'Phase removed from claim'
    : `Claim has been phased: ${label}`
  const messagePayload: Record<string, unknown> = {
    id: crypto.randomUUID(),
    claim_id: id,
    sender_id: null,
    sender_name: 'HamsPortal (Auto)',
    recipient_ids: [],
    recipient_names: [],
    body: msgBody,
    is_auto_request: true,
  }
  if (caller!.activeCompanyId) {
    messagePayload.company_id = caller!.activeCompanyId
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await service.from('messages').insert(messagePayload as any).then(({ error }) => {
    if (error) console.warn('phase auto-message insert failed:', error.message)
  })

  return NextResponse.json({ ok: true, phase: body.phase })
}
