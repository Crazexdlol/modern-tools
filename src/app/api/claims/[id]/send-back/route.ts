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
  if (!claim.submittedAt) return NextResponse.json({ error: 'Claim is not submitted' }, { status: 400 })

  const service = createServiceClient()
  // Clear the 'completed' phase alongside submitted_at. Any other phase
  // (Umpire / Hold / etc.) is left alone — send-back is un-submit, not
  // "wipe all admin annotations".
  const patch: Record<string, unknown> = { submitted_at: null, submitted_by: null }
  if (claim.statusPhase === 'completed') {
    patch.status_phase = null
    patch.status_phase_set_at = null
  }
  const { error } = await service
    .from('acv_history')
    .update(patch)
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
