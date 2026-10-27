import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isMissingTable } from '@/lib/chat/missing-table'

export const dynamic = 'force-dynamic'

type Row = {
  id: string; conversation_id: string; sender_id: string | null; body: string
  attachment_url: string | null; attachment_name: string | null
  attachment_size: number | null; attachment_mime: string | null
  edited_at: string | null; deleted_at: string | null; created_at: string
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const parsed = await req.json().catch(() => null) as { body?: string } | null
  if (parsed?.body === undefined) return NextResponse.json({ error: 'body required' }, { status: 400 })
  const next = (parsed.body ?? '').trim()
  if (!next) return NextResponse.json({ error: 'empty body' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('chat_messages')
    .update({ body: next, edited_at: new Date().toISOString() })
    .eq('id', id).eq('sender_id', user.id).is('deleted_at', null)
    .select().maybeSingle()
  if (error && isMissingTable(error)) return NextResponse.json({ migrationPending: true }, { status: 503 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'not found or not editable' }, { status: 404 })

  const row = data as Row
  return NextResponse.json({
    message: {
      id: row.id, conversationId: row.conversation_id, senderId: row.sender_id,
      body: row.body, attachmentUrl: row.attachment_url, attachmentName: row.attachment_name,
      attachmentSize: row.attachment_size, attachmentMime: row.attachment_mime,
      editedAt: row.edited_at, deletedAt: row.deleted_at, createdAt: row.created_at,
    },
  })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('chat_messages')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id).eq('sender_id', user.id)
    .select().maybeSingle()
  if (error && isMissingTable(error)) return NextResponse.json({ migrationPending: true }, { status: 503 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 })

  return NextResponse.json({ ok: true })
}
