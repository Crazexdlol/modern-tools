import { ImapFlow } from 'imapflow'
import type { SupabaseClient } from '@supabase/supabase-js'
import { withImapClient, ImapConfigMissingError } from './client'
import { parseMessageSource, normalizeSubject, type ParsedMessage } from './parse'

// A sender counts as "us" when it's literally the owner's address, any
// address at the owner's domain (team members), or a configured alias
// (e.g. the owner's personal Gmail that forwards into the business inbox).
// Internal forwards and intra-team mail should flip threads to 'responded',
// never trigger 'needs_response'.
export function isOwnerAddr(addr: string, ownerEmail: string): boolean {
  if (!addr) return false
  const lower = addr.toLowerCase()
  const owner = ownerEmail.toLowerCase()
  if (lower === owner) return true
  const ownerDomain = owner.split('@')[1] || ''
  if (ownerDomain && lower.endsWith(`@${ownerDomain}`)) return true
  const extras = (process.env.IMAP_OWNER_ALIASES || '')
    .toLowerCase()
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
  return extras.includes(lower)
}

const FIRST_SYNC_DAYS = 90
// Small enough to always fit inside Vercel's 300s wall on a fresh mailbox.
// Client hits Sync repeatedly to backfill older mail (each call resumes
// where the last left off via imap_sync_state).
const FIRST_SYNC_MAX_MSGS = 80
const PER_SYNC_MAX_MSGS = 120

export interface SyncResult {
  syncedAt: string
  newThreads: number
  newMessages: number
  folders: { folder: string; newMessages: number; skippedExisting: number }[]
  errors: string[]
  configMissing?: string[]
}

export interface RunSyncOptions {
  supabase: SupabaseClient  // service-role client (RLS bypassed after Henry check upstream)
  ownerEmail: string        // henry's own email — messages from this addr in Sent = "responded"
}

export async function runSync({ supabase, ownerEmail }: RunSyncOptions): Promise<SyncResult> {
  const result: SyncResult = {
    syncedAt: new Date().toISOString(),
    newThreads: 0,
    newMessages: 0,
    folders: [],
    errors: [],
  }

  try {
    await withImapClient(async (client, mailboxes) => {
      const foldersToSync = [mailboxes.inbox, mailboxes.sent].filter(Boolean)
      for (const folder of foldersToSync) {
        try {
          const stats = await syncFolder({ client, supabase, folder, ownerEmail })
          result.folders.push({ folder, newMessages: stats.newMessages, skippedExisting: stats.skippedExisting })
          result.newMessages += stats.newMessages
          result.newThreads += stats.newThreads
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e)
          result.errors.push(`${folder}: ${msg}`)
        }
      }
    })
  } catch (e: unknown) {
    if (e instanceof ImapConfigMissingError) {
      result.configMissing = e.missing
      result.errors.push('IMAP not configured')
    } else {
      const msg = e instanceof Error ? e.message : String(e)
      result.errors.push(`Connection failed: ${msg}`)
    }
  }

  return result
}

interface FolderStats { newMessages: number; skippedExisting: number; newThreads: number }

async function syncFolder(args: {
  client: ImapFlow
  supabase: SupabaseClient
  folder: string
  ownerEmail: string
}): Promise<FolderStats> {
  const { client, supabase, folder, ownerEmail } = args
  const stats: FolderStats = { newMessages: 0, skippedExisting: 0, newThreads: 0 }

  const mailbox = await client.mailboxOpen(folder, { readOnly: true })
  const uidValidity = Number(mailbox.uidValidity)

  const { data: stateRow } = await supabase
    .from('imap_sync_state')
    .select('folder, uid_validity, last_uid')
    .eq('folder', folder)
    .maybeSingle()

  const priorValidity = stateRow ? Number(stateRow.uid_validity) : null
  const priorLastUid = stateRow && priorValidity === uidValidity ? Number(stateRow.last_uid) : 0

  // Determine which UIDs to fetch.
  let uidsToFetch: number[] = []
  if (priorLastUid === 0) {
    // First sync (or UIDVALIDITY changed): bounded window.
    const since = new Date(Date.now() - FIRST_SYNC_DAYS * 24 * 60 * 60 * 1000)
    const found = await client.search({ since }, { uid: true })
    const nums = (found || []).map(u => Number(u)).sort((a, b) => b - a)  // newest first
    uidsToFetch = nums.slice(0, FIRST_SYNC_MAX_MSGS).sort((a, b) => a - b)
  } else {
    const found = await client.search({ uid: `${priorLastUid + 1}:*` }, { uid: true })
    const nums = (found || []).map(u => Number(u)).filter(u => u > priorLastUid).sort((a, b) => a - b)
    uidsToFetch = nums.slice(0, PER_SYNC_MAX_MSGS)
  }

  if (uidsToFetch.length === 0) {
    await upsertSyncState(supabase, folder, uidValidity, priorLastUid)
    return stats
  }

  // Skip UIDs we've already stored (idempotency across UIDVALIDITY replays).
  const { data: existing } = await supabase
    .from('email_messages')
    .select('uid')
    .eq('folder', folder)
    .eq('uid_validity', uidValidity)
    .in('uid', uidsToFetch)
  const existingSet = new Set((existing || []).map(r => Number(r.uid)))
  const toFetch = uidsToFetch.filter(u => !existingSet.has(u))
  stats.skippedExisting = uidsToFetch.length - toFetch.length

  if (toFetch.length === 0) {
    const maxUid = Math.max(priorLastUid, ...uidsToFetch)
    await upsertSyncState(supabase, folder, uidValidity, maxUid)
    return stats
  }

  let maxSeenUid = priorLastUid
  const range = toFetch.map(String).join(',')

  for await (const msg of client.fetch(range, { source: true, uid: true, internalDate: true, size: true }, { uid: true })) {
    const uid = Number(msg.uid)
    // Persist maxSeenUid opportunistically so a mid-batch timeout still moves
    // the cursor forward — next Sync starts from where this one died.
    if (uid > maxSeenUid) {
      maxSeenUid = uid
      // Fire-and-forget checkpoint every 20 messages to keep progress durable.
      if (stats.newMessages > 0 && stats.newMessages % 20 === 0) {
        void upsertSyncState(supabase, folder, uidValidity, maxSeenUid)
      }
    }
    const source = msg.source
    if (!source) continue
    const size = Number(msg.size ?? source.length)

    // Any failure on a single message must NOT kill the whole sync.
    try {
      const parsed = await parseMessageSource(source, size)
      const threadId = await resolveOrCreateThread(supabase, parsed)
      const inserted = await insertMessage(supabase, {
        thread_id: threadId,
        uid_validity: uidValidity,
        uid,
        folder,
        parsed,
      })
      if (inserted) {
        stats.newMessages++
        await updateThreadFromMessage(supabase, threadId, parsed, folder, ownerEmail)
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`[sync] failed on ${folder}#${uid}:`, msg)
      continue
    }
  }

  await upsertSyncState(supabase, folder, uidValidity, maxSeenUid)
  return stats
}

async function resolveOrCreateThread(supabase: SupabaseClient, msg: ParsedMessage): Promise<string> {
  // Try References/In-Reply-To → find an existing message with a matching
  // Message-ID and return its thread_id.
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

  // Fall back to normalized subject match. Only match threads that share a
  // participant to avoid collapsing unrelated "meeting notes" threads.
  const normSubject = normalizeSubject(msg.subject)
  if (normSubject) {
    const { data: subjectMatches } = await supabase
      .from('email_threads')
      .select('id')
      .eq('subject_normalized', normSubject)
      .order('last_inbound_at', { ascending: false, nullsFirst: false })
      .limit(1)
    if (subjectMatches && subjectMatches.length > 0) {
      return subjectMatches[0].id as string
    }
  }

  // Create new thread. Status defaults to 'unmatched' for Phase 1 — Phase 2
  // matcher will promote to 'needs_response' when a claim link is made.
  const { data: created, error } = await supabase
    .from('email_threads')
    .insert({
      subject_normalized: normSubject,
      references_root: (msg.references[0] ?? msg.inReplyTo ?? msg.messageId),
      status: 'unmatched',
    })
    .select('id')
    .single()
  if (error || !created) throw new Error(`Thread insert failed: ${error?.message ?? 'unknown'}`)
  return created.id as string
}

async function insertMessage(
  supabase: SupabaseClient,
  args: { thread_id: string; uid_validity: number; uid: number; folder: string; parsed: ParsedMessage },
): Promise<boolean> {
  const { thread_id, uid_validity, uid, folder, parsed } = args
  const { error, data } = await supabase
    .from('email_messages')
    .insert({
      thread_id,
      uid_validity,
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
    // 23505 = unique_violation; race between concurrent syncs. Not an error.
    if (error.code === '23505') return false
    throw new Error(`Message insert failed: ${error.message}`)
  }
  if (!data) return false

  // Insert attachment metadata (content is downloaded lazily by a separate route).
  if (parsed.attachments.length > 0) {
    const rows = parsed.attachments.map(a => ({
      message_id: data.id,
      filename: a.filename,
      mime_type: a.mimeType,
      size_bytes: a.sizeBytes,
    }))
    await supabase.from('email_attachments').insert(rows)
  }
  return true
}

async function updateThreadFromMessage(
  supabase: SupabaseClient,
  threadId: string,
  msg: ParsedMessage,
  folder: string,
  ownerEmail: string,
) {
  const isOutbound = folder.toLowerCase().includes('sent') || isOwnerAddr(msg.from.addr, ownerEmail)
  const iso = msg.sentAt.toISOString()

  const { data: thread } = await supabase
    .from('email_threads')
    .select('last_inbound_at, last_outbound_at, status, latest_sent_at')
    .eq('id', threadId)
    .maybeSingle()

  const patch: Record<string, unknown> = {}
  // Terminal statuses — once set, inbound/outbound traffic doesn't flip them.
  // 'closed_claim' means the claim is closed; replies aren't actionable.
  const PRESERVED = new Set(['ignored', 'spam', 'closed_claim'])
  if (isOutbound) {
    if (!thread?.last_outbound_at || iso > (thread.last_outbound_at as string)) {
      patch.last_outbound_at = iso
    }
    // If the newest message overall is now outbound (a reply), the thread
    // moves to 'responded'. Preserve PRESERVED statuses.
    if (thread && !PRESERVED.has(thread.status as string)) {
      const lastInbound = thread.last_inbound_at as string | null
      if (!lastInbound || iso > lastInbound) patch.status = 'responded'
    }
  } else {
    if (!thread?.last_inbound_at || iso > (thread.last_inbound_at as string)) {
      patch.last_inbound_at = iso
    }
    // New inbound after a prior outbound → moves back to 'needs_response'
    // (or stays 'unmatched' if never matched). Preserve PRESERVED statuses.
    if (thread && !PRESERVED.has(thread.status as string)) {
      const lastOutbound = thread.last_outbound_at as string | null
      if (thread.status === 'responded' && (!lastOutbound || iso > lastOutbound)) {
        patch.status = 'needs_response'
      }
    }
  }

  // Denormalized latest_* on the thread row so the inbox list can render
  // without an N+1 join over email_messages. Only overwrite if this message
  // is newer than what's stored (or nothing is stored yet).
  const currentLatest = (thread?.latest_sent_at as string | null) ?? null
  if (!currentLatest || iso > currentLatest) {
    patch.latest_from_addr = msg.from.addr
    patch.latest_from_name = msg.from.name
    patch.latest_subject = msg.subject
    patch.latest_snippet = (msg.textBody ?? '').replace(/\s+/g, ' ').trim().slice(0, 240)
    patch.latest_sent_at = iso
    patch.latest_has_attachments = msg.attachments.length > 0
  }

  if (Object.keys(patch).length > 0) {
    await supabase.from('email_threads').update(patch).eq('id', threadId)
  }
}

async function upsertSyncState(supabase: SupabaseClient, folder: string, uidValidity: number, lastUid: number) {
  await supabase
    .from('imap_sync_state')
    .upsert({ folder, uid_validity: uidValidity, last_uid: lastUid, last_synced_at: new Date().toISOString() }, { onConflict: 'folder' })
}
