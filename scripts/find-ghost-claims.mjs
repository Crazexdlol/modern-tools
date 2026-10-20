// Find acv_history rows that are OPEN but have no identifying info
// (missing ma_number AND no insuredName AND no claim.claimNumber) — these
// won't appear on the dashboard because the UI needs at least one identifier
// to render a usable row. Service-role read; prints a table + totals.

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '..', '.env.local')
if (existsSync(envPath)) {
  const raw = readFileSync(envPath, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('env missing'); process.exit(1) }
const db = createClient(url, key, { auth: { persistSession: false } })

const { data, error } = await db
  .from('acv_history')
  .select('id, ma_number, claim, status, created_at, assigned_to, mode')
  .or('status.is.null,status.eq.open')
  .order('created_at', { ascending: false })
if (error) { console.error('fetch failed:', error); process.exit(1) }

const ghosts = (data ?? []).filter(r => {
  const maEmpty = !r.ma_number || !String(r.ma_number).trim()
  const insuredEmpty = !r.claim?.insuredName || !String(r.claim.insuredName).trim()
  const claimNumEmpty = !r.claim?.claimNumber || !String(r.claim.claimNumber).trim()
  const vinEmpty = !r.claim?.vin || !String(r.claim.vin).trim()
  return maEmpty && insuredEmpty && claimNumEmpty && vinEmpty
})

const nearGhosts = (data ?? []).filter(r => {
  if (ghosts.includes(r)) return false
  const maEmpty = !r.ma_number || !String(r.ma_number).trim()
  const insuredEmpty = !r.claim?.insuredName || !String(r.claim.insuredName).trim()
  const claimNumEmpty = !r.claim?.claimNumber || !String(r.claim.claimNumber).trim()
  // Near-ghost: missing at least two of the three primary identifiers
  const missingCount = [maEmpty, insuredEmpty, claimNumEmpty].filter(Boolean).length
  return missingCount >= 2
})

console.log(`\nScanned ${data?.length ?? 0} open claims.\n`)

console.log(`=== PURE GHOSTS (no MA#, no insured, no claim#, no VIN) — ${ghosts.length} ===`)
for (const r of ghosts) {
  console.log(`  ${r.id}  mode=${r.mode}  created=${r.created_at}  assigned_to=${r.assigned_to ?? '(none)'}`)
}

console.log(`\n=== NEAR-GHOSTS (missing 2 of 3 primary identifiers) — ${nearGhosts.length} ===`)
for (const r of nearGhosts.slice(0, 30)) {
  console.log(`  ${r.id}  MA=${r.ma_number ?? '-'}  INS=${r.claim?.insuredName ?? '-'}  CL=${r.claim?.claimNumber ?? '-'}  VIN=${r.claim?.vin ?? '-'}  created=${r.created_at}`)
}
if (nearGhosts.length > 30) console.log(`  ... and ${nearGhosts.length - 30} more`)
