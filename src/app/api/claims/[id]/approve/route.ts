import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin, fetchClaim } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const { id } = await params
  const claim = await fetchClaim(id)
  if (!claim) return NextResponse.json({ error: 'Claim not found' }, { status: 404 })
  if (claim.status === 'closed') return NextResponse.json({ error: 'Claim is already closed' }, { status: 400 })

  const service = createServiceClient()
  // Close = set status=closed. Admin can close from any active state — no
  // "must be submitted" guard, since admins now close open+in-progress claims
  // directly from the dashboard as well as reviewed submissions from the
  // completed queue. submitted_at/by stays intact for audit trail when set.
  const { error } = await service
    .from('acv_history')
    .update({ status: 'closed' })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
