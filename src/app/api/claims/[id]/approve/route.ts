import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin, fetchClaim } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

type CloseReason = 'completed' | 'cancelled'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const { id } = await params
  const claim = await fetchClaim(id)
  if (!claim) return NextResponse.json({ error: 'Claim not found' }, { status: 404 })
  if (claim.status === 'closed') return NextResponse.json({ error: 'Claim is already closed' }, { status: 400 })

  // Body: { reason?: 'completed' | 'cancelled' } — defaults to 'completed'
  // so pre-migration callers (bulk-close from the dashboard, etc.) keep
  // working without change. If the close_reason column hasn't been added
  // yet (42703) we fall back to the legacy status-only update below.
  let reason: CloseReason = 'completed'
  try {
    const body = await request.json() as { reason?: string } | null
    if (body?.reason === 'cancelled') reason = 'cancelled'
  } catch {
    // No body / not JSON — keep the default.
  }

  const service = createServiceClient()
  const now = new Date().toISOString()
  // Attempt with the full new-column set first; if either close_reason or
  // closed_at hasn't been migrated yet the DB returns 42703 and we retry
  // with fewer columns so the API still succeeds.
  let { error } = await service
    .from('acv_history')
    .update({ status: 'closed', close_reason: reason, closed_at: now })
    .eq('id', id)
  if (error && error.code === '42703') {
    // Try without closed_at (close_reason migrated, closed_at not).
    ;({ error } = await service
      .from('acv_history')
      .update({ status: 'closed', close_reason: reason })
      .eq('id', id))
  }
  if (error && error.code === '42703') {
    // Neither migrated yet — legacy status-only close.
    ;({ error } = await service
      .from('acv_history')
      .update({ status: 'closed' })
      .eq('id', id))
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, reason })
}
