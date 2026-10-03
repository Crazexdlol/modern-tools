// Scan every open + closed claim's reports_state.notesData.{appraiserName,
// appraiserCompany} and build a de-duplicated list of opposing appraisers
// for the opposing_appraisers table. Fuzzy-dedupes by normalized name +
// company. Flags odd / partial / possible-duplicate entries for Henry's
// review BEFORE inserting anything.
//
// Usage:
//   node scripts/backfill-opposing-appraisers.mjs            # dry-run, prints plan
//   node scripts/backfill-opposing-appraisers.mjs --commit   # inserts after review
//
// Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// --- env loading (same pattern as apply-dashboard-and-phase-updates.mjs) ---
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

// --- normalization + fuzzy matching helpers ---
function normalize(str) {
  return (str || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s&.-]/g, '')
    .toLowerCase()
}

// Levenshtein distance. Returns # of single-char edits between two strings.
function lev(a, b) {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const dp = Array(b.length + 1).fill(0).map((_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= b.length; j++) {
      const temp = dp[j]
      dp[j] = a[i - 1] === b[j - 1]
        ? prev
        : 1 + Math.min(prev, dp[j], dp[j - 1])
      prev = temp
    }
  }
  return dp[b.length]
}

// Similarity: 1 - (lev / max(len)). 1.0 = identical, 0.0 = no overlap.
function sim(a, b) {
  const an = normalize(a)
  const bn = normalize(b)
  if (!an && !bn) return 1
  if (!an || !bn) return 0
  const max = Math.max(an.length, bn.length)
  return 1 - lev(an, bn) / max
}

// Two OAs are the "same person" if:
//   - name similarity >= 0.85 (tolerates minor typos / extra spaces)
//   - AND company similarity >= 0.75 OR one company is empty
// Henry's rule: "Two different people at the same company stay separate contacts."
// So we always require some name match. We never merge on company alone.
function isSamePerson(a, b) {
  if (sim(a.name, b.name) < 0.85) return false
  const aCo = normalize(a.company)
  const bCo = normalize(b.company)
  if (!aCo || !bCo) return true // one side missing company — assume same person
  return sim(a.company, b.company) >= 0.75
}

// Heuristics for "odd-looking" entries that should go in the review pile.
const BAD_NAME_PATTERNS = [
  /^n\/?a$/i,
  /^unknown$/i,
  /^none$/i,
  /^tbd$/i,
  /^test$/i,
  /^xxx$/i,
  /^-+$/,
]
function isOddName(name) {
  const n = (name || '').trim()
  if (!n) return 'empty'
  if (n.length < 2) return 'too-short'
  if (BAD_NAME_PATTERNS.some(re => re.test(n))) return 'placeholder'
  if (!/^[a-z]/i.test(n)) return 'non-letter-start'
  if (!/\s/.test(n)) return 'single-word'  // probably just first name
  return null
}

// --- main ---
async function main() {
  console.log(commit ? '\n=== COMMIT MODE ===\n' : '\n=== DRY RUN (no inserts) ===\n')

  // 1. Pull every claim's OA fields.
  const { data: rows, error } = await db
    .from('acv_history')
    .select('id, reports_state')
    .not('reports_state', 'is', null)
  if (error) { console.error('fetch failed:', error); process.exit(1) }

  const raw = []
  for (const r of rows) {
    const n = r.reports_state?.notesData?.appraiserName || ''
    const c = r.reports_state?.notesData?.appraiserCompany || ''
    if (!n && !c) continue
    raw.push({ claimId: r.id, name: n.trim(), company: c.trim() })
  }
  console.log(`Scanned ${rows.length} claims, found ${raw.length} with OA data.`)

  // 2. Group into clusters by isSamePerson.
  const clusters = []
  for (const entry of raw) {
    const match = clusters.find(c => isSamePerson(c.canonical, entry))
    if (match) {
      match.entries.push(entry)
    } else {
      clusters.push({ canonical: { name: entry.name, company: entry.company }, entries: [entry] })
    }
  }
  console.log(`Produced ${clusters.length} unique OA clusters.\n`)

  // 3. Flag review items.
  const flags = {
    odd: [],         // name looks weird
    partial: [],     // missing name OR company
    sameNameDiffCo: [], // same name across clusters but different company — Henry must decide
  }

  for (const cl of clusters) {
    const n = cl.canonical.name
    const c = cl.canonical.company
    const oddReason = isOddName(n)
    if (oddReason) flags.odd.push({ reason: oddReason, canonical: cl.canonical, claims: cl.entries.map(e => e.claimId) })
    if (!n || !c) flags.partial.push({ canonical: cl.canonical, claims: cl.entries.map(e => e.claimId) })
  }

  // Cross-cluster: same name (sim>=0.85) across clusters with DIFFERENT companies.
  for (let i = 0; i < clusters.length; i++) {
    for (let j = i + 1; j < clusters.length; j++) {
      const a = clusters[i].canonical, b = clusters[j].canonical
      if (sim(a.name, b.name) >= 0.85 && sim(a.company, b.company) < 0.5) {
        flags.sameNameDiffCo.push({ a, b })
      }
    }
  }

  // 4. Print review summary.
  const print = (list, label) => {
    if (!list.length) return
    console.log(`--- ${label} (${list.length}) ---`)
    for (const item of list.slice(0, 25)) {
      if (item.a && item.b) {
        console.log(`  "${item.a.name}" @ "${item.a.company}" vs "${item.b.name}" @ "${item.b.company}"`)
      } else {
        console.log(`  ${item.reason ? `[${item.reason}] ` : ''}"${item.canonical.name}" @ "${item.canonical.company || '(no company)'}" — ${item.claims.length} claim(s)`)
      }
    }
    if (list.length > 25) console.log(`  ... and ${list.length - 25} more`)
    console.log()
  }
  print(flags.odd, 'ODD-LOOKING NAMES (likely garbage — review before inserting)')
  print(flags.partial, 'PARTIAL ENTRIES (name OR company missing)')
  print(flags.sameNameDiffCo, 'SAME NAME, DIFFERENT COMPANY (Henry must decide: merge or keep separate)')

  // 5. Write the full plan to a JSON file for inspection.
  const outPath = resolve(__dirname, '..', 'oa-backfill-plan.json')
  writeFileSync(outPath, JSON.stringify({
    totalClaimsScanned: rows.length,
    claimsWithOaData: raw.length,
    uniqueClusters: clusters.length,
    flags,
    clusters: clusters.map(c => ({
      canonical: c.canonical,
      claimIds: c.entries.map(e => e.claimId),
      variants: Array.from(new Set(c.entries.map(e => `${e.name}|${e.company}`))),
    })),
  }, null, 2))
  console.log(`Full plan written to: ${outPath}`)
  console.log(`\nTotal clusters that would be inserted: ${clusters.length}`)
  console.log(`  - ${clusters.length - flags.odd.length - flags.partial.length} look clean`)
  console.log(`  - ${flags.odd.length} flagged odd`)
  console.log(`  - ${flags.partial.length} flagged partial`)

  if (!commit) {
    console.log('\nDry-run complete. Review the flags + oa-backfill-plan.json.')
    console.log('Re-run with --commit to insert (odd + partial entries will be SKIPPED).')
    return
  }

  // 6. COMMIT: insert the clean clusters.
  const toInsert = clusters
    .filter(c => !isOddName(c.canonical.name) && c.canonical.name && c.canonical.company)
    .map(c => ({
      name: c.canonical.name,
      company: c.canonical.company || null,
    }))

  console.log(`\nInserting ${toInsert.length} rows (odd + partial skipped)...`)
  // Insert in batches of 100.
  for (let i = 0; i < toInsert.length; i += 100) {
    const batch = toInsert.slice(i, i + 100)
    const { error: insErr } = await db
      .from('opposing_appraisers')
      .insert(batch)
    if (insErr) {
      console.error(`batch insert failed at offset ${i}:`, insErr.message)
      process.exit(1)
    }
  }
  console.log(`✓ Inserted ${toInsert.length} opposing appraisers.`)
}

main().catch((e) => { console.error(e); process.exit(1) })
