import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isMissingTable } from '@/lib/chat/missing-table'

export const dynamic = 'force-dynamic'

type MessageRow = {
  id: string; conversation_id: string; sender_id: string | null; body: string
  attachment_url: string | null; attachment_name: string | null
  attachment_size: number | null; attachment_mime: string | null
  edited_at: string | null; deleted_at: string | null; created_at: string
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: conversationId } = await params
  const url = new URL(req.url)
  const before = url.searchParams.get('before')
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 50), 1), 200)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let q = supabase.from('chat_messages').select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (before) q = q.lt('created_at', before)

  const { data, error } = await q
  if (error && isMissingTable(error)) {
    return NextResponse.json({ messages: [], migrationPending: true })
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const messages = ((data ?? []) as MessageRow[])
    .map(m => ({
      id: m.id, conversationId: m.conversation_id, senderId: m.sender_id,
      body: m.body, attachmentUrl: m.attachment_url, attachmentName: m.attachment_name,
      attachmentSize: m.attachment_size, attachmentMime: m.attachment_mime,
      editedAt: m.edited_at, deletedAt: m.deleted_at, createdAt: m.created_at,
    }))
    .reverse()
  return NextResponse.json({ messages })
}
