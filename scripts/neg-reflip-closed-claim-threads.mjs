// Retroactively flip email_threads matched to a CLOSED claim out of
// needs_response/responded/unmatched → closed_claim. Run after the
// migration-negotiations-closed-claim-status.sql has been applied.
//
// Run: SUPABASE_SERVICE_ROLE_KEY='<key>' node scripts/neg-reflip-closed-claim-threads.mjs

import { createClient } from '@supabase/supabase-js'

const URL = 'https://ektglhdstobaipdqssjx.supabase.co'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!KEY) { console.error('SUPABASE_SERVICE_ROLE_KEY required'); process.exit(1) }
const supabase = createClient(URL, KEY, { auth: { persistSession: false } })

// 1. Find all claims with status='closed'.
const { data: closedClaims } = await supabase
  .from('acv_history')
  .select('id')
  .eq('status', 'closed')
  .limit(5000)
const closedClaimIds = (closedClaims ?? []).map(c => c.id)
console.log(`[closed] ${closedClaimIds.length} closed claim(s)`)
if (closedClaimIds.length === 0) process.exit(0)

// 2. Grab the thread_ids linked to any of those claims via negotiation_cases.
const CHUNK = 100
const threadIds = []
for (let i = 0; i < closedClaimIds.length; i += CHUNK) {
  const chunk = closedClaimIds.slice(i, i + CHUNK)
  const { data } = await supabase
    .from('negotiation_cases')
    .select('thread_id')
    .in('claim_id', chunk)
  for (const row of data ?? []) threadIds.push(row.thread_id)
}
console.log(`[linked] ${threadIds.length} thread(s) linked to closed claims`)

// 3. Flip any of those threads whose status is NOT already terminal to closed_claim.
let flipped = 0
for (let i = 0; i < threadIds.length; i += CHUNK) {
  const chunk = threadIds.slice(i, i + CHUNK)
  const { data, error } = await supabase
    .from('email_threads')
    .update({ status: 'closed_claim' })
    .in('id', chunk)
    .in('status', ['needs_response', 'responded', 'unmatched'])
    .select('id')
  if (error) { console.error('batch update failed:', error.message); continue }
  flipped += (data ?? []).length
}
console.log(`\n[reflip] moved ${flipped} thread(s) to closed_claim`)
