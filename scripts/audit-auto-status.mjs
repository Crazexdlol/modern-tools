// Audit prod for claims in a bad auto-status state:
//   A. closed claims with any nag-state columns still populated
//   B. past-main claims (QC / billing_delivery / payment) still carrying an assigned_to
//   C. past-main claims with any nag-state still populated (even if assigned_to null)
//   D. currently open+assigned claims — who's getting nagged right now
//   E. active lockouts
//
// Run: SUPABASE_SERVICE_ROLE_KEY='...' node scripts/audit-auto-status.mjs
// (The service role key bypasses RLS so we see all 390+ claims.)

import { createClient } from '@supabase/supabase-js'

const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!KEY) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY first.')
  process.exit(1)
}
const supabase = createClient(
  'https://ektglhdstobaipdqssjx.supabase.co',
  KEY,
  { auth: { persistSession: false } },
)

const COLS = 'id, ma_number, status, workflow_stage, assigned_to, assigned_at, status_phase, status_request_count, last_status_request_at, status_lockout_at, submitted_at, submitted_by, closed_at'

function fmt(row) {
  const owner = row.claim?.insuredName ?? ''
  return `  MA#${row.ma_number ?? '—'}  stage=${row.workflow_stage ?? 'main'}  status=${row.status}  assigned=${row.assigned_to ?? 'null'}  count=${row.status_request_count ?? 0}  lastReq=${row.last_status_request_at ?? '—'}  lockout=${row.status_lockout_at ?? '—'}  owner=${owner}`
}

console.log('\n=== A. CLOSED claims with nag state still populated ===')
{
  const { data, error } = await supabase
    .from('acv_history')
    .select(COLS + ', claim')
    .eq('status', 'closed')
    .or('status_request_count.gt.0,last_status_request_at.not.is.null,status_lockout_at.not.is.null')
    .limit(500)
  if (error) throw error
  console.log(`  ${data.length} rows`)
  data.slice(0, 30).forEach(r => console.log(fmt(r)))
  if (data.length > 30) console.log(`  … and ${data.length - 30} more`)
}

console.log('\n=== B. PAST-MAIN (qc/billing/payment) claims still carrying assigned_to ===')
{
  const { data, error } = await supabase
    .from('acv_history')
    .select(COLS + ', claim')
    .in('workflow_stage', ['qc', 'billing_delivery', 'payment'])
    .not('assigned_to', 'is', null)
    .eq('status', 'open')
    .limit(500)
  if (error) throw error
  console.log(`  ${data.length} rows — these would get nagged by cron because filter is (status=open && assigned_to IS NOT NULL)`)
  data.slice(0, 50).forEach(r => console.log(fmt(r)))
  if (data.length > 50) console.log(`  … and ${data.length - 50} more`)
}

console.log('\n=== C. PAST-MAIN claims with nag state populated (whether or not assigned_to is set) ===')
{
  const { data, error } = await supabase
    .from('acv_history')
    .select(COLS + ', claim')
    .in('workflow_stage', ['qc', 'billing_delivery', 'payment'])
    .or('status_request_count.gt.0,last_status_request_at.not.is.null,status_lockout_at.not.is.null')
    .limit(500)
  if (error) throw error
  console.log(`  ${data.length} rows — stale state from prior Main stage, won't actually fire if assigned_to is null`)
  data.slice(0, 30).forEach(r => console.log(fmt(r)))
}

console.log('\n=== D. ACTIVE lockouts right now (status_lockout_at IS NOT NULL, open) ===')
{
  const { data, error } = await supabase
    .from('acv_history')
    .select(COLS + ', claim')
    .not('status_lockout_at', 'is', null)
    .eq('status', 'open')
  if (error) throw error
  console.log(`  ${data.length} rows`)
  data.forEach(r => console.log(fmt(r)))
}

console.log('\n=== E. OPEN+ASSIGNED claims in nag queue (count > 0) ===')
{
  const { data, error } = await supabase
    .from('acv_history')
    .select(COLS + ', claim')
    .eq('status', 'open')
    .not('assigned_to', 'is', null)
    .gt('status_request_count', 0)
    .order('status_request_count', { ascending: false })
    .limit(50)
  if (error) throw error
  console.log(`  ${data.length} rows (top 50 by count)`)
  data.forEach(r => console.log(fmt(r)))
}

console.log('\n=== F. Closed in last 30 days with any nag/lockout state ===')
{
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
  const { data, error } = await supabase
    .from('acv_history')
    .select(COLS + ', claim')
    .eq('status', 'closed')
    .gte('closed_at', since)
    .or('status_request_count.gt.0,last_status_request_at.not.is.null,status_lockout_at.not.is.null')
    .order('closed_at', { ascending: false })
    .limit(100)
  if (error) throw error
  console.log(`  ${data.length} rows`)
  data.forEach(r => console.log(fmt(r) + `  closed_at=${r.closed_at}`))
}
