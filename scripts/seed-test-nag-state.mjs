// One-shot: seed nag state on the throwaway test claim so the "Post as status"
// button has something visible to clear. Updates only the one claim id passed in.
//
// Run: SUPABASE_SERVICE_ROLE_KEY='...' node scripts/seed-test-nag-state.mjs <claim-id>

import { createClient } from '@supabase/supabase-js'

const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const CLAIM_ID = process.argv[2]
if (!KEY || !CLAIM_ID) {
  console.error('Usage: SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-test-nag-state.mjs <claim-id>')
  process.exit(1)
}

const supabase = createClient(
  'https://ektglhdstobaipdqssjx.supabase.co',
  KEY,
  { auth: { persistSession: false } },
)

const { data: before, error: readErr } = await supabase
  .from('acv_history')
  .select('id, ma_number, assigned_to, workflow_stage, status_request_count, last_status_request_at, status_lockout_at')
  .eq('id', CLAIM_ID)
  .single()
if (readErr) { console.error('read:', readErr); process.exit(1) }
console.log('BEFORE:', before)

const { data: after, error: writeErr } = await supabase
  .from('acv_history')
  .update({
    status_request_count: 1,
    last_status_request_at: new Date().toISOString(),
  })
  .eq('id', CLAIM_ID)
  .select('id, ma_number, status_request_count, last_status_request_at, status_lockout_at')
  .single()
if (writeErr) { console.error('write:', writeErr); process.exit(1) }
console.log('AFTER :', after)
