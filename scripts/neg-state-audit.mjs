// Audit the current state of email_threads so we understand Henry's "123 vs 5"
// complaint. Prints: total threads by status, needs_response broken down by
// claim link + sender, how many messages are inside each needs_response thread,
// and the top senders in needs_response.
//
// Run: SUPABASE_SERVICE_ROLE_KEY='<key>' node scripts/neg-state-audit.mjs

import { createClient } from '@supabase/supabase-js'

const URL = 'https://ektglhdstobaipdqssjx.supabase.co'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!KEY) { console.error('SUPABASE_SERVICE_ROLE_KEY required'); process.exit(1) }
const supabase = createClient(URL, KEY, { auth: { persistSession: false } })

// 1. Totals by status.
console.log('=== email_threads by status ===')
for (const status of ['needs_response', 'unmatched', 'responded', 'spam', 'ignored']) {
  const { count } = await supabase
    .from('email_threads')
    .select('id', { count: 'exact', head: true })
    .eq('status', status)
  console.log(`  ${status.padEnd(16)} ${count ?? 0}`)
}

// 2. needs_response: how many are linked to a claim vs. not?
console.log('\n=== needs_response linkage ===')
const { count: linked } = await supabase
  .from('email_threads')
  .select('id', { count: 'exact', head: true })
  .eq('status', 'needs_response')
  .not('negotiation_case_id', 'is', null)
const { count: unlinked } = await supabase
  .from('email_threads')
  .select('id', { count: 'exact', head: true })
  .eq('status', 'needs_response')
  .is('negotiation_case_id', null)
console.log(`  linked to claim: ${linked ?? 0}`)
console.log(`  unlinked:        ${unlinked ?? 0}`)

// 3. For threads linked to a claim: how are they distributed across claims?
console.log('\n=== needs_response: threads per claim (top 20) ===')
const { data: cases } = await supabase
  .from('negotiation_cases')
  .select('claim_id, thread_id')
const caseByThread = new Map()
for (const c of cases ?? []) caseByThread.set(c.thread_id, c.claim_id)

const { data: needsThreads } = await supabase
  .from('email_threads')
  .select('id, latest_subject, latest_from_addr, last_inbound_at')
  .eq('status', 'needs_response')
  .limit(500)
const perClaim = new Map()
for (const t of needsThreads ?? []) {
  const claim = caseByThread.get(t.id)
  const key = claim ?? '(unlinked)'
  if (!perClaim.has(key)) perClaim.set(key, [])
  perClaim.get(key).push(t)
}
const sorted = [...perClaim.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 20)
for (const [claim, threads] of sorted) {
  console.log(`  ${claim.padEnd(32)} ${threads.length} threads`)
  for (const t of threads.slice(0, 3)) {
    console.log(`    - ${(t.latest_subject || '').slice(0, 80)} | ${t.latest_from_addr}`)
  }
  if (threads.length > 3) console.log(`    ... +${threads.length - 3} more`)
}

// 4. Messages per thread — are these actually one-message threads?
console.log('\n=== messages per thread (needs_response, top 15) ===')
const ids = (needsThreads ?? []).map(t => t.id)
if (ids.length > 0) {
  const msgCounts = new Map()
  const CHUNK = 100
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK)
    const { data: msgs } = await supabase
      .from('email_messages')
      .select('thread_id')
      .in('thread_id', chunk)
    for (const m of msgs ?? []) {
      msgCounts.set(m.thread_id, (msgCounts.get(m.thread_id) ?? 0) + 1)
    }
  }
  const dist = { 1: 0, 2: 0, 3: 0, '4-5': 0, '6-10': 0, '11+': 0 }
  for (const c of msgCounts.values()) {
    if (c === 1) dist['1']++
    else if (c === 2) dist['2']++
    else if (c === 3) dist['3']++
    else if (c <= 5) dist['4-5']++
    else if (c <= 10) dist['6-10']++
    else dist['11+']++
  }
  for (const [k, v] of Object.entries(dist)) console.log(`  ${k.padEnd(6)} ${v} threads`)
}

// 5. Top senders in needs_response.
console.log('\n=== top senders in needs_response ===')
const sendCounts = new Map()
for (const t of needsThreads ?? []) {
  const e = (t.latest_from_addr || '').toLowerCase()
  sendCounts.set(e, (sendCounts.get(e) ?? 0) + 1)
}
const topSenders = [...sendCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)
for (const [email, n] of topSenders) {
  console.log(`  ${email.padEnd(50)} ${n}`)
}

// 6. Modern Group / claimleader presence.
console.log('\n=== claimleader / modern group check ===')
const { data: mg } = await supabase
  .from('email_messages')
  .select('thread_id, from_addr, subject, sent_at')
  .ilike('from_addr', '%claimleader.com')
  .limit(5)
console.log(`  found ${(mg ?? []).length} message(s) from *@claimleader.com (showing up to 5):`)
for (const m of mg ?? []) {
  console.log(`    thread=${m.thread_id} ${m.from_addr} | ${(m.subject || '').slice(0, 60)}`)
}
