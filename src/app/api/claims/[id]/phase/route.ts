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
  const { errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const body = await request.json().catch(() => null) as { phase?: string | null } | null
  if (body === null || body.phase === undefined) {
    return NextResponse.json({ error: 'phase required (string or null)' }, { status: 400 })
  }

  const service = createServiceClient()

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
  const msgBody = body.phase === null
    ? 'Phase removed from claim'
    : `Claim has been phased: ${label}`
  await service.from('messages').insert({
    claim_id: id,
    sender_id: null,
    sender_name: 'Modern Tools (Auto)',
    recipient_ids: [],
    body: msgBody,
    is_auto_request: true,
  }).then(({ error }) => {
    if (error) console.warn('phase auto-message insert failed:', error.message)
  })

  return NextResponse.json({ ok: true, phase: body.phase })
}
