import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isMissingTable } from '@/lib/chat/missing-table'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const parsed = await req.json().catch(() => null) as { conversationId?: string } | null
  if (!parsed?.conversationId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { error } = await supabase
    .from('chat_conversation_members')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', parsed.conversationId).eq('user_id', user.id)
  if (error && isMissingTable(error)) return NextResponse.json({ migrationPending: true }, { status: 503 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
