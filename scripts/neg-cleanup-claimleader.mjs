// One-off: seed the claimleader.com domain mute AND retroactively mark every
// existing email_threads row whose latest sender is on that domain as spam.
// Also catches assignments@-pattern senders broadly (bulletproofs the backlog
// against existing automated claim-portal notifications).
//
// Run: SUPABASE_SERVICE_ROLE_KEY='<key>' node scripts/neg-cleanup-claimleader.mjs

import { createClient } from '@supabase/supabase-js'

const URL = 'https://ektglhdstobaipdqssjx.supabase.co'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!KEY) { console.error('SUPABASE_SERVICE_ROLE_KEY required'); process.exit(1) }
const supabase = createClient(URL, KEY, { auth: { persistSession: false } })

// 1. Seed muted-sender row for the domain (idempotent).
{
  const { error } = await supabase
    .from('negotiation_muted_senders')
    .insert({ domain: 'claimleader.com', note: 'seeded 2026-10-01 — assignment status updates, no response needed' })
  if (error && error.code !== '23505') {
    console.error('seed muted_senders failed:', error.message)
    process.exit(1)
  }
  console.log(error?.code === '23505' ? '[seed] claimleader.com already muted' : '[seed] claimleader.com muted')
}

// 2. Collect all thread_ids whose messages come from automated-pattern senders:
//    - *@claimleader.com (domain mute)
//    - assignments@* or assignment@* (generic pattern)
//    Only touch threads whose current status is one of the triage-visible
//    states — never resurrect a thread that Henry manually ignored.
const AFFECTED_STATUSES = ['needs_response', 'unmatched']

const threadIds = new Set()
for (const pattern of ['%@claimleader.com', 'assignment@%', 'assignments@%']) {
  const { data, error } = await supabase
    .from('email_messages')
    .select('thread_id')
    .ilike('from_addr', pattern)
    .limit(5000)
  if (error) { console.error('scan error', error.message); process.exit(1) }
  for (const row of data ?? []) threadIds.add(row.thread_id)
}
console.log(`[scan] candidate threads from automated senders: ${threadIds.size}`)

// 3. Mark those threads spam (bulk update, batched to stay well under PostgREST payload limits).
let marked = 0
const ids = [...threadIds]
const CHUNK = 100
for (let i = 0; i < ids.length; i += CHUNK) {
  const chunk = ids.slice(i, i + CHUNK)
  const { data, error } = await supabase
    .from('email_threads')
    .update({ status: 'spam', classification: 'automated', classification_reason: 'automated sender (seeded cleanup)' })
    .in('id', chunk)
    .in('status', AFFECTED_STATUSES)
    .select('id')
  if (error) { console.error('update error', error.message); process.exit(1) }
  marked += (data ?? []).length
}
console.log(`[spam] moved ${marked} thread(s) from needs_response/unmatched → spam`)
