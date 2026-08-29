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
    name?: string
    role?: 'admin' | 'appraiser'
    canReassignClaims?: boolean
    canEditClaimInfo?: boolean
    canCreateClaims?: boolean
    autoStatusRequestsOverride?: boolean | null
    phone?: string | null
    addressStreet?: string | null
    addressCity?: string | null
    addressState?: string | null
    addressZip?: string | null
    isActive?: boolean
  } | null
  if (
    !body ||
    (body.name === undefined &&
      body.role === undefined &&
      body.canReassignClaims === undefined &&
      body.canEditClaimInfo === undefined &&
      body.canCreateClaims === undefined &&
      body.autoStatusRequestsOverride === undefined &&
      body.phone === undefined &&
      body.addressStreet === undefined &&
      body.addressCity === undefined &&
      body.addressState === undefined &&
      body.addressZip === undefined &&
      body.isActive === undefined)
  ) {
    return NextResponse.json({ error: 'no fields to update' }, { status: 400 })
  }
  if (body.role !== undefined && !['admin', 'appraiser'].includes(body.role)) {
    return NextResponse.json({ error: 'role must be admin or appraiser' }, { status: 400 })
  }
  if (
    body.autoStatusRequestsOverride !== undefined &&
    body.autoStatusRequestsOverride !== null &&
    typeof body.autoStatusRequestsOverride !== 'boolean'
  ) {
    return NextResponse.json({ error: 'autoStatusRequestsOverride must be boolean or null' }, { status: 400 })
  }

  const service = createServiceClient()
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.name !== undefined) patch.name = body.name
  if (body.role !== undefined) patch.role = body.role
  if (body.canReassignClaims !== undefined) patch.can_reassign_claims = body.canReassignClaims
  if (body.canEditClaimInfo !== undefined) patch.can_edit_claim_info = body.canEditClaimInfo
  if (body.canCreateClaims !== undefined) patch.can_create_claims = body.canCreateClaims
  if (body.autoStatusRequestsOverride !== undefined) patch.auto_status_requests_override = body.autoStatusRequestsOverride
  if (body.phone !== undefined) patch.phone = body.phone
  if (body.addressStreet !== undefined) patch.address_street = body.addressStreet
  if (body.addressCity !== undefined) patch.address_city = body.addressCity
  if (body.addressState !== undefined) patch.address_state = body.addressState
  if (body.addressZip !== undefined) patch.address_zip = body.addressZip
  if (body.isActive !== undefined) patch.is_active = body.isActive

  const { error } = await service.from('profiles').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { caller, errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const { id } = await params
  if (id === caller!.userId) {
    return NextResponse.json({ error: 'Admins cannot delete themselves' }, { status: 400 })
  }

  const service = createServiceClient()
  const { error } = await service.auth.admin.deleteUser(id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  // profiles cascades via ON DELETE CASCADE. Existing claims' assigned_to
  // becomes null via ON DELETE SET NULL.
  return NextResponse.json({ ok: true })
}
