import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'

// POST /api/profile/licenses
// Any authenticated user can insert a license for THEMSELVES. The row's
// user_id is forced to auth.uid() — the caller cannot name someone else.
// Mirrors /api/admin/appraiser-licenses but with a self-only guard; admins
// can still use the admin route to add licenses for other users.
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await request.json().catch(() => null) as {
    state?: string
    licenseNumber?: string
    expirationDate?: string
    issuedDate?: string | null
    status?: 'active' | 'expired' | 'pending'
    licenseType?: string | null
    notes?: string | null
  } | null
  if (!body?.state || !body?.licenseNumber || !body?.expirationDate) {
    return NextResponse.json({ error: 'state, licenseNumber, expirationDate required' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data, error } = await service.from('appraiser_licenses').insert({
    user_id: user.id,
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
