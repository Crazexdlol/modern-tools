// One-off: seed user_dashboard_access rows after the workflow-dashboards
// migration has been applied. Idempotent.
//
// Rules:
//   - every admin  → granted all 5 dashboards (main, qc, billing, delivery, payment)
//   - every appraiser → granted only 'main' (preserves current behavior)
//
// Henry can tweak individual grants from the admin UI after this script runs.
//
// Run: SUPABASE_SERVICE_ROLE_KEY='<key>' node scripts/seed-dashboard-access.mjs

import { createClient } from '@supabase/supabase-js'

const URL = 'https://ektglhdstobaipdqssjx.supabase.co'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!KEY) { console.error('SUPABASE_SERVICE_ROLE_KEY required'); process.exit(1) }
const supabase = createClient(URL, KEY, { auth: { persistSession: false } })

const ALL_STAGES = ['main', 'qc', 'billing', 'delivery', 'payment']
const APPRAISER_STAGES = ['main']

const { data: profiles, error: pErr } = await supabase
  .from('profiles')
  .select('id, email, role')
if (pErr) { console.error('load profiles failed:', pErr); process.exit(1) }

console.log(`[seed] ${profiles.length} profiles found`)

let totalInserts = 0
for (const p of profiles) {
  const stages = p.role === 'admin' ? ALL_STAGES : APPRAISER_STAGES
  const rows = stages.map(code => ({ user_id: p.id, dashboard_code: code }))
  const { error, data } = await supabase
    .from('user_dashboard_access')
    .upsert(rows, { onConflict: 'user_id,dashboard_code', ignoreDuplicates: true })
    .select()
  if (error) { console.error(`  ${p.email}: ${error.message}`); continue }
  totalInserts += (data ?? []).length
  console.log(`  ${p.email.padEnd(40)} ${p.role.padEnd(10)} → ${stages.join(', ')}  (new: ${(data ?? []).length})`)
}

console.log(`\n[seed] done. ${totalInserts} new rows inserted.`)

// Audit summary.
const { data: audit } = await supabase
  .from('user_dashboard_access')
  .select('dashboard_code')
const counts = {}
for (const r of audit ?? []) counts[r.dashboard_code] = (counts[r.dashboard_code] || 0) + 1
console.log('\n[audit] grants by dashboard:')
for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(10)} ${v} users`)
