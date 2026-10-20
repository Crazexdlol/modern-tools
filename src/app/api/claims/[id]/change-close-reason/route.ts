import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin, fetchClaim } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

type CloseReason = 'completed' | 'cancelled'

// POST /api/claims/[id]/change-close-reason  { reason: 'completed' | 'cancelled' }
//
// Flips an already-closed claim between the two close reasons without
// reopening it. Used by the admin when a claim was marked Completed but
// should have been Cancelled (or vice versa) — switching reason this way
// also pulls the claim out of (or back into) Settlement Analytics without
// disturbing closed_at, submitted_at, etc.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { caller, errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const { id } = await params
  const claim = await fetchClaim(id, caller!.activeCompanyId ?? undefined)
  if (!claim) return NextResponse.json({ error: 'Claim not found' }, { status: 404 })
  if (claim.status !== 'closed') {
    return NextResponse.json({ error: 'Claim is not closed' }, { status: 400 })
  }

  let reason: CloseReason
  try {
    const body = await request.json() as { reason?: string } | null
    if (body?.reason === 'completed' || body?.reason === 'cancelled') {
      reason = body.reason
    } else {
      return NextResponse.json({ error: "reason must be 'completed' or 'cancelled'" }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: 'reason required in JSON body' }, { status: 400 })
  }

  const service = createServiceClient()
  const { error } = await service
    .from('acv_history')
    .update({ close_reason: reason })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, reason })
}
