import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createService } from '@supabase/supabase-js'
import { isMissingTable } from '@/lib/chat/missing-table'
import { sendChatPush } from '@/lib/chat/push'

export const dynamic = 'force-dynamic'

interface SendBody {
  id?: string
  conversationId: string
  body?: string
  attachment?: {
    url: string
    name: string
    size: number
    mime: string
  }
}

type InsertedRow = {
  id: string; conversation_id: string; sender_id: string | null; body: string
  attachment_url: string | null; attachment_name: string | null
  attachment_size: number | null; attachment_mime: string | null
  edited_at: string | null; deleted_at: string | null; created_at: string
}

export async function POST(req: NextRequest) {
  const parsed = await req.json().catch(() => null) as SendBody | null
  if (!parsed?.conversationId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 })
  const body = (parsed.body ?? '').trim()
  if (!body && !parsed.attachment) return NextResponse.json({ error: 'body or attachment required' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: mem, error: memErr } = await supabase
    .from('chat_conversation_members').select('user_id')
    .eq('conversation_id', parsed.conversationId)
  if (memErr && isMissingTable(memErr)) return NextResponse.json({ migrationPending: true }, { status: 503 })
  if (memErr) return NextResponse.json({ error: memErr.message }, { status: 500 })
  const members = ((mem ?? []) as Array<{ user_id: string }>).map(r => r.user_id)
  if (!members.includes(user.id)) return NextResponse.json({ error: 'not a member' }, { status: 403 })

  const insertPayload: Record<string, unknown> = {
    conversation_id: parsed.conversationId,
    sender_id: user.id,
    body,
  }
  if (parsed.id) insertPayload.id = parsed.id
  if (parsed.attachment) {
    insertPayload.attachment_url = parsed.attachment.url
    insertPayload.attachment_name = parsed.attachment.name
    insertPayload.attachment_size = parsed.attachment.size
    insertPayload.attachment_mime = parsed.attachment.mime
  }
  const { data: inserted, error: iErr } = await supabase
    .from('chat_messages').insert(insertPayload).select().single()
  if (iErr) return NextResponse.json({ error: iErr.message }, { status: 500 })

  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (serviceUrl && serviceKey) {
    const admin = createService(serviceUrl, serviceKey, { auth: { persistSession: false } })
    await admin.from('chat_conversations').update({ updated_at: new Date().toISOString() })
      .eq('id', parsed.conversationId)
  }

  const recipientId = members.find(m => m !== user.id)
  if (recipientId) {
    const { data: me } = await supabase.from('profiles').select('name,email').eq('id', user.id).maybeSingle()
    const meRow = me as { name?: string; email?: string } | null
    const senderName = (meRow?.name || meRow?.email || 'A teammate')
    const preview = body || (parsed.attachment?.name ? `[Attachment: ${parsed.attachment.name}]` : '[Attachment]')
    void sendChatPush({ recipientUserId: recipientId, conversationId: parsed.conversationId, senderName, preview })
  }

  const row = inserted as InsertedRow
  return NextResponse.json({
    message: {
      id: row.id, conversationId: row.conversation_id, senderId: row.sender_id,
      body: row.body, attachmentUrl: row.attachment_url, attachmentName: row.attachment_name,
      attachmentSize: row.attachment_size, attachmentMime: row.attachment_mime,
      editedAt: row.edited_at, deletedAt: row.deleted_at, createdAt: row.created_at,
    },
  })
}
