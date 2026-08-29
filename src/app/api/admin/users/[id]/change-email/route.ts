import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

/**
 * Admin changes a user's email. Updates both auth.users and the mirror on
 * profiles.email so the display everywhere stays in sync. Uses
 * email_confirm: true to skip the confirmation flow — the admin is trusted
 * to have verified the new address.
 *
 * Body: { email: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const { id } = await params
  const body = await request.json().catch(() => null) as { email?: string } | null
  const email = body?.email?.trim().toLowerCase()
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'Valid email address required' }, { status: 400 })
  }

  const service = createServiceClient()

  // 1. Update auth.users (source of truth for login).
  const { error: authErr } = await service.auth.admin.updateUserById(id, {
    email,
    email_confirm: true,
  })
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 })

  // 2. Mirror to profiles.email so display/name lookups stay correct.
  const { error: profileErr } = await service
    .from('profiles')
    .update({ email, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (profileErr) {
    // Auth email changed but profile mirror failed — surface the mismatch.
    return NextResponse.json(
      { error: `Auth email updated but profile mirror failed: ${profileErr.message}` },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true })
}
