// Sanity-check: for each distinct non-blank appraiser name in the CSV,
// find the matching profile row (case-insensitive, trimmed). Report matches
// and any unmatched CSV names so we can fix them before running the sync.
//
// Reads SUPABASE_SERVICE_ROLE_KEY from env. URL is hardcoded to the project
// ref from CLAUDE.md so we don't have to pass it in.

import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const CSV = 'C:/Users/Owner/Downloads/Current-Claims26-09-11.csv'
const SUPABASE_URL = 'https://ektglhdstobaipdqssjx.supabase.co'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!KEY) { console.error('missing SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }

const sb = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } })

// --- parse CSV ---
const text = fs.readFileSync(CSV, 'utf8').replace(/^﻿/, '')
function parseCSV(text) {
  const rows = []; let row = []; let cell = ''; let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++ } else q = false }
      else cell += c
    } else {
      if (c === '"') q = true
      else if (c === ',') { row.push(cell); cell = '' }
      else if (c === '\r') { /* skip */ }
      else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = '' }
      else cell += c
    }
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row) }
  return rows
}
const rows = parseCSV(text).filter(r => r.length > 1)
const header = rows[0]
const idx = Object.fromEntries(header.map((h, i) => [h.trim(), i]))
const data = rows.slice(1)

const csvAppraisers = new Map() // normalized-name -> {display, count}
for (const r of data) {
  const raw = (r[idx.appraiser] ?? '').trim()
  if (!raw || raw.toLowerCase() === 'modern appraisers') continue
  const key = raw.toLowerCase()
  const entry = csvAppraisers.get(key) ?? { display: raw, count: 0 }
  entry.count++
  csvAppraisers.set(key, entry)
}

// --- fetch profiles ---
const { data: profiles, error } = await sb
  .from('profiles')
  .select('id, name, email, is_active, role')
  .order('name')
if (error) { console.error('fetch profiles failed:', error.message); process.exit(1) }

console.log(`\n=== All profiles (${profiles.length}) ===`)
for (const p of profiles) {
  console.log(`  ${p.is_active ? 'A' : ' '} ${p.role?.padEnd(10) ?? '          '}  ${(p.name ?? '(no name)').padEnd(30)}  ${p.email ?? ''}  id=${p.id}`)
}

console.log(`\n=== CSV appraiser -> profile matches ===`)
const unmatched = []
for (const [key, { display, count }] of [...csvAppraisers.entries()].sort()) {
  const hit = profiles.find(p => (p.name ?? '').trim().toLowerCase() === key)
  if (hit) {
    console.log(`  OK   [${count.toString().padStart(3)}x]  "${display}" -> profile ${hit.id}  active=${hit.is_active}  role=${hit.role}`)
  } else {
    console.log(`  MISS [${count.toString().padStart(3)}x]  "${display}"  <-- NO PROFILE MATCH`)
    unmatched.push({ display, count })
  }
}

if (unmatched.length) {
  console.log(`\n${unmatched.length} unmatched CSV appraiser names. These claims will be imported as UNASSIGNED unless we fix the profile name or the CSV.`)
} else {
  console.log(`\nAll ${csvAppraisers.size} non-blank CSV appraisers match a profile.`)
}
