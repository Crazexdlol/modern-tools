import { NextResponse } from 'next/server'
import { requireNegotiationsAccess } from '@/lib/auth/require-negotiations'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Hard-delete a thread and everything under it: messages, attachments,
// negotiation_case, drafts. Storage-bucket cleanup for downloaded email
// attachments (if any were persisted) also runs here. Irreversible.
//
// POST rather than DELETE because Vercel's edge cache is friendlier with
// POST and it plays better with the client's fetch config.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { errorResponse } = await requireNegotiationsAccess()
  if (errorResponse) return errorResponse

  const { id } = await ctx.params
  const supabase = createServiceClient()

  // Grab attachment paths first so we can clean storage after the cascade.
  const { data: msgs } = await supabase
    .from('email_messages')
    .select('id')
    .eq('thread_id', id)
  const messageIds = (msgs ?? []).map(m => m.id)
  let paths: string[] = []
  if (messageIds.length > 0) {
    const { data: atts } = await supabase
      .from('email_attachments')
      .select('storage_path')
      .in('message_id', messageIds)
      .not('storage_path', 'is', null)
    paths = (atts ?? [])
      .map(a => a.storage_path)
      .filter((p): p is string => !!p)
  }

  // Cascade delete via the FK constraints: dropping the thread cascades
  // messages + attachments; the negotiation_case_id FK is on-delete-cascade.
  const { error } = await supabase.from('email_threads').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (paths.length > 0) {
    await supabase.storage.from('negotiation-attachments').remove(paths)
  }

  return NextResponse.json({ ok: true })
}
