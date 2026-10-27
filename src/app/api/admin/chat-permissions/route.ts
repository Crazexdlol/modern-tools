import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isMissingTable } from '@/lib/chat/missing-table'
import { canonicalPair } from '@/lib/chat/types'

export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, admin: false }
  const { data } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  return { supabase, user, admin: (data as { role?: string } | null)?.role === 'admin' }
}

export async function GET() {
  const { supabase, admin } = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const [profilesRes, permsRes] = await Promise.all([
    supabase.from('profiles').select('id,name,email,role').order('name'),
    supabase.from('chat_permissions').select('user_a_id,user_b_id'),
  ])
  if (permsRes.error && isMissingTable(permsRes.error)) {
    return NextResponse.json({ users: profilesRes.data ?? [], permissions: [], migrationPending: true })
  }
  if (permsRes.error) return NextResponse.json({ error: permsRes.error.message }, { status: 500 })

  return NextResponse.json({
    users: profilesRes.data ?? [],
    permissions: ((permsRes.data ?? []) as Array<{ user_a_id: string; user_b_id: string }>)
      .map(r => ({ userAId: r.user_a_id, userBId: r.user_b_id })),
  })
}

export async function POST(req: NextRequest) {
  const parsed = await req.json().catch(() => null) as { userAId?: string; userBId?: string; allow?: boolean } | null
  if (!parsed?.userAId || !parsed.userBId || typeof parsed.allow !== 'boolean') {
    return NextResponse.json({ error: 'invalid payload' }, { status: 400 })
  }
  if (parsed.userAId === parsed.userBId) {
    return NextResponse.json({ error: 'self-grant not allowed' }, { status: 400 })
  }
  const { supabase, user, admin } = await requireAdmin()
  if (!admin || !user) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const pair = canonicalPair(parsed.userAId, parsed.userBId)
  if (parsed.allow) {
    const { error } = await supabase.from('chat_permissions').upsert({
      user_a_id: pair.userAId, user_b_id: pair.userBId, granted_by: user.id,
    }, { onConflict: 'user_a_id,user_b_id' })
    if (error && isMissingTable(error)) return NextResponse.json({ migrationPending: true }, { status: 503 })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await supabase.from('chat_permissions')
      .delete().eq('user_a_id', pair.userAId).eq('user_b_id', pair.userBId)
    if (error && isMissingTable(error)) return NextResponse.json({ migrationPending: true }, { status: 503 })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
