import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'

interface MessageQueueRow {
  id: string
  claim_id: string
  sender_name: string
  created_at: string
}

interface ClaimRow {
  id: string
  ma_number: string | null
  vehicle: string | null
  claim: { insuredName?: string } | null
}

interface ReadRow {
  claim_id: string
  last_read_at: string
}

// GET /api/messages/queue — list of claims with unread messages for the caller.
// Response: { claims: [{ claimId, maNumber, insuredName, vehicle, unreadCount, lastMessageAt, lastMessageFrom }] }
export async function GET() {
  const timings: Record<string, number> = {}
  const t0 = Date.now()
  const mark = (label: string, from: number) => { timings[label] = Date.now() - from }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )

  const tAuth = Date.now()
  const { data: { user } } = await supabase.auth.getUser()
  mark('authGetUser', tAuth)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  // Fetch every message where the caller is a recipient AND is not the
  // sender (self-messages should never show up in your own unread queue,
  // even if you accidentally add yourself to the recipient list). RLS still
  // narrows to claims the caller can see — belt + suspenders.
  const tMsgs = Date.now()
  // Cap the scan. If the user is on more than 500 recent recipient messages,
  // the queue's "unread count" will be approximate — but the dashboard badge
  // is a rough signal anyway, and an unbounded query on this table was the
  // measured cause of dashboard hang on cold Vercel functions.
  const { data: msgs, error: msgErr } = await supabase
    .from('messages')
    .select('id, claim_id, sender_name, created_at')
    .contains('recipient_ids', [user.id])
    .neq('sender_id', user.id)
    .order('created_at', { ascending: false })
    .limit(500)
  mark('messagesQuery', tMsgs)
  if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 400 })
  const messages = (msgs as MessageQueueRow[]) ?? []
  timings['messagesCount'] = messages.length

  if (messages.length === 0) {
    console.log('[queue perf]', { ...timings, totalMs: Date.now() - t0 })
    return NextResponse.json({ claims: [] })
  }

  // Fetch caller's read timestamps for the relevant claims.
  const claimIds = Array.from(new Set(messages.map(m => m.claim_id)))
  const tReads = Date.now()
  const { data: reads, error: readErr } = await supabase
    .from('message_reads')
    .select('claim_id, last_read_at')
    .eq('user_id', user.id)
    .in('claim_id', claimIds)
  mark('readsQuery', tReads)
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 400 })
  const readAt = new Map<string, string>()
  for (const r of (reads as ReadRow[]) ?? []) readAt.set(r.claim_id, r.last_read_at)

  // Bucket unread messages per claim.
  const buckets = new Map<string, { count: number; lastAt: string; lastFrom: string }>()
  for (const m of messages) {
    const cutoff = readAt.get(m.claim_id)
    if (cutoff && m.created_at <= cutoff) continue  // already read
    const b = buckets.get(m.claim_id)
    if (!b) {
      buckets.set(m.claim_id, { count: 1, lastAt: m.created_at, lastFrom: m.sender_name })
    } else {
      b.count++
      if (m.created_at > b.lastAt) { b.lastAt = m.created_at; b.lastFrom = m.sender_name }
    }
  }

  if (buckets.size === 0) return NextResponse.json({ claims: [] })

  // Enrich each claim with display fields.
  const unreadClaimIds = Array.from(buckets.keys())
  const tClaims = Date.now()
  const { data: claims, error: claimErr } = await supabase
    .from('acv_history')
    .select('id, ma_number, vehicle, claim')
    .in('id', unreadClaimIds)
  mark('claimsEnrichQuery', tClaims)
  if (claimErr) return NextResponse.json({ error: claimErr.message }, { status: 400 })

  const claimMap = new Map<string, ClaimRow>()
  for (const c of (claims as ClaimRow[]) ?? []) claimMap.set(c.id, c)

  const payload = unreadClaimIds
    .map(cid => {
      const b = buckets.get(cid)!
      const c = claimMap.get(cid)
      if (!c) return null  // RLS filtered it out (shouldn't happen if messages_select passed, but safe)
      return {
        claimId: cid,
        maNumber: c.ma_number ?? '',
        insuredName: c.claim?.insuredName ?? '',
        vehicle: c.vehicle ?? '',
        unreadCount: b.count,
        lastMessageAt: b.lastAt,
        lastMessageFrom: b.lastFrom,
      }
    })
    .filter((v): v is NonNullable<typeof v> => v !== null)
    .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))

  console.log('[queue perf]', { ...timings, totalMs: Date.now() - t0 })
  return NextResponse.json({ claims: payload })
}
