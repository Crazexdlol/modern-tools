import type { SupabaseClient } from '@supabase/supabase-js'
import { classifyMessage, type Classification } from './classify'
import { findMatchForMessage } from './match'

// Bump when any matcher-affecting code changes. Threads at a lower version
// get re-processed on the next /api/negotiations/process invocation.
export const CURRENT_MATCHER_VERSION = 2

const PROCESS_MAX_PER_CALL = 40  // keeps invocation under ~90s at ~15 queries/thread

export interface ProcessResult {
  processed: number
  classified: Record<Classification, number>
  autoMatched: number
  moreAvailable: boolean
  errors: string[]
}

async function updateThreadWithVersionFallback(
  supabase: SupabaseClient,
  threadId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from('email_threads').update(patch).eq('id', threadId)
  if (error && error.code === '42703' && 'matcher_version' in patch) {
    // Column not there yet — retry without it.
    const { matcher_version: _dropped, ...rest } = patch
    void _dropped
    await supabase.from('email_threads').update(rest).eq('id', threadId)
  }
}

// Iterates threads with status='unmatched' AND classification is null (i.e.
// not yet processed), classifies them, and auto-matches high-confidence
// negotiation threads to a claim. Cap-bounded per call so the caller can
// re-invoke to drain the backlog.
export async function processUnmatchedThreads(supabase: SupabaseClient): Promise<ProcessResult> {
  const result: ProcessResult = {
    processed: 0,
    classified: { negotiation: 0, informational: 0, automated: 0 },
    autoMatched: 0,
    moreAvailable: false,
    errors: [],
  }

  // Prefer the matcher_version gate. Fall back to the pre-migration shape
  // (classification IS NULL) if the column doesn't exist yet.
  let threads: { id: string; last_inbound_at: string | null }[] | null = null
  let threadsErr: { code?: string; message?: string } | null = null
  {
    const res = await supabase
      .from('email_threads')
      .select('id, last_inbound_at')
      .eq('status', 'unmatched')
      .lt('matcher_version', CURRENT_MATCHER_VERSION)
      .order('last_inbound_at', { ascending: false, nullsFirst: false })
      .limit(PROCESS_MAX_PER_CALL + 1)
    if (res.error && res.error.code === '42703') {
      // Column doesn't exist yet — fall back to the legacy guard.
      const legacy = await supabase
        .from('email_threads')
        .select('id, last_inbound_at')
        .eq('status', 'unmatched')
        .is('classification', null)
        .order('last_inbound_at', { ascending: false, nullsFirst: false })
        .limit(PROCESS_MAX_PER_CALL + 1)
      threads = legacy.data ?? null
      threadsErr = legacy.error
    } else {
      threads = res.data ?? null
      threadsErr = res.error
    }
  }

  if (threadsErr) {
    result.errors.push(`load threads: ${threadsErr.message}`)
    return result
  }
  if (!threads || threads.length === 0) return result

  result.moreAvailable = threads.length > PROCESS_MAX_PER_CALL
  const batch = threads.slice(0, PROCESS_MAX_PER_CALL)

  for (const t of batch) {
    try {
      await processOneThread(supabase, t.id, result)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      result.errors.push(`${t.id}: ${msg}`)
    }
  }
  return result
}

async function processOneThread(
  supabase: SupabaseClient,
  threadId: string,
  result: ProcessResult,
) {
  // Load the latest inbound message on this thread — that's the one we
  // classify and match against.
  const { data: latest } = await supabase
    .from('email_messages')
    .select('id, from_addr, subject, text_body, html_body_sanitized, folder')
    .eq('thread_id', threadId)
    .not('folder', 'ilike', '%sent%')
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!latest) {
    // Thread has only outbound messages? Rare — mark informational so we
    // don't reprocess forever.
    await updateThreadWithVersionFallback(supabase, threadId, {
      classification: 'informational',
      classification_confidence: 0.5,
      classification_reason: 'no inbound messages found',
      matcher_version: CURRENT_MATCHER_VERSION,
    })
    result.processed++
    result.classified.informational++
    return
  }

  const cls = await classifyMessage(supabase, {
    fromAddr: latest.from_addr,
    subject: latest.subject,
    textBody: latest.text_body,
    htmlBody: latest.html_body_sanitized,
  })

  result.processed++
  result.classified[cls.classification]++

  // Persist classification on the thread.
  const threadPatch: Record<string, unknown> = {
    classification: cls.classification,
    classification_confidence: cls.confidence,
    classification_reason: cls.reason,
  }

  // Automated → mark spam so it exits the triage view.
  if (cls.classification === 'automated') {
    threadPatch.status = 'spam'
    threadPatch.matcher_version = CURRENT_MATCHER_VERSION
    await updateThreadWithVersionFallback(supabase, threadId, threadPatch)
    return
  }

  // Try to match. Only auto-link when the matcher returns a decisive top pick.
  if (cls.classification === 'negotiation') {
    const match = await findMatchForMessage(supabase, {
      fromAddr: latest.from_addr,
      subject: latest.subject,
      textBody: latest.text_body,
      htmlBody: latest.html_body_sanitized,
    })

    if (match.matchedClaimId && match.matchedBy) {
      const linked = await linkThreadToClaim(supabase, {
        threadId,
        claimId: match.matchedClaimId,
        oaEmail: latest.from_addr,
        matchedBy: match.matchedBy,
        matchedByUser: null,
      })
      if (linked) {
        threadPatch.status = 'needs_response'
        result.autoMatched++
      }
    }
  }

  threadPatch.matcher_version = CURRENT_MATCHER_VERSION
  await updateThreadWithVersionFallback(supabase, threadId, threadPatch)
}

// Shared helper — used by the auto-matcher and by the manual-match endpoint.
export async function linkThreadToClaim(
  supabase: SupabaseClient,
  args: {
    threadId: string
    claimId: string
    oaEmail: string | null
    matchedBy: 'auto:claim_no' | 'auto:vin' | 'auto:oa_email' | 'manual'
    matchedByUser: string | null
  },
): Promise<boolean> {
  // Look up claim's company_id (required on negotiation_cases).
  const { data: claim } = await supabase
    .from('acv_history')
    .select('id, company_id, claim')
    .eq('id', args.claimId)
    .maybeSingle()
  if (!claim) return false

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const claimJson = (claim.claim ?? {}) as any
  const oaName = (claimJson.opposingAppraiserName as string | undefined) ?? null

  // Insert (or fetch existing) negotiation_case for this thread.
  const { data: existing } = await supabase
    .from('negotiation_cases')
    .select('id')
    .eq('thread_id', args.threadId)
    .maybeSingle()
  let caseId = existing?.id as string | undefined

  if (!caseId) {
    const { data: created, error } = await supabase
      .from('negotiation_cases')
      .insert({
        thread_id: args.threadId,
        claim_id: args.claimId,
        company_id: claim.company_id,
        oa_email: args.oaEmail,
        oa_name: oaName,
        matched_by: args.matchedBy,
        matched_by_user: args.matchedByUser,
      })
      .select('id')
      .single()
    if (error) {
      // Unique violation → concurrent link, treat as success.
      if (error.code !== '23505') return false
      const retry = await supabase
        .from('negotiation_cases')
        .select('id')
        .eq('thread_id', args.threadId)
        .maybeSingle()
      caseId = retry.data?.id as string | undefined
    } else {
      caseId = created?.id as string | undefined
    }
  }

  if (!caseId) return false

  // Point the thread at the case.
  await supabase
    .from('email_threads')
    .update({ negotiation_case_id: caseId })
    .eq('id', args.threadId)

  // Remember OA↔claim for future match ranking.
  if (args.oaEmail) {
    await supabase
      .from('oa_claim_history')
      .upsert(
        { oa_email: args.oaEmail, claim_id: args.claimId, last_matched_at: new Date().toISOString() },
        { onConflict: 'oa_email,claim_id' },
      )
  }
  return true
}
