import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isMissingTable } from '@/lib/chat/missing-table'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: mem, error: memErr } = await supabase
    .from('chat_conversation_members').select('conversation_id,last_read_at').eq('user_id', user.id)
  if (memErr && isMissingTable(memErr)) return NextResponse.json({ unread: 0, migrationPending: true })
  if (memErr) return NextResponse.json({ error: memErr.message }, { status: 500 })

  const memRows = (mem ?? []) as Array<{ conversation_id: string; last_read_at: string | null }>
  const convIds = memRows.map(r => r.conversation_id)
  if (convIds.length === 0) return NextResponse.json({ unread: 0 })

  const { data: msgs, error: msgErr } = await supabase
    .from('chat_messages').select('conversation_id,sender_id,created_at')
    .in('conversation_id', convIds)
  if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 })

  const lastReadByConv = new Map<string, string | null>()
  for (const r of memRows) lastReadByConv.set(r.conversation_id, r.last_read_at)

  let unread = 0
  for (const m of (msgs ?? []) as Array<{ conversation_id: string; sender_id: string | null; created_at: string }>) {
    if (m.sender_id === user.id) continue
    const lastRead = lastReadByConv.get(m.conversation_id)
    if (!lastRead || m.created_at > lastRead) unread += 1
  }

  return NextResponse.json({ unread })
}
