import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Any authenticated user can update a limited set of their own profile
// fields. Uses the caller's session (not service role) — the
// profiles_update_self RLS policy enforces id=auth.uid() and the
// profiles_role_guard trigger prevents role/email changes.
export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null) as {
    name?: string
    emailNotificationsEnabled?: boolean
  } | null
  if (!body || (body.name === undefined && body.emailNotificationsEnabled === undefined)) {
    return NextResponse.json({ error: 'no fields to update' }, { status: 400 })
  }
  if (body.name !== undefined && (typeof body.name !== 'string' || body.name.length > 200)) {
    return NextResponse.json({ error: 'name too long' }, { status: 400 })
  }
  if (body.emailNotificationsEnabled !== undefined && typeof body.emailNotificationsEnabled !== 'boolean') {
    return NextResponse.json({ error: 'emailNotificationsEnabled must be boolean' }, { status: 400 })
  }

  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.name !== undefined) patch.name = body.name
  if (body.emailNotificationsEnabled !== undefined) patch.email_notifications_enabled = body.emailNotificationsEnabled

  let { error } = await supabase.from('profiles').update(patch).eq('id', user.id)
  // Pre-migration fallback: email_notifications_enabled column doesn't exist
  // yet. Retry without it so name updates still land.
  if (error && error.code === '42703' && body.emailNotificationsEnabled !== undefined) {
    delete patch.email_notifications_enabled
    if (Object.keys(patch).length > 1) {
      const { error: e2 } = await supabase.from('profiles').update(patch).eq('id', user.id)
      error = e2
    } else {
      return NextResponse.json({ error: 'Column not yet migrated' }, { status: 503 })
    }
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
