// Forensic look at needs_response threads to find out WHY they're stuck.
// For each needs_response thread (sample ≤ 15 oldest), print:
//   - thread status, inbound/outbound timestamps
//   - every message's folder + from_addr + sent_at
//   - whether there's any "sent" message in the thread
//   - whether owner's address (passed as arg) appears in to_addrs or cc_addrs
//
// Run: SUPABASE_SERVICE_ROLE_KEY='<key>' OWNER_EMAIL='<x>' node scripts/neg-thread-forensics.mjs

import { createClient } from '@supabase/supabase-js'

const URL = 'https://ektglhdstobaipdqssjx.supabase.co'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const OWNER = (process.env.OWNER_EMAIL || '').toLowerCase()
if (!KEY) { console.error('SUPABASE_SERVICE_ROLE_KEY required'); process.exit(1) }
const supabase = createClient(URL, KEY, { auth: { persistSession: false } })

console.log(`[forensics] owner email arg: ${OWNER || '(not provided — "sent folder" check only)'}`)

const { data: threads } = await supabase
  .from('email_threads')
  .select('id, status, last_inbound_at, last_outbound_at, latest_subject, latest_from_addr, references_root, subject_normalized')
  .eq('status', 'needs_response')
  .order('last_inbound_at', { ascending: true, nullsFirst: false })
  .limit(15)

if (!threads || threads.length === 0) { console.log('no threads'); process.exit(0) }

for (const t of threads) {
  console.log(`\n=== thread ${t.id} ===`)
  console.log(`  subject: ${(t.latest_subject || '').slice(0, 80)}`)
  console.log(`  latest_from: ${t.latest_from_addr}  last_inbound_at: ${t.last_inbound_at}  last_outbound_at: ${t.last_outbound_at}`)
  console.log(`  references_root: ${t.references_root || '(null)'}`)

  const { data: msgs } = await supabase
    .from('email_messages')
    .select('id, folder, from_addr, from_name, sent_at, subject, to_addrs, cc_addrs, message_id, in_reply_to')
    .eq('thread_id', t.id)
    .order('sent_at', { ascending: true })

  if (!msgs || msgs.length === 0) { console.log('  (no messages in thread)'); continue }

  for (const m of msgs) {
    const outboundFolder = m.folder.toLowerCase().includes('sent')
    const fromOwner = OWNER && m.from_addr === OWNER
    const flag = outboundFolder || fromOwner ? 'OUT' : 'in '
    const to = JSON.stringify(m.to_addrs || []).slice(0, 60)
    console.log(`  ${flag} [${m.folder}] ${m.sent_at} ← ${m.from_addr} → ${to}`)
  }

  // Owner search: does ANY message in the DB with the thread's normalized subject
  // or references_root come from an owner-like address?
  if (OWNER) {
    const { data: possibleReplies } = await supabase
      .from('email_messages')
      .select('id, folder, from_addr, subject, sent_at, thread_id')
      .eq('from_addr', OWNER)
      .ilike('subject', `%${(t.latest_subject || '').slice(0, 40).replace(/[%_]/g, '')}%`)
      .limit(5)
    if (possibleReplies && possibleReplies.length > 0) {
      console.log(`  POTENTIAL REPLIES from ${OWNER}:`)
      for (const r of possibleReplies) {
        const sameThread = r.thread_id === t.id
        console.log(`    ${sameThread ? '✓ same thread' : '✗ DIFFERENT thread'} ${r.thread_id} [${r.folder}] ${r.sent_at} ${(r.subject || '').slice(0, 70)}`)
      }
    }
  }
}

// Overall question: how many messages exist in a 'Sent' folder at all?
const { count: sentCount } = await supabase
  .from('email_messages')
  .select('id', { count: 'exact', head: true })
  .ilike('folder', '%sent%')
console.log(`\n[corpus] total messages in any *sent* folder: ${sentCount ?? 0}`)

// From_addr distribution of sent messages
const { data: sentSamples } = await supabase
  .from('email_messages')
  .select('from_addr')
  .ilike('folder', '%sent%')
  .limit(500)
const sentFromCount = new Map()
for (const m of sentSamples ?? []) {
  sentFromCount.set(m.from_addr, (sentFromCount.get(m.from_addr) ?? 0) + 1)
}
console.log('[sent] top from_addrs in Sent folder:')
for (const [addr, n] of [...sentFromCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
  console.log(`  ${addr.padEnd(50)} ${n}`)
}
