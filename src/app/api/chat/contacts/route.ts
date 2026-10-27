import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isMissingTable } from '@/lib/chat/missing-table'
import type { ChatContact } from '@/lib/chat/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: me } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  const isAdmin = me?.role === 'admin'

  if (isAdmin) {
    const { data } = await supabase
      .from('profiles').select('id,name,email,role').neq('id', user.id)
      .order('name', { ascending: true })
    return NextResponse.json({ contacts: (data ?? []) as ChatContact[] })
  }

  const { data: perms, error: pErr } = await supabase
    .from('chat_permissions').select('user_a_id,user_b_id')
  if (pErr && isMissingTable(pErr)) {
    return NextResponse.json({ contacts: [], migrationPending: true })
  }
  const partnerIds = new Set<string>()
  for (const r of (perms ?? []) as Array<{ user_a_id: string; user_b_id: string }>) {
    if (r.user_a_id === user.id) partnerIds.add(r.user_b_id)
    else if (r.user_b_id === user.id) partnerIds.add(r.user_a_id)
  }

  const { data: admins } = await supabase
    .from('profiles').select('id,name,email,role').eq('role', 'admin').neq('id', user.id)
  for (const a of (admins ?? []) as Array<{ id: string }>) partnerIds.add(a.id)

  if (partnerIds.size === 0) return NextResponse.json({ contacts: [] })
  const { data } = await supabase
    .from('profiles').select('id,name,email,role')
    .in('id', Array.from(partnerIds)).order('name', { ascending: true })
  return NextResponse.json({ contacts: (data ?? []) as ChatContact[] })
}
