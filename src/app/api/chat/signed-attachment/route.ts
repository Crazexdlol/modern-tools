import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createService } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get('path')
  if (!path) return NextResponse.json({ error: 'path required' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const convId = path.split('/')[0]
  const { data: mem } = await supabase.from('chat_conversation_members')
    .select('user_id').eq('conversation_id', convId).eq('user_id', user.id).maybeSingle()
  if (!mem) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceUrl || !serviceKey) return NextResponse.json({ error: 'misconfigured' }, { status: 500 })
  const admin = createService(serviceUrl, serviceKey, { auth: { persistSession: false } })

  const { data, error } = await admin.storage.from('chat-attachments').createSignedUrl(path, 300)
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'sign failed' }, { status: 500 })

  return NextResponse.redirect(data.signedUrl, 302)
}
