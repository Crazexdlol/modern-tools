import type { SupabaseClient } from '@supabase/supabase-js'
import { withImapClient, ImapConfigMissingError } from './client'
import { parseMessageSource, normalizeSubject, type ParsedMessage } from './parse'
import { isOwnerAddr } from './sync'

// Batch backfill of the Sent folder well beyond the 90-day initial sync
// window, so the voice-profile trainer has a bigger corpus to work from.
// Only touches the Sent folder — inbound mail keeps flowing through the
// normal incremental sync. Idempotent: skips messages already stored.

const DEFAULT_MAX_MSGS = 1000

export interface BackfillResult {
  syncedAt: string
  daysBack: number
  newMessages: number
  scannedMessages: number
  configMissing?: string[]
  errors: string[]
}

export async function runSentBackfill(args: {
  supabase: SupabaseClient
  daysBack: number
  maxMessages?: number
  ownerEmail: string
}): Promise<BackfillResult> {
  const { supabase, daysBack, ownerEmail } = args
  const maxMessages = args.maxMessages ?? DEFAULT_MAX_MSGS
  const result: BackfillResult = {
    syncedAt: new Date().toISOString(),
    daysBack,
    newMessages: 0,
    scannedMessages: 0,
    errors: [],
  }

  try {
    await withImapClient(async (client, mailboxes) => {
      if (!mailboxes.sent) {
        result.errors.push('No Sent folder detected on the server.')
        return
      }
      const mailbox = await client.mailboxOpen(mailboxes.sent, { readOnly: true })
      const uidValidity = Number(mailbox.uidValidity)
      const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000)

      const uidsRaw = (await client.search({ since }, { uid: true })) || []
      const uids = uidsRaw.map(u => Number(u)).sort((a, b) => b - a).slice(0, maxMessages).sort((a, b) => a - b)
      result.scannedMessages = uids.length
      if (uids.length === 0) return

      // Skip UIDs already stored.
      const { data: existing } = await supabase
        .from('email_messages')
        .select('uid')
        .eq('folder', mailboxes.sent)
        .eq('uid_validity', uidValidity)
        .in('uid', uids)
      const existingSet = new Set((existing || []).map(r => Number(r.uid)))
      const toFetch = uids.filter(u => !existingSet.has(u))
      if (toFetch.length === 0) return

      const range = toFetch.map(String).join(',')
      for await (const msg of client.fetch(range, { source: true, uid: true, internalDate: true, size: true }, { uid: true })) {
        const uid = Number(msg.uid)
        const source = msg.source
        if (!source) continue
        const size = Number(msg.size ?? source.length)

        try {
          const parsed = await parseMessageSource(source, size)
          const threadId = await resolveOrCreateThreadForSent(supabase, parsed)
          const inserted = await insertBackfillMessage(supabase, {
            threadId,
            uidValidity,
            uid,
            folder: mailboxes.sent,
            parsed,
            ownerEmail,
          })
          if (inserted) result.newMessages++
        } catch (e: unknown) {
          const m = e instanceof Error ? e.message : String(e)
          result.errors.push(`uid ${uid}: ${m}`)
        }
      }
    })
  } catch (e: unknown) {
    if (e instanceof ImapConfigMissingError) {
      result.configMissing = e.missing
      result.errors.push('IMAP not configured')
    } else {
      const m = e instanceof Error ? e.message : String(e)
      result.errors.push(`Connection failed: ${m}`)
    }
  }

  return result
}

async function resolveOrCreateThreadForSent(supabase: SupabaseClient, msg: ParsedMessage): Promise<string> {
  const refCandidates = [msg.inReplyTo, ...msg.references].filter(Boolean) as string[]
  if (refCandidates.length > 0) {
    const { data: refMatch } = await supabase
      .from('email_messages')
      .select('thread_id')
      .in('message_id', refCandidates)
      .limit(1)
      .maybeSingle()
    if (refMatch?.thread_id) return refMatch.thread_id as string
  }

  const normSubject = normalizeSubject(msg.subject)
  if (normSubject) {
    const { data: subjMatch } = await supabase
      .from('email_threads')
      .select('id')
      .eq('subject_normalized', normSubject)
      .limit(1)
    if (subjMatch && subjMatch.length > 0) return subjMatch[0].id as string
  }

  const { data: created, error } = await supabase
    .from('email_threads')
    .insert({
      subject_normalized: normSubject,
      references_root: msg.references[0] ?? msg.inReplyTo ?? msg.messageId,
      // Backfilled sent-only threads with no known inbound stay 'unmatched'
      // — they were never triaged and won't be for voice-training purposes.
      status: 'unmatched',
    })
    .select('id')
    .single()
  if (error || !created) throw new Error(`Thread insert failed: ${error?.message ?? 'unknown'}`)
  return created.id as string
}

async function insertBackfillMessage(
  supabase: SupabaseClient,
  args: {
    threadId: string
    uidValidity: number
    uid: number
    folder: string
    parsed: ParsedMessage
    ownerEmail: string
  },
): Promise<boolean> {
  const { threadId, uidValidity, uid, folder, parsed, ownerEmail } = args
  const { error, data } = await supabase
    .from('email_messages')
    .insert({
      thread_id: threadId,
      uid_validity: uidValidity,
      uid,
      folder,
      message_id: parsed.messageId,
      in_reply_to: parsed.inReplyTo,
      references_ids: parsed.references,
      from_addr: parsed.from.addr,
      from_name: parsed.from.name,
      to_addrs: parsed.to,
      cc_addrs: parsed.cc,
      subject: parsed.subject,
      sent_at: parsed.sentAt.toISOString(),
      text_body: parsed.textBody,
      html_body_sanitized: parsed.htmlBodySanitized,
      has_attachments: parsed.attachments.length > 0,
      raw_size_bytes: parsed.rawSizeBytes,
    })
    .select('id')
    .maybeSingle()

  if (error) {
    if (error.code === '23505') return false
    throw new Error(`Message insert failed: ${error.message}`)
  }
  if (!data) return false

  // Keep the thread's denorm fields honest so the inbox list shows an
  // accurate latest_* even if the backfilled message is the newest we've seen.
  const iso = parsed.sentAt.toISOString()
  const { data: thread } = await supabase
    .from('email_threads')
    .select('latest_sent_at, last_outbound_at')
    .eq('id', threadId)
    .maybeSingle()
  const currentLatest = (thread?.latest_sent_at as string | null) ?? null
  const patch: Record<string, unknown> = {}
  if (!currentLatest || iso > currentLatest) {
    patch.latest_from_addr = parsed.from.addr
    patch.latest_from_name = parsed.from.name
    patch.latest_subject = parsed.subject
    patch.latest_snippet = (parsed.textBody ?? '').replace(/\s+/g, ' ').trim().slice(0, 240)
    patch.latest_sent_at = iso
    patch.latest_has_attachments = parsed.attachments.length > 0
  }
  const isFromOwner = isOwnerAddr(parsed.from.addr, ownerEmail)
  if (isFromOwner && (!thread?.last_outbound_at || iso > (thread.last_outbound_at as string))) {
    patch.last_outbound_at = iso
  }
  if (Object.keys(patch).length > 0) {
    await supabase.from('email_threads').update(patch).eq('id', threadId)
  }
  return true
}
