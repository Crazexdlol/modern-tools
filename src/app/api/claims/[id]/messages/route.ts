import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { requireClaimAccess } from '@/lib/auth/require-claim-access'
import { notifyClaimMessage } from '@/lib/email/claim-notifications'

export const runtime = 'nodejs'

const MAX_BODY_LEN = 16000

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
  is_admin_only?: boolean | null
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
    isAdminOnly: r.is_admin_only === true,
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
  const { errorResponse } = await requireClaimAccess(id, { allowOnLockedClaim: true })
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
// Body: { recipientIds: string[], body: string, isAdminOnly?: boolean }
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: claimId } = await params
  // allowOnLockedClaim: posting a non-auto message on a locked claim is the
  // specific action that unlocks it (via DB trigger clear_status_lockout).
  const { caller, errorResponse } = await requireClaimAccess(claimId, { allowOnLockedClaim: true })
  if (errorResponse) return errorResponse

  const body = await request.json().catch(() => null) as {
    recipientIds?: unknown
    body?: unknown
    isAdminOnly?: unknown
  } | null
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const text = typeof body.body === 'string' ? body.body.trim() : ''
  if (!text) return NextResponse.json({ error: 'Message body is required' }, { status: 400 })
  if (text.length > MAX_BODY_LEN) {
    return NextResponse.json({ error: `Message is too long (max ${MAX_BODY_LEN} characters)` }, { status: 400 })
  }

  const isAdminOnly = body.isAdminOnly === true
  if (isAdminOnly && caller!.role !== 'admin') {
    return NextResponse.json({ error: 'Only admins can mark messages as admin-only' }, { status: 403 })
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

  // Fetch claim status + assignee. Closed claims are read-only for messaging
  // (nobody can post on a closed claim, admin or otherwise). Assignee is used
  // for the recipient-eligibility check below.
  const { data: claimRow } = await supabase
    .from('acv_history')
    .select('status, assigned_to')
    .eq('id', claimId)
    .maybeSingle()
  if ((claimRow?.status as string | undefined) === 'closed') {
    return NextResponse.json({
      error: 'Messaging is disabled on closed claims. Reopen the claim to continue the conversation.',
    }, { status: 403 })
  }
  const assigneeId = (claimRow?.assigned_to as string | null) ?? null

  // Appraisers can only message admins — never other appraisers (even if the
  // other appraiser is the current assignee). This narrows the recipient
  // check for appraiser senders; admins keep the broader "admins + assignee"
  // rule since they need to be able to reach the handling appraiser.
  const callerIsAdmin = caller!.role === 'admin'
  const invalidRecipients = recipientIds.filter(rid => {
    const p = profMap.get(rid)!
    if (!callerIsAdmin) return p.role !== 'admin'
    return p.role !== 'admin' && rid !== assigneeId
  })
  if (invalidRecipients.length > 0) {
    return NextResponse.json({
      error: callerIsAdmin
        ? 'Recipients must be admins or the claim\'s current assignee.'
        : 'Appraisers can only message admins.',
    }, { status: 400 })
  }

  // Admin-only messages: strip any non-admin recipients even if they passed
  // the first check as the current assignee. Keeps unread-badges from
  // incrementing for appraisers who then can't open the row they're
  // "unread on."
  const effectiveRecipientIds = isAdminOnly
    ? recipientIds.filter((rid) => (profMap.get(rid)?.role ?? '') === 'admin')
    : recipientIds

  const senderName = senderProf.name || senderProf.email || 'Unknown'
  const recipientNames = effectiveRecipientIds.map(rid => {
    const p = profMap.get(rid)!
    return p.name || p.email || 'Unknown'
  })

  const id = crypto.randomUUID()
  const insertPayload: Record<string, unknown> = {
    id,
    claim_id: claimId,
    sender_id: caller!.userId,
    sender_name: senderName,
    recipient_ids: effectiveRecipientIds,
    recipient_names: recipientNames,
    body: text,
  }
  if (isAdminOnly) insertPayload.is_admin_only = true
  // Stamp company_id when we know it (post-migration). Skipped pre-migration
  // to keep the insert compatible with the legacy column set.
  if (caller!.activeCompanyId) {
    insertPayload.company_id = caller!.activeCompanyId
  }
  let insertRes = await supabase
    .from('messages')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert(insertPayload as any)
    .select('*')
    .maybeSingle()
  // Pre-migration safety: is_admin_only column doesn't exist yet. Retry
  // without the flag so a straggler deploy doesn't 500. If the caller
  // specifically asked for admin-only, we fail loudly instead so no
  // "silently sent as public" happens.
  if (insertRes.error && insertRes.error.code === '42703' && isAdminOnly) {
    return NextResponse.json({
      error: 'Admin-only messages require the message-admin-only migration. Ask Henry to run it.',
    }, { status: 503 })
  }
  if (insertRes.error && insertRes.error.code === '42703') {
    delete insertPayload.is_admin_only
    insertRes = await supabase
      .from('messages')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert(insertPayload as any)
      .select('*')
      .maybeSingle()
  }
  if (insertRes.error || !insertRes.data) {
    return NextResponse.json({ error: insertRes.error?.message ?? 'Insert failed' }, { status: 400 })
  }
  const inserted = insertRes.data

  // Email every explicit recipient (sender excluded even if accidentally
  // listed). Note-to-thread messages (no recipients) send no emails. Each
  // notifyClaimMessage call swallows errors internally so a flaky Resend
  // can't fail the POST.
  const emailTargets = effectiveRecipientIds.filter((rid) => rid !== caller!.userId)
  if (emailTargets.length > 0) {
    await Promise.all(
      emailTargets.map((rid) =>
        notifyClaimMessage({
          claimId,
          recipientId: rid,
          senderName,
          messageBody: text,
        }),
      ),
    )
  }

  return NextResponse.json({ message: rowToMessage(inserted as MessageRow) })
}
