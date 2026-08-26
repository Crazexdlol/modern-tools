import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth, fetchClaim } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { caller, errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse

  const { id } = await params
  const claim = await fetchClaim(id)
  if (!claim) return NextResponse.json({ error: 'Claim not found' }, { status: 404 })
  if (claim.status !== 'open') return NextResponse.json({ error: 'Claim is not open' }, { status: 400 })
  if (claim.submittedAt) return NextResponse.json({ error: 'Claim already submitted' }, { status: 400 })

  const isAdmin = caller!.role === 'admin'
  const isAssignee = claim.assignedTo === caller!.userId
  if (!isAdmin && !isAssignee) {
    return NextResponse.json({ error: 'Not authorized to submit this claim' }, { status: 403 })
  }

  const service = createServiceClient()
  const { error } = await service
    .from('acv_history')
    .update({ submitted_at: new Date().toISOString(), submitted_by: caller!.userId })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
