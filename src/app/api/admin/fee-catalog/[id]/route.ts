import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const { id } = await params
  const body = await request.json().catch(() => null) as {
    label?: string
    unit?: 'flat' | 'per_mile'
    sortOrder?: number
    archived?: boolean
  } | null
  if (!body || (body.label === undefined && body.unit === undefined && body.sortOrder === undefined && body.archived === undefined)) {
    return NextResponse.json({ error: 'no fields to update' }, { status: 400 })
  }

  const service = createServiceClient()
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.label !== undefined) patch.label = body.label
  if (body.unit !== undefined) patch.unit = body.unit === 'per_mile' ? 'per_mile' : 'flat'
  if (body.sortOrder !== undefined) patch.sort_order = body.sortOrder
  if (body.archived !== undefined) patch.archived = body.archived

  const { error } = await service.from('fee_catalog').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const { id } = await params
  const service = createServiceClient()

  // Refuse hard delete if any user has an amount set — force archive instead
  const { count } = await service
    .from('appraiser_fees')
    .select('user_id', { count: 'exact', head: true })
    .eq('fee_id', id)
  if (count && count > 0) {
    return NextResponse.json({ error: 'Fee has amounts set on user profiles; archive it instead of deleting.' }, { status: 409 })
  }

  const { error } = await service.from('fee_catalog').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
