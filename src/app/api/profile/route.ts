import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Any authenticated user can update their own name. Uses the caller's session
// (not service role) — the profiles_update_self RLS policy enforces id=auth.uid()
// and the profiles_role_guard trigger prevents role/email changes.
export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null) as { name?: string } | null
  if (body?.name === undefined) {
    return NextResponse.json({ error: 'name required' }, { status: 400 })
  }
  if (typeof body.name !== 'string' || body.name.length > 200) {
    return NextResponse.json({ error: 'name too long' }, { status: 400 })
  }

  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { error } = await supabase
    .from('profiles')
    .update({ name: body.name, updated_at: new Date().toISOString() })
    .eq('id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
