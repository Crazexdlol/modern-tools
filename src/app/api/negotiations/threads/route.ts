import { NextResponse } from 'next/server'
import { requireNegotiationsAccess } from '@/lib/auth/require-negotiations'
import { createServiceClient } from '@/lib/supabase/service'
import type { PostgrestError } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export type ThreadFilter = 'needs_response' | 'responded' | 'unmatched' | 'spam' | 'closed_claim' | 'all'

export interface ThreadListItem {
  id: string
  status: string
  classification: string | null
  subject: string
  lastFromAddr: string
  lastFromName: string | null
  lastSentAt: string
  snippet: string
  hasAttachments: boolean
  negotiationCaseId: string | null
  claimId: string | null
  claimVehicle: string | null
  claimNumber: string | null
  companyId: string | null
  hasDraft: boolean
}

export interface ThreadListResponse {
  threads: ThreadListItem[]
  counters?: {
    needs_response: number
    responded_today: number
    unmatched: number
    awaiting_oa_reply: number
    spam: number
    closed_claim: number
  }
  meta?: {
    perfMigrationApplied: boolean
    tookMs: number
    countersFetched: boolean
  }
}

const PAGE_SIZE = 200

// Try the fast denormalized SELECT first; if the perf migration hasn't been
// run yet, fall back to the pre-denorm shape so the tab keeps working.
const DENORM_COLS = 'id, status, classification, negotiation_case_id, has_draft, latest_from_addr, latest_from_name, latest_subject, latest_snippet, latest_sent_at, latest_has_attachments, last_inbound_at, last_outbound_at'
const LEGACY_COLS = 'id, status, classification, negotiation_case_id, last_inbound_at, last_outbound_at'

export async function GET(request: Request) {
  const t0 = Date.now()
  const { errorResponse } = await requireNegotiationsAccess()
  if (errorResponse) return errorResponse

  const url = new URL(request.url)
  const filter = (url.searchParams.get('filter') as ThreadFilter) || 'needs_response'
  const search = url.searchParams.get('q')?.trim() || ''
  // Client sets counters=1 only when a fresh count is actually needed
  // (page mount + after sync). Filter clicks reuse the cached values.
  const includeCounters = url.searchParams.get('counters') === '1'

  const supabase = createServiceClient()

  // 1) Threads SELECT (required) runs IN PARALLEL with the counters RPC
  //    (when requested). They touch independent query plans and we don't need
  //    the thread rows to compute counters.
  let perfMigrationApplied = true

  const threadsP: Promise<{ threads: ThreadRow[] | null; err: PostgrestError | null }> = (async () => {
    let q = supabase.from('email_threads').select(DENORM_COLS)
    if (filter !== 'all') q = q.eq('status', filter)
    if (search) {
      q = q.or([
        `latest_subject.ilike.%${search}%`,
        `latest_from_addr.ilike.%${search}%`,
        `latest_from_name.ilike.%${search}%`,
        `latest_snippet.ilike.%${search}%`,
      ].join(','))
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await q.order('latest_sent_at' as any, { ascending: false, nullsFirst: false }).limit(PAGE_SIZE)
    if (res.error && res.error.code === '42703') {
      perfMigrationApplied = false
      let q2 = supabase.from('email_threads').select(LEGACY_COLS)
      if (filter !== 'all') q2 = q2.eq('status', filter)
      const res2 = await q2.order('last_inbound_at', { ascending: false, nullsFirst: false }).limit(PAGE_SIZE)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { threads: (res2.data as any) ?? null, err: res2.error }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { threads: (res.data as any) ?? null, err: res.error }
  })()

  const countersP: Promise<NonNullable<ThreadListResponse['counters']> | undefined> = includeCounters
    ? (async () => {
        const { data: rpcData, error: rpcErr } = await supabase.rpc('negotiations_counters')
        if (!rpcErr && Array.isArray(rpcData) && rpcData.length > 0) {
          const r = rpcData[0] as { needs_response: number; unmatched: number; spam: number; responded_today: number; closed_claim?: number }
          return {
            needs_response: Number(r.needs_response ?? 0),
            unmatched: Number(r.unmatched ?? 0),
            spam: Number(r.spam ?? 0),
            responded_today: Number(r.responded_today ?? 0),
            closed_claim: Number(r.closed_claim ?? 0),
            awaiting_oa_reply: 0,
          }
        }
        const [needs, unmatched, spam, responded, closedClaim] = await Promise.all([
          countByStatus(supabase, 'needs_response'),
          countByStatus(supabase, 'unmatched'),
          countByStatus(supabase, 'spam'),
          countByStatusWithSinceOutbound(supabase, 'responded'),
          countByStatus(supabase, 'closed_claim'),
        ])
        return {
          needs_response: needs,
          unmatched,
          spam,
          responded_today: responded,
          closed_claim: closedClaim,
          awaiting_oa_reply: 0,
        }
      })()
    : Promise.resolve(undefined)

  const [{ threads, err: threadsErr }, countersInitial] = await Promise.all([threadsP, countersP])
  if (threadsErr) {
    return NextResponse.json({ error: threadsErr.message }, { status: 500 })
  }
  const rows = threads ?? []

  // 2) Finalize counters by filling in the page-derived "awaiting OA reply".
  let counters: NonNullable<ThreadListResponse['counters']> | undefined = countersInitial
  if (counters) {
    // "awaiting OA reply" is an approximation from the current page — full
    // count would need column-to-column comparison, deferred until we care.
    counters.awaiting_oa_reply = rows.reduce((acc, t) => {
      const outbound = t.last_outbound_at as string | null
      const inbound = t.last_inbound_at as string | null
      if (outbound && (!inbound || outbound > inbound)) return acc + 1
      return acc
    }, 0)
  }

  // 3) Case + claim data only for matched threads on this page.
  const caseIds = rows.map(t => t.negotiation_case_id).filter((x): x is string => !!x)
  const caseByThread = new Map<string, { claim_id: string; company_id: string }>()
  if (caseIds.length > 0) {
    const { data: cases } = await supabase
      .from('negotiation_cases')
      .select('id, thread_id, claim_id, company_id')
      .in('id', caseIds)
    for (const c of (cases ?? [])) {
      caseByThread.set(c.thread_id, { claim_id: c.claim_id, company_id: c.company_id })
    }
  }

  const claimIds = Array.from(caseByThread.values()).map(c => c.claim_id)
  const claimById = new Map<string, { vehicle: string | null; ma_number: string | null }>()
  if (claimIds.length > 0) {
    const { data: claims } = await supabase
      .from('acv_history')
      .select('id, vehicle, ma_number')
      .in('id', claimIds)
    for (const c of (claims ?? [])) {
      claimById.set(c.id, { vehicle: c.vehicle, ma_number: c.ma_number })
    }
  }

  // 4) When the perf migration is missing, pull the latest message per
  // thread for THIS PAGE only — small (≤200) so it's tolerable. Once the
  // migration runs, the denorm fields cover everything.
  const latestByThread = new Map<string, {
    from_addr: string; from_name: string | null; subject: string;
    sent_at: string; text_body: string | null; has_attachments: boolean;
  }>()
  if (!perfMigrationApplied && rows.length > 0) {
    const ids = rows.map(t => t.id)
    const { data: msgs } = await supabase
      .from('email_messages')
      .select('thread_id, subject, from_addr, from_name, sent_at, text_body, has_attachments')
      .in('thread_id', ids)
      .order('sent_at', { ascending: false })
    for (const m of (msgs ?? [])) {
      if (!latestByThread.has(m.thread_id)) {
        latestByThread.set(m.thread_id, {
          from_addr: m.from_addr,
          from_name: m.from_name,
          subject: m.subject,
          sent_at: m.sent_at,
          text_body: m.text_body,
          has_attachments: !!m.has_attachments,
        })
      }
    }
  }

  const items: ThreadListItem[] = rows.map(t => {
    const caseRow = caseByThread.get(t.id)
    const claim = caseRow ? claimById.get(caseRow.claim_id) : null
    const latest = latestByThread.get(t.id)
    return {
      id: t.id,
      status: t.status,
      classification: t.classification,
      subject: (t.latest_subject as string | undefined) ?? latest?.subject ?? '(no subject)',
      lastFromAddr: (t.latest_from_addr as string | undefined) ?? latest?.from_addr ?? '',
      lastFromName: (t.latest_from_name as string | undefined) ?? latest?.from_name ?? null,
      lastSentAt: (t.latest_sent_at as string | undefined) ?? latest?.sent_at ?? (t.last_inbound_at as string) ?? (t.last_outbound_at as string) ?? new Date(0).toISOString(),
      snippet: (t.latest_snippet as string | undefined) ?? ((latest?.text_body ?? '').slice(0, 240).replace(/\s+/g, ' ').trim()),
      hasAttachments: (t.latest_has_attachments as boolean | undefined) ?? !!latest?.has_attachments,
      negotiationCaseId: t.negotiation_case_id,
      claimId: caseRow?.claim_id ?? null,
      claimVehicle: claim?.vehicle ?? null,
      claimNumber: claim?.ma_number ?? null,
      companyId: caseRow?.company_id ?? null,
      hasDraft: !!(t.has_draft as boolean | undefined),
    }
  })

  return NextResponse.json({
    threads: items,
    counters,
    meta: {
      perfMigrationApplied,
      tookMs: Date.now() - t0,
      countersFetched: includeCounters,
    },
  } satisfies ThreadListResponse)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ThreadRow = any

async function countByStatus(
  supabase: ReturnType<typeof createServiceClient>,
  status: string,
): Promise<number> {
  // 'exact' — accurate every time regardless of ANALYZE lag. The index on
  // email_threads.status makes this a sub-100ms count over <300 rows total,
  // so correctness beats the microsecond win from the 'planned' estimator.
  const { count, error } = await supabase
    .from('email_threads')
    .select('id', { count: 'exact', head: true })
    .eq('status', status)
  if (error) return 0
  return count ?? 0
}

async function countByStatusWithSinceOutbound(
  supabase: ReturnType<typeof createServiceClient>,
  status: string,
): Promise<number> {
  // "Responded today" — combines status + a timestamp filter that isn't
  // covered by an index. Still cheap because 'responded' is a small subset.
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const { count, error } = await supabase
    .from('email_threads')
    .select('id', { count: 'exact', head: true })
    .eq('status', status)
    .gte('last_outbound_at', startOfToday.toISOString())
  if (error) return 0
  return count ?? 0
}
