import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin, assertCanTargetUser } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const { caller, errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const body = await request.json().catch(() => null) as {
    userId?: string
    state?: string
    licenseNumber?: string
    expirationDate?: string
    issuedDate?: string | null
    status?: 'active' | 'expired' | 'pending'
    licenseType?: string | null
    notes?: string | null
  } | null
  if (!body?.userId || !body?.state || !body?.licenseNumber || !body?.expirationDate) {
    return NextResponse.json({ error: 'userId, state, licenseNumber, expirationDate required' }, { status: 400 })
  }
  const guard = await assertCanTargetUser(body.userId, caller!)
  if (guard) return guard

  const service = createServiceClient()
  const { data, error } = await service.from('appraiser_licenses').insert({
    user_id: body.userId,
    state: body.state.toUpperCase(),
    license_number: body.licenseNumber,
    expiration_date: body.expirationDate,
    issued_date: body.issuedDate ?? null,
    status: body.status ?? 'active',
    license_type: body.licenseType ?? null,
    notes: body.notes ?? null,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, license: data })
}
