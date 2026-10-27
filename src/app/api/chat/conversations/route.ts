import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createService } from '@supabase/supabase-js'
import { isMissingTable } from '@/lib/chat/missing-table'
import { canonicalPair } from '@/lib/chat/types'

export const dynamic = 'force-dynamic'

type MessageRow = {
  id: string; conversation_id: string; sender_id: string | null; body: string
  attachment_url: string | null; attachment_name: string | null
  attachment_size: number | null; attachment_mime: string | null
  edited_at: string | null; deleted_at: string | null; created_at: string
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: mine, error } = await supabase
    .from('chat_conversation_members')
    .select('conversation_id,last_read_at')
    .eq('user_id', user.id)
  if (error && isMissingTable(error)) {
    return NextResponse.json({ conversations: [], migrationPending: true })
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ids = ((mine ?? []) as Array<{ conversation_id: string }>).map(r => r.conversation_id)
  if (ids.length === 0) return NextResponse.json({ conversations: [] })

  const [convsRes, membersRes, msgsRes] = await Promise.all([
    supabase.from('chat_conversations').select('*').in('id', ids),
    supabase.from('chat_conversation_members').select('conversation_id,user_id').in('conversation_id', ids),
    supabase.from('chat_messages').select('*').in('conversation_id', ids).order('created_at', { ascending: false }),
  ])

  const lastByConv = new Map<string, MessageRow>()
  for (const m of (msgsRes.data ?? []) as MessageRow[]) {
    if (!lastByConv.has(m.conversation_id)) lastByConv.set(m.conversation_id, m)
  }

  const otherByConv = new Map<string, string>()
  for (const row of ((membersRes.data ?? []) as Array<{ conversation_id: string; user_id: string }>)) {
    if (row.user_id !== user.id) otherByConv.set(row.conversation_id, row.user_id)
  }

  const otherIds = Array.from(new Set(Array.from(otherByConv.values())))
  const profilesRes = otherIds.length
    ? await supabase.from('profiles').select('id,name,email,role').in('id', otherIds)
    : { data: [] as Array<{ id: string; name: string; email: string; role: string }> }

  const profById = new Map<string, { id: string; name: string; email: string; role: string }>()
  for (const p of ((profilesRes.data ?? []) as Array<{ id: string; name: string; email: string; role: string }>)) {
    profById.set(p.id, p)
  }

  const lastReadByConv = new Map<string, string | null>()
  for (const r of ((mine ?? []) as Array<{ conversation_id: string; last_read_at: string | null }>)) {
    lastReadByConv.set(r.conversation_id, r.last_read_at ?? null)
  }

  const unreadCounts = new Map<string, number>()
  for (const m of (msgsRes.data ?? []) as MessageRow[]) {
    const lastRead = lastReadByConv.get(m.conversation_id)
    const isUnread = (!lastRead || m.created_at > lastRead) && m.sender_id !== user.id
    if (isUnread) unreadCounts.set(m.conversation_id, (unreadCounts.get(m.conversation_id) ?? 0) + 1)
  }

  const result = ((convsRes.data ?? []) as Array<{ id: string; type: 'direct' | 'group'; created_at: string; updated_at: string }>)
    .map((cv) => {
      const otherId = otherByConv.get(cv.id) ?? null
      const prof = otherId ? profById.get(otherId) ?? null : null
      const lm = lastByConv.get(cv.id) ?? null
      return {
        conversation: { id: cv.id, type: cv.type, createdAt: cv.created_at, updatedAt: cv.updated_at },
        counterpart: prof ? { id: prof.id, name: prof.name, email: prof.email, role: prof.role } : null,
        lastMessage: lm ? {
          id: lm.id, conversationId: lm.conversation_id, senderId: lm.sender_id,
          body: lm.body, attachmentUrl: lm.attachment_url, attachmentName: lm.attachment_name,
          attachmentSize: lm.attachment_size, attachmentMime: lm.attachment_mime,
          editedAt: lm.edited_at, deletedAt: lm.deleted_at, createdAt: lm.created_at,
        } : null,
        unread: unreadCounts.get(cv.id) ?? 0,
      }
    })
    .sort((a, b) => (b.conversation.updatedAt).localeCompare(a.conversation.updatedAt))

  return NextResponse.json({ conversations: result })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { otherUserId?: string } | null
  if (!body?.otherUserId) return NextResponse.json({ error: 'otherUserId required' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (body.otherUserId === user.id) return NextResponse.json({ error: 'self-chat not allowed' }, { status: 400 })

  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  const { data: other } = await supabase.from('profiles').select('id,role').eq('id', body.otherUserId).maybeSingle()
  if (!other) return NextResponse.json({ error: 'other user not found' }, { status: 404 })
  const callerIsAdmin = me?.role === 'admin'
  const otherIsAdmin = (other as { role: string }).role === 'admin'
  const { userAId, userBId } = canonicalPair(user.id, body.otherUserId)
  const { data: permRow, error: permErr } = await supabase
    .from('chat_permissions').select('user_a_id,user_b_id')
    .eq('user_a_id', userAId).eq('user_b_id', userBId).maybeSingle()
  if (permErr && isMissingTable(permErr)) {
    return NextResponse.json({ migrationPending: true }, { status: 503 })
  }
  const allowed = callerIsAdmin || otherIsAdmin || !!permRow
  if (!allowed) return NextResponse.json({ error: 'not permitted' }, { status: 403 })

  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceUrl || !serviceKey) return NextResponse.json({ error: 'server misconfigured' }, { status: 500 })
  const admin = createService(serviceUrl, serviceKey, { auth: { persistSession: false } })

  const { data: existingCands } = await admin
    .from('chat_conversation_members')
    .select('conversation_id,user_id')
    .in('user_id', [user.id, body.otherUserId])

  const byConv = new Map<string, Set<string>>()
  for (const r of ((existingCands ?? []) as Array<{ conversation_id: string; user_id: string }>)) {
    const s = byConv.get(r.conversation_id) ?? new Set<string>()
    s.add(r.user_id)
    byConv.set(r.conversation_id, s)
  }
  const sharedIds = Array.from(byConv.entries())
    .filter(([, s]) => s.has(user.id) && s.has(body.otherUserId!))
    .map(([id]) => id)
  if (sharedIds.length > 0) {
    const { data: convs } = await admin
      .from('chat_conversations').select('id,type,created_at,updated_at')
      .in('id', sharedIds).eq('type', 'direct')
    for (const c of ((convs ?? []) as Array<{ id: string; type: string; created_at: string; updated_at: string }>)) {
      const members = byConv.get(c.id)
      if (members && members.size === 2) {
        return NextResponse.json({
          conversation: { id: c.id, type: 'direct' as const, createdAt: c.created_at, updatedAt: c.updated_at },
          created: false,
        })
      }
    }
  }

  const { data: conv, error: cErr } = await admin
    .from('chat_conversations').insert({ type: 'direct' }).select().single()
  if (cErr || !conv) return NextResponse.json({ error: cErr?.message ?? 'create failed' }, { status: 500 })
  const convRow = conv as { id: string; created_at: string; updated_at: string }
  const { error: mErr } = await admin.from('chat_conversation_members').insert([
    { conversation_id: convRow.id, user_id: user.id },
    { conversation_id: convRow.id, user_id: body.otherUserId },
  ])
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 })

  return NextResponse.json({
    conversation: {
      id: convRow.id,
      type: 'direct' as const,
      createdAt: convRow.created_at,
      updatedAt: convRow.updated_at,
    },
    created: true,
  })
}
