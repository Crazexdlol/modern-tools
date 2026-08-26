import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const { errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const body = await request.json().catch(() => null) as {
    email?: string; name?: string; password?: string; role?: 'admin' | 'appraiser'
  } | null

  if (!body?.email || !body.password || !body.role) {
    return NextResponse.json({ error: 'email, password, and role are required' }, { status: 400 })
  }
  if (!['admin', 'appraiser'].includes(body.role)) {
    return NextResponse.json({ error: 'role must be admin or appraiser' }, { status: 400 })
  }

  const service = createServiceClient()

  // Create the auth user. email_confirm=true skips the email verification loop
  // since the admin is setting the password directly.
  const { data: created, error: createErr } = await service.auth.admin.createUser({
    email: body.email,
    password: body.password,
    email_confirm: true,
    user_metadata: { name: body.name ?? '' },
  })
  if (createErr || !created?.user) {
    return NextResponse.json({ error: createErr?.message ?? 'Create user failed' }, { status: 400 })
  }

  // The on_auth_user_created trigger already inserted a profiles row with
  // role='appraiser'. Update it to the requested role + name.
  const { error: updErr } = await service
    .from('profiles')
    .update({ name: body.name ?? '', role: body.role, updated_at: new Date().toISOString() })
    .eq('id', created.user.id)
  if (updErr) {
    console.error('Failed to set profile role/name after create:', updErr)
    return NextResponse.json({ error: 'User created but profile update failed' }, { status: 500 })
  }

  return NextResponse.json({ id: created.user.id })
}
