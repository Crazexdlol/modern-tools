// One-shot: delete the throwaway test claim created during the auto-status fix
// verification on 2026-10-24 (MA#555696, id=1792832989764-jk1nz).
//
// Run: SUPABASE_SERVICE_ROLE_KEY='...' node scripts/cleanup-test-claim.mjs

import { createClient } from '@supabase/supabase-js'

const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!KEY) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY first.')
  process.exit(1)
}

const TEST_CLAIM_ID = '1792832989764-jk1nz'
const EXPECTED_MA = '555696'

const supabase = createClient(
  'https://ektglhdstobaipdqssjx.supabase.co',
  KEY,
  { auth: { persistSession: false } },
)

// Guard: confirm it is actually the test claim before deleting
const { data: claim, error: readErr } = await supabase
  .from('acv_history')
  .select('id, ma_number, claim')
  .eq('id', TEST_CLAIM_ID)
  .maybeSingle()
if (readErr) { console.error('read:', readErr); process.exit(1) }
if (!claim) { console.log('Claim already gone — nothing to clean up.'); process.exit(0) }
if (claim.ma_number !== EXPECTED_MA) {
  console.error(`REFUSING: expected MA#${EXPECTED_MA}, found MA#${claim.ma_number}. Aborting.`)
  process.exit(1)
}
const ownerName = claim.claim?.ownerName || claim.claim?.insuredName || '(unknown)'
if (!ownerName.includes('ZZZ TEST')) {
  console.error(`REFUSING: owner "${ownerName}" does not look like a test claim. Aborting.`)
  process.exit(1)
}
console.log(`Guard passed: id=${TEST_CLAIM_ID} MA#${claim.ma_number} owner="${ownerName}"`)

// Delete messages first (FK), then the claim row
const { error: msgErr, count: msgCount } = await supabase
  .from('messages')
  .delete({ count: 'exact' })
  .eq('claim_id', TEST_CLAIM_ID)
if (msgErr) console.error('message delete warning (may just mean no FK):', msgErr.message)
else console.log(`messages deleted: ${msgCount}`)

const { error: claimErr, count: claimCount } = await supabase
  .from('acv_history')
  .delete({ count: 'exact' })
  .eq('id', TEST_CLAIM_ID)
if (claimErr) { console.error('claim delete:', claimErr); process.exit(1) }
console.log(`acv_history rows deleted: ${claimCount}`)

const { data: check } = await supabase.from('acv_history').select('id').eq('id', TEST_CLAIM_ID)
console.log(check.length === 0 ? 'VERIFIED gone.' : 'STILL PRESENT — check manually.')
