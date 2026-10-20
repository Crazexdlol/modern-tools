// Reconcile Henry's working list against the 5 Completed_Assignments CSV
// exports. Rules Henry gave:
//   - Disregard CSV rows whose business_name contains "Crawford" (any form).
//   - Disregard business_name containing "field", "desk", "subro" (CI).
//   - Disregard business_name === "SEDGWICK EST" (specifically EST, not ACV / DV).
//   - Rows that survive the filter are "due" claims.
//   - Sedgwick ACV and Sedgwick DV should appear TWICE in Henry's list — once
//     for the appraiser assignment, once for the negotiated line. Flag if 0 or 1.
//   - All other surviving CSV rows should appear at least once. Flag if 0.
//
// Usage: node scripts/reconcile-completed.mjs

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ─── CSV parser (RFC-4180, quoted + escaped quotes) ───
function parseCsv(text) {
  const rows = []
  let field = ''
  let row = []
  let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1]
    if (q) {
      if (c === '"' && n === '"') { field += '"'; i++; continue }
      if (c === '"') { q = false; continue }
      field += c
      continue
    }
    if (c === '"') { q = true; continue }
    if (c === ',') { row.push(field); field = ''; continue }
    if (c === '\n' || c === '\r') {
      if (c === '\r' && n === '\n') i++
      row.push(field); rows.push(row); field = ''; row = []
      continue
    }
    field += c
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  return rows.filter(r => r.length > 1 || (r.length === 1 && r[0].length > 0))
}

// ─── Load Henry's list ───
const listText = readFileSync(resolve(__dirname, 'henry-list.txt'), 'utf8')
// Extract 7-digit assignment ids from each non-empty line (ignore suffixes
// like "-Arthur", "(negociated)", "(negotiated)", 555xxx entries, etc.).
// Count occurrences — a Sedgwick ACV/DV should show up twice (bare + negotiated).
const listCount = new Map()
let listSeen = 0
for (const raw of listText.split(/\r?\n/)) {
  const line = raw.trim()
  if (!line) continue
  // Extract the first 7-digit number from the line (MA#s are 7 digits in the 36xx/37xx/38xx/39xx range).
  const m = line.match(/\b(\d{7})\b/)
  if (!m) continue
  listSeen++
  const ma = m[1]
  listCount.set(ma, (listCount.get(ma) ?? 0) + 1)
}
console.log(`Henry's list: ${listSeen} rows with a 7-digit MA#, ${listCount.size} unique MA#s.\n`)

// ─── Load all 5 CSVs ───
const uploadsDir = 'C:/Users/Owner/.claude/uploads/f5c3787d-a974-4156-9856-00bf0ad4a28e'
const csvFiles = readdirSync(uploadsDir)
  .filter(f => /^.*Completed_Assignments.*\.csv$/.test(f))
  .map(f => `${uploadsDir}/${f}`)
console.log(`CSV files found: ${csvFiles.length}`)
for (const f of csvFiles) console.log('  ' + f.split('/').pop())
console.log()

// ─── Collect CSV rows (dedup across the 5 files by assignment_id — last file wins) ───
const csvRows = new Map()  // ma -> { ma, insurance, business, state, owner, dateCompleted, sourceFile }
for (const path of csvFiles) {
  const text = readFileSync(path, 'utf8')
  const rows = parseCsv(text)
  const header = rows.shift()
  const col = (n) => header.indexOf(n)
  const C_INS = col('insurance')
  const C_BIZ = col('business_name')
  const C_MA = col('assignment_id')
  const C_STATE = col('v_state')
  const C_OF = col('owner_first_name')
  const C_OL = col('owner_last_name')
  const C_DT = col('date_completed')
  for (const r of rows) {
    const ma = (r[C_MA] || '').trim()
    if (!ma) continue
    csvRows.set(ma, {
      ma,
      insurance: (r[C_INS] || '').trim(),
      business: (r[C_BIZ] || '').trim(),
      state: (r[C_STATE] || '').trim(),
      owner: `${(r[C_OF] || '').trim()} ${(r[C_OL] || '').trim()}`.trim(),
      dateCompleted: (r[C_DT] || '').trim(),
      sourceFile: path.split('/').pop(),
    })
  }
}
console.log(`Total unique CSV rows across all 5 files: ${csvRows.size}\n`)

// ─── Filter per Henry's rules ───
// Crawford check needs to inspect BOTH business_name AND insurance: several
// CSV rows have an empty business_name but insurance="Crawford and Company
// - Something" (3908293 Joshua Giron, 3931949 Laura Henderson, etc.).
function isCrawford(r) {
  return /crawford/i.test(r.business) || /crawford/i.test(r.insurance)
}
function isFieldDeskSubro(biz) {
  return /\b(field|desk|subro)\b/i.test(biz)
}
function isSedgwickEstOnly(biz) {
  // Specifically "Sedgwick EST" — NOT "SEDGWICK ACV" or "SEDGWICK DV".
  // Trim trailing space (CSV has "SEDGWICK EST ").
  const t = biz.trim().toUpperCase()
  return t === 'SEDGWICK EST'
}

const filterStats = { total: 0, crawford: 0, fieldDeskSubro: 0, sedgwickEst: 0, kept: 0 }
const kept = []
for (const r of csvRows.values()) {
  filterStats.total++
  if (isCrawford(r)) { filterStats.crawford++; continue }
  if (isFieldDeskSubro(r.business)) { filterStats.fieldDeskSubro++; continue }
  if (isSedgwickEstOnly(r.business)) { filterStats.sedgwickEst++; continue }
  kept.push(r)
  filterStats.kept++
}
console.log('Filter stats:')
console.log('  total     : ' + filterStats.total)
console.log('  Crawford  : ' + filterStats.crawford)
console.log('  field/desk/subro: ' + filterStats.fieldDeskSubro)
console.log('  Sedgwick EST only: ' + filterStats.sedgwickEst)
console.log('  kept      : ' + filterStats.kept)
console.log()

// ─── Classify kept rows and compare to Henry's list ───
function isSedgwickAcvOrDv(biz) {
  const t = biz.trim().toUpperCase()
  return t === 'SEDGWICK ACV' || t === 'SEDGWICK DV'
}

const missing = []        // in CSV, 0 in list
const underCountedACVDV = []  // Sedgwick ACV/DV in CSV, found once in list (needs 2)
const inListButNotCsv = [] // the reverse — in Henry's list but not in CSV
const found = []           // present enough times

for (const r of kept) {
  const count = listCount.get(r.ma) ?? 0
  const needsTwo = isSedgwickAcvOrDv(r.business)
  if (count === 0) {
    missing.push(r)
  } else if (needsTwo && count < 2) {
    underCountedACVDV.push({ ...r, listCount: count })
  } else {
    found.push({ ...r, listCount: count })
  }
}

// Reverse: Henry's list has MA# not in the filtered CSV set
const csvMaSet = new Set(kept.map(r => r.ma))
for (const [ma, count] of listCount) {
  if (!csvMaSet.has(ma)) {
    // Only report if it was in the raw CSV but filtered out, OR not in CSV at all.
    const rawRow = csvRows.get(ma)
    inListButNotCsv.push({ ma, count, rawBusiness: rawRow?.business || '(not in any CSV)', rawInsurance: rawRow?.insurance || '' })
  }
}

// ─── Report ───
function printList(title, items, fmt) {
  console.log(`\n═══ ${title} (${items.length}) ═══`)
  if (!items.length) { console.log('  (none)'); return }
  for (const item of items) console.log('  ' + fmt(item))
}

printList('Missing from Henry\'s list (in filtered CSV, 0 in list)',
  missing.sort((a, b) => a.ma.localeCompare(b.ma)),
  r => `MA ${r.ma} · ${r.business.padEnd(32)} · ${r.insurance.padEnd(30)} · ${r.owner.padEnd(28)} · completed ${r.dateCompleted}`)

printList('Sedgwick ACV/DV present only ONCE in Henry\'s list (needs 2)',
  underCountedACVDV.sort((a, b) => a.ma.localeCompare(b.ma)),
  r => `MA ${r.ma} · ${r.business.padEnd(16)} · listCount=${r.listCount} · ${r.owner.padEnd(28)} · completed ${r.dateCompleted}`)

// Henry asked only for CSV-vs-list; the reverse direction is optional context.
console.log(`\nFYI — MA#s in Henry\'s list but NOT in the filtered CSV set: ${inListButNotCsv.length}`)
console.log('(These are either filtered-out Crawford/field/desk/subro/Sedgwick-EST rows that Henry still tracked, 555xxx placeholders, or claims not yet in the Completed exports.)\n')

// Write a JSON audit next to the script for Henry to crack open.
const outPath = resolve(__dirname, '..', 'completed-reconcile-report.json')
writeFileSync(outPath, JSON.stringify({
  summary: {
    listRows: listSeen,
    uniqueListMa: listCount.size,
    totalCsvRows: csvRows.size,
    kept: kept.length,
    filteredOut: { crawford: filterStats.crawford, fieldDeskSubro: filterStats.fieldDeskSubro, sedgwickEstOnly: filterStats.sedgwickEst },
    missing: missing.length,
    underCountedACVDV: underCountedACVDV.length,
    inListButNotCsv: inListButNotCsv.length,
  },
  missing: missing.sort((a, b) => a.ma.localeCompare(b.ma)),
  underCountedACVDV: underCountedACVDV.sort((a, b) => a.ma.localeCompare(b.ma)),
  inListButNotCsv: inListButNotCsv.sort((a, b) => a.ma.localeCompare(b.ma)),
}, null, 2))
console.log(`Full report: ${outPath}`)
