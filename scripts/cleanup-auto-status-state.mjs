// One-time cleanup of invariant-violating rows surfaced by audit-auto-status.mjs:
//   1. 2 bogus lockouts on payment-stage claims (MA#3712203, 3871698) — unlock
//   2. 5 other payment-stage claims with nag state — clear count/last/lockout + null assigned_to
//   3. 2 closed claims with nag state — clear count/last/lockout
//   4. Payment-stage claims with assigned_to set but no nag state (MA#555661, 3978112) — null assigned_to
//
// Rationale: assigned_to should only be set on open Main-stage claims. Submit route
// nulls it on main→qc; these 7 rows escaped. The DB trigger
// `trg_clear_status_lockout_on_reassign` fires when assigned_to changes to null, so
// setting assigned_to=null will auto-clear the three nag columns via trigger. We
// also explicitly set them to be belt-and-suspenders.
//
// Run: SUPABASE_SERVICE_ROLE_KEY='...' node scripts/cleanup-auto-status-state.mjs

import { createClient } from '@supabase/supabase-js'

const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!KEY) { console.error('Set SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
const supabase = createClient(
  'https://ektglhdstobaipdqssjx.supabase.co',
  KEY,
  { auth: { persistSession: false } },
)

const MA_PAYMENT_STAGE_ASSIGNED = ['555661', '3930674', '3978112', '3871698', '3963050', '3712203', '3929066']
const MA_CLOSED_WITH_NAG       = ['3983826', '3980784']

async function run() {
  console.log('\n--- Cleanup pass 1: null assigned_to + clear nag state on 7 payment-stage claims ---')
  for (const ma of MA_PAYMENT_STAGE_ASSIGNED) {
    const { data: before } = await supabase
      .from('acv_history')
      .select('id, ma_number, workflow_stage, status, assigned_to, status_request_count, last_status_request_at, status_lockout_at')
      .eq('ma_number', ma)
      .maybeSingle()
    if (!before) { console.log(`  ${ma}: NOT FOUND`); continue }
    if (before.workflow_stage !== 'payment' || before.status !== 'open') {
      console.log(`  ${ma}: SKIPPED — state changed since audit (now ${before.workflow_stage}/${before.status})`)
      continue
    }
    const { error } = await supabase
      .from('acv_history')
      .update({
        assigned_to: null,
        status_request_count: 0,
        last_status_request_at: null,
        status_lockout_at: null,
      })
      .eq('id', before.id)
    if (error) { console.log(`  ${ma}: FAIL — ${error.message}`); continue }
    console.log(`  ${ma}: cleared  (was assigned=${before.assigned_to} count=${before.status_request_count} lockout=${before.status_lockout_at ?? '—'})`)
  }

  console.log('\n--- Cleanup pass 2: clear nag state on 2 closed claims ---')
  for (const ma of MA_CLOSED_WITH_NAG) {
    const { data: before } = await supabase
      .from('acv_history')
      .select('id, ma_number, status, status_request_count, last_status_request_at, status_lockout_at')
      .eq('ma_number', ma)
      .maybeSingle()
    if (!before) { console.log(`  ${ma}: NOT FOUND`); continue }
    if (before.status !== 'closed') { console.log(`  ${ma}: SKIPPED — now ${before.status}`); continue }
    const { error } = await supabase
      .from('acv_history')
      .update({
        status_request_count: 0,
        last_status_request_at: null,
        status_lockout_at: null,
      })
      .eq('id', before.id)
    if (error) { console.log(`  ${ma}: FAIL — ${error.message}`); continue }
    console.log(`  ${ma}: cleared  (was count=${before.status_request_count} lockout=${before.status_lockout_at ?? '—'})`)
  }

  console.log('\n--- Verification: active lockouts should now be 2 (main-stage, legit) ---')
  const { data: lockouts } = await supabase
    .from('acv_history')
    .select('ma_number, workflow_stage, status, assigned_to, status_lockout_at')
    .not('status_lockout_at', 'is', null)
    .eq('status', 'open')
  console.log(`  ${lockouts.length} active lockouts:`)
  lockouts.forEach(l => console.log(`    MA#${l.ma_number}  stage=${l.workflow_stage}  assigned=${l.assigned_to}  since=${l.status_lockout_at}`))

  console.log('\n--- Verification: past-main claims with assigned_to should now be 0 ---')
  const { data: pastMain } = await supabase
    .from('acv_history')
    .select('ma_number, workflow_stage, assigned_to')
    .in('workflow_stage', ['qc', 'billing_delivery', 'payment'])
    .not('assigned_to', 'is', null)
    .eq('status', 'open')
  console.log(`  ${pastMain.length} rows (expected 0)`)
  pastMain.forEach(r => console.log(`    MA#${r.ma_number}  stage=${r.workflow_stage}  assigned=${r.assigned_to}`))
}

await run()
