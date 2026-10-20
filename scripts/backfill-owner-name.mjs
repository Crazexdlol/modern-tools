// Backfill acv_history.claim.ownerName for every row where it's empty.
// Rule: ownerName = ownerName || insuredName || claimantName.
// Flags any claim where none of the three has a value (nothing to backfill).
//
// The service_role key short-circuits the acv_history_appraiser_guard trigger
// (the guard returns NEW immediately when auth.role() = 'service_role'), so
// jsonb updates run cleanly without disabling the trigger.
//
// Usage:
//   node scripts/backfill-owner-name.mjs            # dry-run, prints plan
//   node scripts/backfill-owner-name.mjs --commit   # writes updates
//
// Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '..', '.env.local')
if (existsSync(envPath)) {
  const raw = readFileSync(envPath, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
    }
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be in .env.local')
  process.exit(1)
}
const commit = process.argv.includes('--commit')
const db = createClient(url, key, { auth: { persistSession: false } })

function clean(v) {
  if (v == null) return ''
  if (typeof v !== 'string') return ''
  return v.trim()
}

async function main() {
  console.log(commit ? '\n=== COMMIT MODE ===\n' : '\n=== DRY RUN (no writes) ===\n')

  const { data: rows, error } = await db
    .from('acv_history')
    .select('id, claim')
    .not('claim', 'is', null)
  if (error) { console.error('fetch failed:', error); process.exit(1) }

  console.log(`Scanned ${rows.length} claims with a claim JSON.`)

  const alreadySet = []
  const toUpdate = []     // { id, from: 'insured'|'claimant', value, prevClaim }
  const noSource = []     // { id, maNumber } — nothing to backfill from

  for (const r of rows) {
    const claim = r.claim ?? {}
    const owner = clean(claim.ownerName)
    if (owner) { alreadySet.push(r.id); continue }
    const insured = clean(claim.insuredName)
    const claimant = clean(claim.claimantName)
    const nextOwner = insured || claimant
    if (!nextOwner) {
      noSource.push({ id: r.id, maNumber: clean(claim.maNumber) })
      continue
    }
    toUpdate.push({
      id: r.id,
      from: insured ? 'insuredName' : 'claimantName',
      value: nextOwner,
      prevClaim: claim,
    })
  }

  console.log(`  - ${alreadySet.length} already have ownerName (skip)`)
  console.log(`  - ${toUpdate.length} will be backfilled`)
  console.log(`    - from insuredName: ${toUpdate.filter(x => x.from === 'insuredName').length}`)
  console.log(`    - from claimantName: ${toUpdate.filter(x => x.from === 'claimantName').length}`)
  console.log(`  - ${noSource.length} have NO insured + NO claimant (flagged for Henry)\n`)

  if (noSource.length) {
    console.log('--- Claims with no owner candidate (manual review needed) ---')
    for (const item of noSource) {
      console.log(`  id=${item.id}  MA#=${item.maNumber || '(none)'}`)
    }
    console.log()
  }

  const outPath = resolve(__dirname, '..', 'owner-backfill-plan.json')
  writeFileSync(outPath, JSON.stringify({
    totalScanned: rows.length,
    alreadySet: alreadySet.length,
    toUpdate: toUpdate.map(({ id, from, value }) => ({ id, from, value })),
    noSource,
  }, null, 2))
  console.log(`Full plan written to: ${outPath}`)

  // Preview the first 5 updates for sanity.
  if (toUpdate.length) {
    console.log('\nFirst 5 updates preview:')
    for (const u of toUpdate.slice(0, 5)) {
      console.log(`  id=${u.id}  ownerName := "${u.value}"  (from ${u.from})`)
    }
  }

  if (!commit) {
    console.log('\nDry-run complete. Re-run with --commit to apply.')
    return
  }

  // Write updates. Only the claim JSONB column is touched. We spread the
  // original claim object to preserve every other key byte-for-byte and only
  // add/overwrite ownerName. One row at a time (safest with jsonb) — ~390
  // claims total, so this is quick.
  let written = 0
  let failed = 0
  for (const u of toUpdate) {
    const nextClaim = { ...u.prevClaim, ownerName: u.value }
    const { error: updErr } = await db
      .from('acv_history')
      .update({ claim: nextClaim })
      .eq('id', u.id)
    if (updErr) {
      failed++
      console.error(`  update failed for id=${u.id}: ${updErr.message}`)
      continue
    }
    written++
    if (written % 50 === 0) console.log(`  ... ${written}/${toUpdate.length}`)
  }
  console.log(`\n✓ Wrote ${written} rows (${failed} failed).`)
}

main().catch((e) => { console.error(e); process.exit(1) })
