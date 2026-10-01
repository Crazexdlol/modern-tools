import { NextResponse } from 'next/server'
import { requireNegotiationsAccess } from '@/lib/auth/require-negotiations'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export interface MutedSenderRow {
  id: string
  email: string | null
  domain: string | null
  muted_at: string
  note: string | null
}

// GET — list all muted entries, newest first.
export async function GET() {
  const { caller, errorResponse } = await requireNegotiationsAccess()
  if (errorResponse) return errorResponse

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('negotiation_muted_senders')
    .select('id, email, domain, muted_at, note')
    .order('muted_at', { ascending: false })
    .limit(500)

  if (error) {
    if (error.code === '42P01') return NextResponse.json({ entries: [], migrationPending: true })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ entries: (data ?? []) as MutedSenderRow[], mutedBy: caller.userId })
}

// POST — mute a sender (email) OR a domain. Body: { email?, domain?, note? }.
// Also marks all currently-visible threads from that sender/domain as spam so
// Henry's backlog clears without a sync pass.
export async function POST(request: Request) {
  const { caller, errorResponse } = await requireNegotiationsAccess()
  if (errorResponse) return errorResponse

  const body = await request.json().catch(() => ({})) as { email?: string; domain?: string; note?: string }
  const email  = body.email?.trim().toLowerCase() || null
  const domain = body.domain?.trim().toLowerCase().replace(/^@/, '') || null
  if ((email && domain) || (!email && !domain)) {
    return NextResponse.json({ error: 'Provide exactly one of email, domain' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Idempotent insert — on conflict (unique index) return the existing row.
  const insertRes = await supabase
    .from('negotiation_muted_senders')
    .insert({ email, domain, note: body.note?.trim() || null, muted_by: caller.userId })
    .select('id, email, domain, muted_at, note')
    .single()

  let row: MutedSenderRow | null = null
  if (insertRes.error) {
    if (insertRes.error.code === '23505') {
      // Duplicate — fetch existing.
      const q = supabase.from('negotiation_muted_senders').select('id, email, domain, muted_at, note').limit(1)
      const existing = email ? await q.eq('email', email).maybeSingle() : await q.eq('domain', domain!).maybeSingle()
      row = (existing.data as MutedSenderRow | null) ?? null
    } else if (insertRes.error.code === '42P01') {
      return NextResponse.json({ error: 'Migration pending' }, { status: 503 })
    } else {
      return NextResponse.json({ error: insertRes.error.message }, { status: 500 })
    }
  } else {
    row = insertRes.data as MutedSenderRow
  }

  // Backfill: mark existing matching threads as spam so they vanish from
  // "needs response" immediately.
  if (email) {
    await supabase
      .from('email_threads')
      .update({ status: 'spam', classification: 'automated', classification_reason: 'muted sender' })
      .eq('status', 'needs_response')
      .in('id', (await supabase
        .from('email_messages')
        .select('thread_id')
        .ilike('from_addr', email)
      ).data?.map(r => r.thread_id) ?? [])
  } else if (domain) {
    await supabase
      .from('email_threads')
      .update({ status: 'spam', classification: 'automated', classification_reason: 'muted domain' })
      .eq('status', 'needs_response')
      .in('id', (await supabase
        .from('email_messages')
        .select('thread_id')
        .ilike('from_addr', `%@${domain}`)
      ).data?.map(r => r.thread_id) ?? [])
  }

  return NextResponse.json({ entry: row })
}
