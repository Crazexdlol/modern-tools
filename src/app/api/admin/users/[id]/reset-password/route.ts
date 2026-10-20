import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin, assertCanTargetUser } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

/**
 * Admin resets a user's password. Sets it to whatever the admin enters — no
 * email flow, no reset link. Admin is expected to communicate the new
 * password out-of-band.
 *
 * Body: { password: string }  (min 8 chars)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { caller, errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const { id } = await params
  const guard = await assertCanTargetUser(id, caller!)
  if (guard) return guard
  const body = await request.json().catch(() => null) as { password?: string } | null
  if (!body?.password || body.password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  const service = createServiceClient()
  const { error } = await service.auth.admin.updateUserById(id, { password: body.password })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
