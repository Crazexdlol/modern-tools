import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'

// Shared ownership guard — appraisers can only touch their own license rows.
// Admins can use /api/admin/appraiser-licenses/[id] instead.
async function requireOwnership(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { userId: null, errorResponse: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) }

  const service = createServiceClient()
  const { data: row, error } = await service.from('appraiser_licenses').select('user_id').eq('id', id).maybeSingle()
  if (error) return { userId: null, errorResponse: NextResponse.json({ error: error.message }, { status: 400 }) }
  if (!row) return { userId: null, errorResponse: NextResponse.json({ error: 'not found' }, { status: 404 }) }
  if (row.user_id !== user.id) {
    return { userId: null, errorResponse: NextResponse.json({ error: 'Not your license' }, { status: 403 }) }
  }
  return { userId: user.id, errorResponse: null }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { errorResponse } = await requireOwnership(id)
  if (errorResponse) return errorResponse

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

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { errorResponse } = await requireOwnership(id)
  if (errorResponse) return errorResponse

  const service = createServiceClient()
  const { error } = await service.from('appraiser_licenses').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
