import { NextResponse } from 'next/server'
import { requireNegotiationsAccess } from '@/lib/auth/require-negotiations'
import { createServiceClient } from '@/lib/supabase/service'
import { linkThreadToClaim } from '@/lib/negotiations/process'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { caller, errorResponse } = await requireNegotiationsAccess()
  if (errorResponse) return errorResponse

  const { id: threadId } = await ctx.params
  const body = (await request.json().catch(() => ({}))) as { claimId?: string }
  const claimId = body.claimId?.trim()
  if (!claimId) return NextResponse.json({ error: 'claimId required' }, { status: 400 })

  const supabase = createServiceClient()

  // Look up the latest inbound sender to store as oa_email.
  const { data: latestInbound } = await supabase
    .from('email_messages')
    .select('from_addr')
    .eq('thread_id', threadId)
    .not('folder', 'ilike', '%sent%')
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const linked = await linkThreadToClaim(supabase, {
    threadId,
    claimId,
    oaEmail: latestInbound?.from_addr ?? null,
    matchedBy: 'manual',
    matchedByUser: caller!.userId,
  })

  if (!linked) {
    return NextResponse.json({ error: 'Could not link — check claim id / permissions' }, { status: 400 })
  }

  // Promote to needs_response now that a claim is attached.
  await supabase
    .from('email_threads')
    .update({ status: 'needs_response' })
    .eq('id', threadId)

  return NextResponse.json({ ok: true })
}
