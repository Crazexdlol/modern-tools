import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

// PATCH — update an opposing appraiser. Admin only.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const { id } = await params
  const body = await request.json().catch(() => null) as {
    name?: string
    company?: string | null
    phone?: string | null
    email?: string | null
    notes?: string | null
  } | null

  if (!body || Object.keys(body).length === 0) {
    return NextResponse.json({ error: 'no fields to update' }, { status: 400 })
  }

  const service = createServiceClient()
  const patch: Record<string, unknown> = {}
  if (body.name !== undefined) patch.name = body.name.trim()
  if (body.company !== undefined) patch.company = body.company?.trim() || null
  if (body.phone !== undefined) patch.phone = body.phone?.trim() || null
  if (body.email !== undefined) patch.email = body.email?.trim() || null
  if (body.notes !== undefined) patch.notes = body.notes?.trim() || null

  const { error } = await service
    .from('opposing_appraisers')
    .update(patch)
    .eq('id', id)

  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json({ error: 'Table not found — run the opposing-appraisers migration first.' }, { status: 503 })
    }
    if (error.code === '23505') {
      return NextResponse.json({ error: 'An active opposing appraiser with this name and company already exists.' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}

// DELETE — soft-delete (sets archived_at). Admin only.
// Hard-delete is not supported in v1 — archive instead.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const { id } = await params
  const service = createServiceClient()

  const { error } = await service
    .from('opposing_appraisers')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json({ error: 'Table not found — run the opposing-appraisers migration first.' }, { status: 503 })
    }
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
