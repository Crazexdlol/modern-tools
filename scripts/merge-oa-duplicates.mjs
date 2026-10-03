// Merge the 7 same-name-different-company OA duplicates Henry disambiguated
// on 2026-10-03. For each entry we keep the chosen company row and archive
// (soft-delete) the losing row.
//
// Usage: node scripts/merge-oa-duplicates.mjs
// (idempotent — safe to re-run; already-archived losers are a no-op)

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

// Keep = the row to preserve. Drop = the row(s) to archive.
// Case-insensitive on both name and company; whitespace-insensitive via normalization.
const MERGES = [
  { name: 'Jason Farbiarz',  keep: 'National Appraisers',    drop: 'Auto Damage Claims' },
  { name: 'Josh Dorris',     keep: 'Ironclad Claims Solutions', drop: 'Ironclad' },
  { name: 'Randy Markham',   keep: 'DVUSA',                   drop: 'DVAC' },
  { name: 'Carlos Liutti',   keep: 'Appraisal Engine',        drop: 'National Appraisers' },
  { name: 'Craig Anderson',  keep: 'Vehicle Value Experts',   drop: 'Auto Claim Specialist' },
  { name: 'Ryan Cook',       keep: 'IAS Claims Group',        drop: 'IAS' },
  { name: 'Bekki Coury',     keep: 'MCA Appraisers',          drop: 'Motor City Auto Appraisers & Auto Appraisal Network Detroit' },
]

const norm = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ')

let archived = 0
let notFound = 0
let alreadyArchived = 0
for (const m of MERGES) {
  // Find all active rows for this name (both keep + drop candidates).
  const { data: rows, error } = await db
    .from('opposing_appraisers')
    .select('id, name, company, archived_at')
    .ilike('name', m.name)
  if (error) { console.error(`fetch failed for ${m.name}:`, error); process.exit(1) }

  const dropRow = (rows ?? []).find(r => norm(r.company) === norm(m.drop))
  if (!dropRow) {
    console.log(`  (skip) ${m.name} @ ${m.drop} — not found; may already be merged`)
    notFound++
    continue
  }
  if (dropRow.archived_at) {
    console.log(`  (skip) ${m.name} @ ${m.drop} — already archived`)
    alreadyArchived++
    continue
  }

  const { error: upErr } = await db
    .from('opposing_appraisers')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', dropRow.id)
  if (upErr) { console.error(`archive failed for ${m.name} @ ${m.drop}:`, upErr); process.exit(1) }
  console.log(`  ✓ archived ${m.name} @ ${m.drop} (keep ${m.keep})`)
  archived++
}

console.log(`\nDone — archived ${archived}, already archived ${alreadyArchived}, not found ${notFound}`)
