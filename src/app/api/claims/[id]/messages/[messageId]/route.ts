import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { requireClaimAccess } from '@/lib/auth/require-claim-access'
import { notifyClaimMessage } from '@/lib/email/claim-notifications'

export const runtime = 'nodejs'

const MAX_BODY_LEN = 16000

async function getSupabaseFromCookies() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
}

// Shared permission check: the row's sender_id OR an admin can mutate.
// Returns the row + a flag for whether the caller can mutate; otherwise an
// error response ready to return.
async function loadAndAuthorize(claimId: string, messageId: string) {
  const { caller, errorResponse } = await requireClaimAccess(claimId, { allowOnLockedClaim: true })
  if (errorResponse) return { errorResponse }
  const supabase = await getSupabaseFromCookies()
  const { data: row, error } = await supabase
    .from('messages')
    .select('id, claim_id, sender_id, recipient_ids, body')
    .eq('id', messageId)
    .eq('claim_id', claimId)
    .maybeSingle()
  if (error) return { errorResponse: NextResponse.json({ error: error.message }, { status: 400 }) }
  if (!row) return { errorResponse: NextResponse.json({ error: 'Message not found' }, { status: 404 }) }
  const isSender = row.sender_id === caller!.userId
  const isAdmin = caller!.role === 'admin'
  if (!isSender && !isAdmin) {
    return { errorResponse: NextResponse.json({ error: 'Only the sender or an admin can modify this message.' }, { status: 403 }) }
  }
  return { caller, supabase, row }
}

// DELETE /api/claims/[id]/messages/[messageId]
// Hard-deletes the row. No email notification sent (per spec: silent delete).
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; messageId: string }> }) {
  const { id: claimId, messageId } = await params
  const { errorResponse, supabase } = await loadAndAuthorize(claimId, messageId)
  if (errorResponse) return errorResponse

  const { error } = await supabase!.from('messages').delete().eq('id', messageId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

// PATCH /api/claims/[id]/messages/[messageId]
// Body: { body: string }
// Replaces the message text and re-emails every recipient (minus the sender
// themselves). Silent on no-op or empty body.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; messageId: string }> }) {
  const { id: claimId, messageId } = await params
  const { errorResponse, caller, supabase, row } = await loadAndAuthorize(claimId, messageId)
  if (errorResponse) return errorResponse

  const body = (await request.json().catch(() => null)) as { body?: unknown } | null
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  const text = typeof body.body === 'string' ? body.body.trim() : ''
  if (!text) return NextResponse.json({ error: 'Message body is required' }, { status: 400 })
  if (text.length > MAX_BODY_LEN) {
    return NextResponse.json({ error: `Message is too long (max ${MAX_BODY_LEN} characters)` }, { status: 400 })
  }
  if (text === (row!.body as string)) {
    return NextResponse.json({ ok: true, unchanged: true })
  }

  const { data: updated, error } = await supabase!
    .from('messages')
    .update({ body: text })
    .eq('id', messageId)
    .select('id, sender_name, recipient_ids')
    .maybeSingle()
  if (error || !updated) return NextResponse.json({ error: error?.message ?? 'Update failed' }, { status: 400 })

  // Re-email every recipient (sender excluded). notifyClaimMessage swallows
  // failures internally so flaky Resend can't fail the PATCH.
  const recipientIds = (updated.recipient_ids as string[]) ?? []
  const emailTargets = recipientIds.filter((rid) => rid !== caller!.userId)
  if (emailTargets.length > 0) {
    await Promise.all(
      emailTargets.map((rid) =>
        notifyClaimMessage({
          claimId,
          recipientId: rid,
          senderName: (updated.sender_name as string) || 'Unknown',
          messageBody: text,
        }),
      ),
    )
  }

  return NextResponse.json({ ok: true, body: text })
}
