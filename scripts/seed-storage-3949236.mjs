#!/usr/bin/env node
// One-shot: seed the Storage Charges tab for claim MA# 3949236 with the
// six lines Henry provided. Formula per current app: Qty × Hours × Rate.

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const MA = '3949236'

const lines = [
  { qty: 1, description: 'Rotator',            hours: 4.75, rate: 950 },
  { qty: 1, description: 'Tractor',            hours: 2.75, rate: 235 },
  { qty: 1, description: 'Heavy Duty Wrecker', hours: 3,    rate: 235 },
  { qty: 1, description: 'Skid Steer',         hours: 2.75, rate: 150 },
  { qty: 1, description: 'Dumpster',           hours: 1,    rate: 450 },
  { qty: 2, description: 'Laborer',            hours: 2.75, rate: 125 },
].map((l, i) => ({
  id: `seed-${Date.now()}-${i}`,
  ...l,
}))

// Sanity: log each line's computed total (Qty × Hours × Rate).
let subtotal = 0
for (const l of lines) {
  const total = l.qty * l.hours * l.rate
  subtotal += total
  console.log(`  ${l.qty} × ${l.description.padEnd(20)} × ${l.hours}h × $${l.rate} = $${total.toFixed(2)}`)
}
console.log(`  Subtotal: $${subtotal.toFixed(2)}`)

// Find the claim by MA#. Two claims could theoretically share an MA# on
// legacy rows — the dup-detection API warns but doesn't block. If we get
// more than one we bail out and let Henry disambiguate.
const { data: rows, error: findErr } = await admin
  .from('acv_history')
  .select('id, ma_number, claim, storage')
  .ilike('ma_number', MA)
if (findErr) { console.error('find failed:', findErr); process.exit(1) }
if (!rows || rows.length === 0) { console.error(`No claim with MA# ${MA}`); process.exit(1) }
if (rows.length > 1) {
  console.error(`Found ${rows.length} claims with MA# ${MA}. Refusing to auto-pick.`)
  for (const r of rows) console.error(`  ${r.id} — ${r.claim?.insuredName ?? 'unknown'}`)
  process.exit(1)
}
const row = rows[0]
console.log(`Found claim ${row.id} — ${row.claim?.insuredName ?? 'unknown insured'}`)
if (row.storage?.lines?.length > 0) {
  console.log(`  WARNING: existing storage state has ${row.storage.lines.length} lines. Overwriting.`)
}

const nextStorage = {
  lines,
  taxRatePct: 0,
  notes: '',
  savedAt: new Date().toISOString(),
}

const { error: updErr } = await admin
  .from('acv_history')
  .update({ storage: nextStorage })
  .eq('id', row.id)
if (updErr) { console.error('update failed:', updErr); process.exit(1) }
console.log('Storage state written. Reload the claim workspace to see it.')
