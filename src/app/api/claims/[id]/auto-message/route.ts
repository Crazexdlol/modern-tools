import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireClaimAccess } from '@/lib/auth/require-claim-access'

export const runtime = 'nodejs'

const MAX_BODY_LEN = 8000

// POST /api/claims/[id]/auto-message
// Body: { body: string, senderName: string }
// Inserts an informational auto-message on the claim's thread:
// sender_id=null, recipient_ids=[] (no unread badge for anyone),
// is_auto_request=true (renders with the amber "Auto" badge).
// Requires SUPABASE_SERVICE_ROLE_KEY at runtime.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: claimId } = await params
  // Auto-messages (parser-sourced "Claim parsed from PDF" etc.) land on
  // locked claims too — they're system notes, not appraiser actions.
  const { caller, errorResponse } = await requireClaimAccess(claimId, { allowOnLockedClaim: true })
  if (errorResponse) return errorResponse

  const body = await request.json().catch(() => null) as {
    body?: unknown
  } | null
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const text = typeof body.body === 'string' ? body.body.trim() : ''
  if (!text) return NextResponse.json({ error: 'Message body is required' }, { status: 400 })
  if (text.length > MAX_BODY_LEN) {
    return NextResponse.json({ error: `Message is too long (max ${MAX_BODY_LEN} characters)` }, { status: 400 })
  }
  // Sender name is a fixed literal — the route writes with service role and
  // sender_id=null, so accepting a caller-supplied name would let any
  // authenticated user with claim access post spoofed messages ("Admin -
  // Henry", "System", etc.). Ignore whatever the client sends.
  const senderName = 'HamsPortal'

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!serviceKey || !url) {
    console.error('auto-message: SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL missing')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }
  const service = createClient(url, serviceKey, { auth: { persistSession: false } })

  const id = crypto.randomUUID()
  const insertPayload: Record<string, unknown> = {
    id,
    claim_id: claimId,
    sender_id: null,
    sender_name: senderName,
    recipient_ids: [],
    recipient_names: [],
    body: text,
    is_auto_request: true,
  }
  if (caller!.activeCompanyId) {
    insertPayload.company_id = caller!.activeCompanyId
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await service.from('messages').insert(insertPayload as any)
  if (error) {
    console.error('auto-message insert failed:', error)
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true, id })
}
