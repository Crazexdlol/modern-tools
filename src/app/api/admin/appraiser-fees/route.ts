import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

/**
 * Bulk-upsert per-user fee amounts. Body:
 *   { userId, fees: [{ feeId, amount }] }
 * amount === null clears the row (deletes it).
 * amount is a number sets/updates the row.
 */
export async function POST(request: NextRequest) {
  const { errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const body = await request.json().catch(() => null) as {
    userId?: string
    fees?: { feeId: string; amount: number | null }[]
  } | null
  if (!body?.userId || !Array.isArray(body.fees)) {
    return NextResponse.json({ error: 'userId and fees array required' }, { status: 400 })
  }

  const service = createServiceClient()
  const nowIso = new Date().toISOString()
  const toUpsert = body.fees
    .filter(f => typeof f.amount === 'number' && Number.isFinite(f.amount))
    .map(f => ({ user_id: body.userId, fee_id: f.feeId, amount: f.amount, updated_at: nowIso }))
  const toDelete = body.fees
    .filter(f => f.amount === null)
    .map(f => f.feeId)

  if (toUpsert.length > 0) {
    const { error } = await service.from('appraiser_fees').upsert(toUpsert, { onConflict: 'user_id,fee_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }
  if (toDelete.length > 0) {
    const { error } = await service.from('appraiser_fees')
      .delete()
      .eq('user_id', body.userId)
      .in('fee_id', toDelete)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}
