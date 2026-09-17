import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin, fetchClaim } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { caller, errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const { id } = await params
  const claim = await fetchClaim(id, caller!.activeCompanyId ?? undefined)
  if (!claim) return NextResponse.json({ error: 'Claim not found' }, { status: 404 })
  if (claim.status !== 'closed') return NextResponse.json({ error: 'Claim is not closed' }, { status: 400 })

  const service = createServiceClient()
  // Clear the 'completed' phase alongside submitted_at so the reopened
  // claim goes back to a clean active state. Other admin-set phases
  // (Umpire, Hold, etc.) are left alone.
  const patch: Record<string, unknown> = {
    status: 'open',
    submitted_at: null,
    submitted_by: null,
    closed_at: null,
  }
  if (claim.statusPhase === 'completed') {
    patch.status_phase = null
    patch.status_phase_set_at = null
  }
  let { error } = await service
    .from('acv_history')
    .update(patch)
    .eq('id', id)
  if (error && error.code === '42703') {
    // closed_at column hasn't been migrated yet — retry without it.
    delete patch.closed_at
    ;({ error } = await service
      .from('acv_history')
      .update(patch)
      .eq('id', id))
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
