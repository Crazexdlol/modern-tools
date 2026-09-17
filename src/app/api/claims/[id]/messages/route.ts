import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { requireClaimAccess } from '@/lib/auth/require-claim-access'

export const runtime = 'nodejs'

const MAX_BODY_LEN = 4000

interface MessageRow {
  id: string
  claim_id: string
  sender_id: string | null
  sender_name: string
  recipient_ids: string[]
  recipient_names: string[]
  body: string
  created_at: string
  is_auto_request?: boolean | null
}

function rowToMessage(r: MessageRow) {
  return {
    id: r.id,
    claimId: r.claim_id,
    senderId: r.sender_id,
    senderName: r.sender_name,
    recipientIds: r.recipient_ids,
    recipientNames: r.recipient_names,
    body: r.body,
    createdAt: r.created_at,
    isAutoRequest: r.is_auto_request === true,
  }
}

async function getSupabaseFromCookies() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
}

// GET /api/claims/[id]/messages — list all messages on the claim, oldest-first.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { errorResponse } = await requireClaimAccess(id)
  if (errorResponse) return errorResponse

  const supabase = await getSupabaseFromCookies()
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('claim_id', id)
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ messages: (data as MessageRow[]).map(rowToMessage) })
}

// POST /api/claims/[id]/messages — send a message.
// Body: { recipientIds: string[], body: string }
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: claimId } = await params
  const { caller, errorResponse } = await requireClaimAccess(claimId)
  if (errorResponse) return errorResponse

  const body = await request.json().catch(() => null) as { recipientIds?: unknown; body?: unknown } | null
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const text = typeof body.body === 'string' ? body.body.trim() : ''
  if (!text) return NextResponse.json({ error: 'Message body is required' }, { status: 400 })
  if (text.length > MAX_BODY_LEN) {
    return NextResponse.json({ error: `Message is too long (max ${MAX_BODY_LEN} characters)` }, { status: 400 })
  }

  const recipientIds = Array.isArray(body.recipientIds)
    ? (body.recipientIds.filter((v): v is string => typeof v === 'string'))
    : []
  // Recipient list is optional. Empty = note-to-thread only; no one is
  // notified but the message still lives on the claim so future readers
  // (including the sender) can see it.

  const supabase = await getSupabaseFromCookies()

  // Look up sender + recipient profiles for the captured display names.
  // Also fetch role for recipient authorization — recipients must either be
  // admins (who can see every claim) or the current assignee. Otherwise
  // the recipient can't actually read the message anyway (RLS hides it),
  // and their display name gets stamped onto the row unnecessarily.
  const allIds = Array.from(new Set([caller!.userId, ...recipientIds]))
  const { data: profs, error: profErr } = await supabase
    .from('profiles')
    .select('id, name, email, role')
    .in('id', allIds)
  if (profErr) return NextResponse.json({ error: profErr.message }, { status: 400 })

  const profMap = new Map<string, { name: string; email: string; role: string }>()
  for (const p of profs ?? []) profMap.set(p.id as string, {
    name: (p.name as string) || '',
    email: (p.email as string) || '',
    role: (p.role as string) || 'appraiser',
  })

  const senderProf = profMap.get(caller!.userId)
  if (!senderProf) return NextResponse.json({ error: 'Sender profile not found' }, { status: 403 })

  // Validate every recipient id is a real profile.
  const missing = recipientIds.filter(rid => !profMap.has(rid))
  if (missing.length > 0) {
    return NextResponse.json({ error: `Unknown recipient(s): ${missing.join(', ')}` }, { status: 400 })
  }

  // Restrict recipients to admins + the current assignee (the only users
  // who can actually SEE the message under acv_select RLS).
  const { data: claimRow } = await supabase
    .from('acv_history')
    .select('assigned_to')
    .eq('id', claimId)
    .maybeSingle()
  const assigneeId = (claimRow?.assigned_to as string | null) ?? null
  const invalidRecipients = recipientIds.filter(rid => {
    const p = profMap.get(rid)!
    return p.role !== 'admin' && rid !== assigneeId
  })
  if (invalidRecipients.length > 0) {
    return NextResponse.json({
      error: 'Recipients must be admins or the claim\'s current assignee.',
    }, { status: 400 })
  }

  const senderName = senderProf.name || senderProf.email || 'Unknown'
  const recipientNames = recipientIds.map(rid => {
    const p = profMap.get(rid)!
    return p.name || p.email || 'Unknown'
  })

  const id = crypto.randomUUID()
  const insertPayload: Record<string, unknown> = {
    id,
    claim_id: claimId,
    sender_id: caller!.userId,
    sender_name: senderName,
    recipient_ids: recipientIds,
    recipient_names: recipientNames,
    body: text,
  }
  // Stamp company_id when we know it (post-migration). Skipped pre-migration
  // to keep the insert compatible with the legacy column set.
  if (caller!.activeCompanyId) {
    insertPayload.company_id = caller!.activeCompanyId
  }
  const { data: inserted, error: insertErr } = await supabase
    .from('messages')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert(insertPayload as any)
    .select('*')
    .maybeSingle()
  if (insertErr || !inserted) {
    return NextResponse.json({ error: insertErr?.message ?? 'Insert failed' }, { status: 400 })
  }

  return NextResponse.json({ message: rowToMessage(inserted as MessageRow) })
}
