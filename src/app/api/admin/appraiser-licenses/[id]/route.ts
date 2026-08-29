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
    state?: string
    licenseNumber?: string
    expirationDate?: string
    issuedDate?: string | null
    status?: 'active' | 'expired' | 'pending'
    licenseType?: string | null
    notes?: string | null
  } | null
  if (!body || (body.state === undefined && body.licenseNumber === undefined && body.expirationDate === undefined && body.issuedDate === undefined && body.status === undefined && body.licenseType === undefined && body.notes === undefined)) {
    return NextResponse.json({ error: 'no fields to update' }, { status: 400 })
  }

  const service = createServiceClient()
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.state !== undefined) patch.state = body.state.toUpperCase()
  if (body.licenseNumber !== undefined) patch.license_number = body.licenseNumber
  if (body.expirationDate !== undefined) patch.expiration_date = body.expirationDate
  if (body.issuedDate !== undefined) patch.issued_date = body.issuedDate
  if (body.status !== undefined) patch.status = body.status
  if (body.licenseType !== undefined) patch.license_type = body.licenseType
  if (body.notes !== undefined) patch.notes = body.notes

  const { error } = await service.from('appraiser_licenses').update(patch).eq('id', id)
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
  const { error } = await service.from('appraiser_licenses').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
