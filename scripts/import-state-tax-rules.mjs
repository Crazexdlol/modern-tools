#!/usr/bin/env node
// One-off importer: reads "Sales Tax Application by State 5-9-19.xlsx" and
// upserts one row per state into public.state_tax_rules. Run AFTER applying
// supabase/migration-state-tax-rules.sql.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-state-tax-rules.mjs
//
// Default xlsx path: C:\Users\Owner\Downloads\Sales Tax Application by State 5-9-19.xlsx
// Override with --file <path>.

import XLSX from 'xlsx'
import { createClient } from '@supabase/supabase-js'

const args = process.argv.slice(2)
let xlsxPath = 'C:\\Users\\Owner\\Downloads\\Sales Tax Application by State 5-9-19.xlsx'
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--file' && args[i + 1]) { xlsxPath = args[i + 1]; i++ }
}

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars')
  process.exit(1)
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// Column index in the spreadsheet → rule enum on our table.
// Column 0 is "State", 1..5 are the five mutually-exclusive rule columns.
const RULES = [
  { col: 1, rule: 'none' },
  { col: 2, rule: 'all' },
  { col: 3, rule: 'parts_materials' },
  { col: 4, rule: 'parts_only' },
  { col: 5, rule: 'parts_materials_refinish' },
]

function detectRule(row) {
  for (const { col, rule } of RULES) {
    const v = String(row[col] ?? '').trim().toUpperCase()
    if (v === 'X') return rule
  }
  return null
}

async function main() {
  const wb = XLSX.readFile(xlsxPath)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  // Skip header row.
  const payloads = []
  for (let i = 1; i < rows.length; i++) {
    const state = String(rows[i][0] ?? '').trim().toUpperCase()
    if (!/^[A-Z]{2}$/.test(state)) continue
    const rule = detectRule(rows[i])
    if (!rule) {
      console.warn(`  ${state}: no rule column marked — skipping`)
      continue
    }
    payloads.push({ state, rule, updated_at: new Date().toISOString() })
  }
  console.log(`Parsed ${payloads.length} states from ${xlsxPath}`)

  const { data, error } = await admin
    .from('state_tax_rules')
    .upsert(payloads, { onConflict: 'state' })
    .select('state, rule')
  if (error) { console.error('Upsert failed:', error); process.exit(1) }
  console.log(`Upserted ${data.length} rows.`)
  const counts = new Map()
  for (const r of data) counts.set(r.rule, (counts.get(r.rule) ?? 0) + 1)
  for (const [k, v] of counts) console.log(`  ${k.padEnd(25)} ${v}`)
}

main().catch((err) => { console.error(err); process.exit(1) })
