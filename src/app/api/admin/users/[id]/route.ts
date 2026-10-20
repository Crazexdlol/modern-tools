import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin, assertCanTargetUser } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { caller, errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const { id } = await params
  const guard = await assertCanTargetUser(id, caller!)
  if (guard) return guard
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
    showInNegotiatingAppraiserList?: boolean
    marketingAccess?: boolean
    canSubmitWithoutHandoff?: boolean
    emailNotificationsEnabled?: boolean
    claimTypes?: string[]
    disabledTools?: string[]
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
      body.isActive === undefined &&
      body.showInNegotiatingAppraiserList === undefined &&
      body.marketingAccess === undefined &&
      body.canSubmitWithoutHandoff === undefined &&
      body.emailNotificationsEnabled === undefined &&
      body.claimTypes === undefined &&
      body.disabledTools === undefined)
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
  if (body.showInNegotiatingAppraiserList !== undefined) patch.show_in_handling_appraiser_list = body.showInNegotiatingAppraiserList
  if (body.marketingAccess !== undefined) patch.marketing_access = body.marketingAccess
  if (body.canSubmitWithoutHandoff !== undefined) patch.can_submit_without_handoff = body.canSubmitWithoutHandoff
  if (body.emailNotificationsEnabled !== undefined) patch.email_notifications_enabled = body.emailNotificationsEnabled
  if (body.claimTypes !== undefined) patch.claim_types = body.claimTypes.filter(t => typeof t === 'string')
  if (body.disabledTools !== undefined) patch.disabled_tools = body.disabledTools.filter(t => typeof t === 'string')

  let { error } = await service.from('profiles').update(patch).eq('id', id)
  // Pre-migration fallback: any of the newer columns may not exist yet.
  // Retry without whichever are missing so other field updates still land.
  if (error && error.code === '42703') {
    const retryPatch = { ...patch }
    if (body.canSubmitWithoutHandoff !== undefined) delete retryPatch.can_submit_without_handoff
    if (body.emailNotificationsEnabled !== undefined) delete retryPatch.email_notifications_enabled
    if (body.claimTypes !== undefined) delete retryPatch.claim_types
    if (body.disabledTools !== undefined) delete retryPatch.disabled_tools
    const { error: e2 } = await service.from('profiles').update(retryPatch).eq('id', id)
    error = e2
  }
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
  const guard = await assertCanTargetUser(id, caller!)
  if (guard) return guard

  const service = createServiceClient()
  // Guard: acv_history.user_id is ON DELETE CASCADE. Deleting a user with
  // open claims destroys those claims silently. Force the admin to reassign
  // first — return 409 with the count so the UI can show it.
  const { count } = await service
    .from('acv_history')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', id)
  if ((count ?? 0) > 0) {
    return NextResponse.json({
      error: `Cannot delete: user has ${count} claim(s). Reassign them first.`,
      claimCount: count,
    }, { status: 409 })
  }
  const { error } = await service.auth.admin.deleteUser(id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  // profiles cascades via ON DELETE CASCADE. Existing claims' assigned_to
  // becomes null via ON DELETE SET NULL.
  return NextResponse.json({ ok: true })
}
