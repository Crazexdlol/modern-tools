import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createService } from '@supabase/supabase-js'
import { CHAT_ATTACHMENT_MAX_BYTES } from '@/lib/chat/types'

export const dynamic = 'force-dynamic'

interface Body {
  conversationId: string
  messageId: string
  filename: string
  size: number
}

export async function POST(req: NextRequest) {
  const parsed = await req.json().catch(() => null) as Body | null
  if (!parsed?.conversationId || !parsed.messageId || !parsed.filename) {
    return NextResponse.json({ error: 'invalid payload' }, { status: 400 })
  }
  if (parsed.size > CHAT_ATTACHMENT_MAX_BYTES) {
    return NextResponse.json({ error: 'file too large (10 MB max)' }, { status: 413 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: mem } = await supabase.from('chat_conversation_members')
    .select('user_id').eq('conversation_id', parsed.conversationId).eq('user_id', user.id).maybeSingle()
  if (!mem) return NextResponse.json({ error: 'not a member' }, { status: 403 })

  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceUrl || !serviceKey) return NextResponse.json({ error: 'server misconfigured' }, { status: 500 })
  const admin = createService(serviceUrl, serviceKey, { auth: { persistSession: false } })

  const safeName = parsed.filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180)
  const path = `${parsed.conversationId}/${parsed.messageId}/${safeName}`
  const { data: signed, error } = await admin.storage.from('chat-attachments')
    .createSignedUploadUrl(path)
  if (error || !signed) return NextResponse.json({ error: error?.message ?? 'sign failed' }, { status: 500 })

  return NextResponse.json({ path, token: signed.token, signedUrl: signed.signedUrl })
}
