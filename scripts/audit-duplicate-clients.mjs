// Audits the marketing `clients` table for duplicate real-world clients
// hiding under slightly-different spellings ("Allstate" vs "Allstate Ins.
// Co."). Mirrors src/lib/company-match.ts normalizeCompanyName() so a
// Settlement-Analytics match === an audit match.
//
// Usage: node scripts/audit-duplicate-clients.mjs

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dirname, '..', '.env.local')
const envText = readFileSync(envPath, 'utf8')
const env = Object.fromEntries(
  envText.split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .map(line => {
      const eq = line.indexOf('=')
      return [line.slice(0, eq), line.slice(eq + 1).replace(/^"|"$/g, '')]
    }),
)

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const NOISE_WORDS = new Set(['insurance', 'ins', 'company', 'companies', 'co', 'corp', 'corporation', 'inc', 'incorporated', 'llc', 'ltd', 'limited', 'group', 'holdings', 'the'])

function normalize(raw) {
  if (!raw) return ''
  const cleaned = raw.toLowerCase().replace(/[.,/&()]+/g, ' ').replace(/\s+/g, ' ').trim()
  return cleaned.split(' ').filter(w => w && !NOISE_WORDS.has(w)).join(' ')
}

const { data: clients, error } = await sb
  .from('clients')
  .select('id, name, type, archived_at')
  .is('archived_at', null)
  .order('name', { ascending: true })
if (error) { console.error('fetch failed:', error.message); process.exit(1) }

const buckets = new Map()
for (const c of clients) {
  const key = normalize(c.name)
  if (!key) continue
  const arr = buckets.get(key) ?? []
  arr.push(c)
  buckets.set(key, arr)
}

const dupes = Array.from(buckets.entries()).filter(([, arr]) => arr.length > 1)
if (dupes.length === 0) {
  console.log(`No duplicates found across ${clients.length} active clients.`)
  process.exit(0)
}

console.log(`\nFound ${dupes.length} apparent duplicate group(s) across ${clients.length} active clients:\n`)
for (const [key, arr] of dupes.sort((a, b) => b[1].length - a[1].length)) {
  console.log(`• [${key}] — ${arr.length} rows:`)
  for (const c of arr) {
    console.log(`    ${c.id}   type=${c.type.padEnd(18)}   name="${c.name}"`)
  }
  console.log('')
}

// Also check across types in case a client is filed under both Insurance Company
// and Attorney by mistake (less common, but shows up occasionally).
const insuranceClients = clients.filter(c => c.type === 'insurance_company')
console.log(`\n(Scope: all active clients, any type. Insurance-company subset = ${insuranceClients.length} rows.)`)
