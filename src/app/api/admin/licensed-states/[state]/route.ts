import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ state: string }> },
) {
  const { errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const { state } = await params
  const body = await request.json().catch(() => null) as {
    required?: boolean
    forbidden?: boolean
    notes?: string | null
  } | null
  if (!body || (body.required === undefined && body.forbidden === undefined && body.notes === undefined)) {
    return NextResponse.json({ error: 'no fields to update' }, { status: 400 })
  }

  const service = createServiceClient()
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.required !== undefined) patch.required = body.required
  if (body.forbidden !== undefined) patch.forbidden = body.forbidden
  if (body.notes !== undefined) patch.notes = body.notes

  const { error } = await service.from('licensed_states').update(patch).eq('state', state.toUpperCase())
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ state: string }> },
) {
  const { errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const { state } = await params
  const service = createServiceClient()
  const { error } = await service.from('licensed_states').delete().eq('state', state.toUpperCase())
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
