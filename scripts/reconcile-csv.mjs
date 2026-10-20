// Reconcile an external claims CSV against HAMS acv_history.
// Usage:
//   node scripts/reconcile-csv.mjs <csv-path>            # dry-run, prints plan
//   node scripts/reconcile-csv.mjs <csv-path> --commit   # applies updates
//
// Writes:
//   - Fills HAMS claim.clientName / claim.insuranceCompany from CSV `insurance`
//     when the HAMS field is empty.
//   - Maps CSV `ass_type` → HAMS claim.claimTypes:
//       "Diminished Value" → ['dv']
//       "Estimate Review"  → ['estimate']
//       "Auto"             → ['acv']
//       "Other"            → ['other']
//     Only overwrites claim.claimTypes if the current HAMS value is empty OR
//     is a single, DIFFERENT type (so a human-curated multi-type array like
//     ['acv','dv'] is never clobbered — flagged for review instead).
//
// Reports (never writes):
//   - CSV MA#s with no HAMS match
//   - HAMS open claims with no CSV match
//   - phase differences (CSV phase vs HAMS status_phase or workflow_stage)

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
const csvPath = process.argv.find((a, i) => i >= 2 && !a.startsWith('--'))
if (!csvPath) {
  console.error('Usage: node scripts/reconcile-csv.mjs <csv-path> [--commit]')
  process.exit(1)
}
const db = createClient(url, key, { auth: { persistSession: false } })

// ─────────────── CSV parsing ───────────────
function parseCsv(text) {
  // Hand-rolled RFC-4180 parser (quoted fields, escaped quotes, embedded newlines).
  const rows = []
  let field = ''
  let row = []
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    const next = text[i + 1]
    if (inQuotes) {
      if (c === '"' && next === '"') { field += '"'; i++; continue }
      if (c === '"') { inQuotes = false; continue }
      field += c
      continue
    }
    if (c === '"') { inQuotes = true; continue }
    if (c === ',') { row.push(field); field = ''; continue }
    if (c === '\n' || c === '\r') {
      if (c === '\r' && next === '\n') i++
      row.push(field); rows.push(row)
      field = ''; row = []
      continue
    }
    field += c
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  return rows.filter(r => r.length > 1 || (r.length === 1 && r[0].length > 0))
}

const csvText = readFileSync(csvPath, 'utf8')
const csvRows = parseCsv(csvText)
const header = csvRows.shift()
const col = (name) => header.indexOf(name)

const C_ASSIGN = col('assignment_id')
const C_INS = col('insurance')
const C_ASS_TYPE = col('ass_type')
const C_PHASE = col('phase')
const C_OWNER_FIRST = col('owner_first_name')
const C_OWNER_LAST = col('owner_last_name')
const C_CLAIM_NUM = col('claim_number')
const C_VIN = col('v_vin')
const C_SUB_STATUS = col('sub_status')  // appears to be: Invoiced / Pending
const C_STATUS = col('status')          // appears to be: Yes/No for closed?

function assTypeToClaimTypes(assType) {
  const t = (assType || '').trim().toLowerCase()
  if (!t) return null
  if (t === 'diminished value' || t === 'dv' || t === 'diminished-value') return ['dv']
  if (t === 'estimate review' || t === 'est' || t === 'estimate' || t === 'estimate dispute') return ['estimate']
  if (t === 'auto' || t === 'acv') return ['acv']
  if (t === 'other') return ['other']
  if (t === 'specialty') return ['specialty']
  if (t === 'salvage') return ['salvage']
  if (t === 'umpire') return ['umpire']
  if (t === 'full') return ['full']
  if (t === 'desk' || t === 'desk review') return ['desk']
  if (t === 'lou' || t === 'loss of use') return ['lou']
  if (t === 'storage') return ['storage']
  return null  // unrecognized — leave alone, flag
}

function phaseFromCsvPhase(csvPhase) {
  const p = (csvPhase || '').trim().toLowerCase()
  if (!p) return null
  if (p === 'pending payment') return { kind: 'workflow_stage', value: 'payment' }  // archived in HAMS
  if (p === 'hold') return { kind: 'status_phase', value: 'hold' }
  if (p === 'umpire ruling' || p === 'umpire') return { kind: 'status_phase', value: 'umpire' }
  if (p === 'court appointed umpire') return { kind: 'status_phase', value: 'court_umpire' }
  if (p === 'rush') return { kind: 'status_phase', value: 'rush' }
  if (p === 'dv response') return { kind: 'status_phase', value: 'dv_response' }
  if (p === 'pending repairs') return { kind: 'status_phase', value: 'pending_repairs' }
  if (p === 'pending information') return { kind: 'status_phase', value: 'pending_information' }
  if (p === 'rough numbers') return { kind: 'status_phase', value: 'rough_numbers' }
  return { kind: 'unknown', value: csvPhase }
}

// ─────────────── Build CSV index ───────────────
const csvByMa = new Map()
for (const r of csvRows) {
  const ma = (r[C_ASSIGN] || '').trim()
  if (!ma) continue
  csvByMa.set(ma, {
    maNumber: ma,
    insurance: (r[C_INS] || '').trim(),
    assType: (r[C_ASS_TYPE] || '').trim(),
    phase: (r[C_PHASE] || '').trim(),
    ownerFirst: (r[C_OWNER_FIRST] || '').trim(),
    ownerLast: (r[C_OWNER_LAST] || '').trim(),
    claimNumber: (r[C_CLAIM_NUM] || '').trim(),
    vin: (r[C_VIN] || '').trim(),
    subStatus: (r[C_SUB_STATUS] || '').trim(),
    status: (r[C_STATUS] || '').trim(),
  })
}
console.log(`\nCSV rows: ${csvByMa.size}`)

// ─────────────── Fetch HAMS claims ───────────────
console.log('Fetching HAMS acv_history...')
const { data: hamsRows, error: fetchErr } = await db
  .from('acv_history')
  .select('id, ma_number, claim, status, status_phase, workflow_stage')
if (fetchErr) { console.error('fetch failed:', fetchErr); process.exit(1) }
console.log(`HAMS rows: ${hamsRows.length}`)

const hamsByMa = new Map()
for (const r of hamsRows) {
  if (r.ma_number) hamsByMa.set(String(r.ma_number), r)
}

// ─────────────── Reconcile ───────────────
const findings = {
  csvNotInHams: [],              // CSV MA#s with no HAMS match (deleted / out of scope)
  hamsOpenNotInCsv: [],          // HAMS open claims not in CSV (would-be-missing)
  fillClientName: [],            // HAMS claim.clientName empty, CSV has one → fill
  fillInsuranceCompany: [],      // HAMS claim.insuranceCompany empty, CSV has one → fill
  claimTypesUpdate: [],          // ass_type disagrees with HAMS claimTypes
  claimTypesSkipMulti: [],       // HAMS already has multiple types — don't clobber, flag
  claimTypesUnknownAssType: [],  // CSV ass_type not recognized
  phaseMismatch: [],             // phase differs between CSV and HAMS
  phaseUnmapped: [],             // CSV phase doesn't map to a known HAMS phase
  closedMismatch: [],            // CSV subStatus/status suggests closed but HAMS says open (or vice versa)
}

const updates = []  // { id, patch, reasons: [] }

for (const [ma, csv] of csvByMa) {
  const hams = hamsByMa.get(ma)
  if (!hams) { findings.csvNotInHams.push(csv); continue }
  const claim = hams.claim ?? {}
  const currentTypes = Array.isArray(claim.claimTypes) ? claim.claimTypes : []
  const nextTypesFromAssType = assTypeToClaimTypes(csv.assType)
  const patch = { claim: { ...claim } }
  const reasons = []
  let dirty = false

  // Fill clientName if empty.
  if ((!claim.clientName || !claim.clientName.trim()) && csv.insurance) {
    patch.claim.clientName = csv.insurance
    reasons.push(`clientName := "${csv.insurance}"`)
    findings.fillClientName.push({ maNumber: ma, id: hams.id, from: 'empty', to: csv.insurance })
    dirty = true
  }

  // Fill insuranceCompany if empty.
  if ((!claim.insuranceCompany || !claim.insuranceCompany.trim()) && csv.insurance) {
    patch.claim.insuranceCompany = csv.insurance
    reasons.push(`insuranceCompany := "${csv.insurance}"`)
    findings.fillInsuranceCompany.push({ maNumber: ma, id: hams.id, from: 'empty', to: csv.insurance })
    dirty = true
  }

  // Claim type reconciliation.
  if (nextTypesFromAssType) {
    if (currentTypes.length === 0) {
      // No types set at all — adopt.
      patch.claim.claimTypes = nextTypesFromAssType
      reasons.push(`claimTypes := [${nextTypesFromAssType.join(',')}] (CSV says "${csv.assType}", HAMS empty)`)
      findings.claimTypesUpdate.push({ maNumber: ma, id: hams.id, from: [], to: nextTypesFromAssType, csvAssType: csv.assType })
      dirty = true
    } else if (currentTypes.length === 1 && !currentTypes.includes(nextTypesFromAssType[0])) {
      // Single different type — adopt CSV's value (Henry's "if the claim says Sedgwick Est, change the claim type to estimate dispute" rule).
      patch.claim.claimTypes = nextTypesFromAssType
      reasons.push(`claimTypes := [${nextTypesFromAssType.join(',')}] (was [${currentTypes.join(',')}], CSV says "${csv.assType}")`)
      findings.claimTypesUpdate.push({ maNumber: ma, id: hams.id, from: currentTypes, to: nextTypesFromAssType, csvAssType: csv.assType })
      dirty = true
    } else if (currentTypes.length > 1) {
      // Multi-type array — don't clobber. Flag if CSV's single type isn't among them.
      if (!currentTypes.includes(nextTypesFromAssType[0])) {
        findings.claimTypesSkipMulti.push({ maNumber: ma, id: hams.id, hamsTypes: currentTypes, csvAssType: csv.assType, csvSuggests: nextTypesFromAssType })
      }
    }
    // else: single type and matches → no-op.
  } else if (csv.assType) {
    findings.claimTypesUnknownAssType.push({ maNumber: ma, id: hams.id, assType: csv.assType })
  }

  // Phase comparison (never auto-write — only report).
  const csvPhase = phaseFromCsvPhase(csv.phase)
  const hamsStatusPhase = hams.status_phase ?? null
  const hamsWorkflowStage = hams.workflow_stage ?? 'main'
  if (csvPhase) {
    if (csvPhase.kind === 'unknown') {
      findings.phaseUnmapped.push({ maNumber: ma, id: hams.id, csvPhase: csv.phase })
    } else if (csvPhase.kind === 'status_phase') {
      if (hamsStatusPhase !== csvPhase.value) {
        findings.phaseMismatch.push({ maNumber: ma, id: hams.id, csvPhase: csv.phase, csvMapped: csvPhase.value, hamsStatusPhase, hamsWorkflowStage })
      }
    } else if (csvPhase.kind === 'workflow_stage') {
      if (hamsWorkflowStage !== csvPhase.value) {
        findings.phaseMismatch.push({ maNumber: ma, id: hams.id, csvPhase: csv.phase, csvMapped: `workflow:${csvPhase.value}`, hamsStatusPhase, hamsWorkflowStage })
      }
    }
  }

  // Closed state cross-check: CSV status='Yes' usually means closed/done.
  const csvSaysClosed = csv.status.toLowerCase() === 'yes'
  if (csvSaysClosed && hams.status !== 'closed') {
    findings.closedMismatch.push({ maNumber: ma, id: hams.id, csvStatus: csv.status, csvSubStatus: csv.subStatus, hamsStatus: hams.status })
  }

  if (dirty) updates.push({ id: hams.id, maNumber: ma, patch, reasons })
}

// HAMS open claims not in CSV. Only "open" rows — closed claims shouldn't still show up in a working CSV.
for (const r of hamsRows) {
  if (r.status !== 'open') continue
  const ma = r.ma_number ? String(r.ma_number) : null
  if (!ma) continue
  if (!csvByMa.has(ma)) {
    findings.hamsOpenNotInCsv.push({ id: r.id, maNumber: ma, insuredName: r.claim?.insuredName ?? null, workflowStage: r.workflow_stage, statusPhase: r.status_phase })
  }
}

// ─────────────── Report ───────────────
function section(title, items, cap = 15) {
  console.log(`\n── ${title} (${items.length}) ──`)
  if (!items.length) { console.log('  (none)'); return }
  for (const item of items.slice(0, cap)) console.log('  ', JSON.stringify(item))
  if (items.length > cap) console.log(`  … and ${items.length - cap} more`)
}

console.log(`\n=== ${commit ? 'COMMIT' : 'DRY RUN'} ===`)
console.log(`\nUpdates to apply: ${updates.length}`)

section('CSV MA#s with no HAMS match', findings.csvNotInHams.map(c => `${c.maNumber}  owner="${c.ownerFirst} ${c.ownerLast}"  claim#=${c.claimNumber}  ins="${c.insurance}"`))
section('HAMS open claims not in CSV', findings.hamsOpenNotInCsv.map(h => `${h.maNumber}  insured="${h.insuredName}"  stage=${h.workflowStage}  phase=${h.statusPhase}`))
section('Fill clientName (empty → CSV value)', findings.fillClientName.map(f => `${f.maNumber}  → "${f.to}"`))
section('Fill insuranceCompany (empty → CSV value)', findings.fillInsuranceCompany.map(f => `${f.maNumber}  → "${f.to}"`))
section('Claim type updates', findings.claimTypesUpdate.map(c => `${c.maNumber}  [${c.from.join(',')}] → [${c.to.join(',')}]  (CSV "${c.csvAssType}")`))
section('Claim type SKIP (HAMS has multi-type, review manually)', findings.claimTypesSkipMulti.map(c => `${c.maNumber}  HAMS=[${c.hamsTypes.join(',')}]  CSV="${c.csvAssType}" → [${c.csvSuggests.join(',')}]`))
section('Unknown CSV ass_type (not translated)', findings.claimTypesUnknownAssType.map(c => `${c.maNumber}  ass_type="${c.assType}"`))
section('Phase mismatches (reported, NOT updated)', findings.phaseMismatch.map(p => `${p.maNumber}  CSV="${p.csvPhase}" (→${p.csvMapped})  HAMS: status_phase=${p.hamsStatusPhase} workflow=${p.hamsWorkflowStage}`), 50)
section('CSV phases that don\'t map to HAMS', findings.phaseUnmapped.map(p => `${p.maNumber}  phase="${p.csvPhase}"`))
section('CSV says closed but HAMS says open', findings.closedMismatch.map(c => `${c.maNumber}  CSV status=${c.csvStatus} sub=${c.csvSubStatus}  HAMS=${c.hamsStatus}`), 50)

const outPath = resolve(__dirname, '..', 'csv-reconcile-report.json')
writeFileSync(outPath, JSON.stringify({
  mode: commit ? 'commit' : 'dry-run',
  csvRows: csvByMa.size,
  hamsRows: hamsRows.length,
  plannedUpdates: updates.length,
  findings,
  updates: updates.map(u => ({ id: u.id, maNumber: u.maNumber, reasons: u.reasons })),
}, null, 2))
console.log(`\nFull report: ${outPath}`)

if (!commit) {
  console.log('\nDry-run complete. Re-run with --commit to apply the updates listed above.')
  process.exit(0)
}

// Commit mode.
let written = 0
let failed = 0
for (const u of updates) {
  const { error } = await db.from('acv_history').update({ claim: u.patch.claim }).eq('id', u.id)
  if (error) {
    failed++
    console.error(`  update failed for id=${u.id} (MA# ${u.maNumber}): ${error.message}`)
    continue
  }
  written++
  if (written % 25 === 0) console.log(`  … ${written}/${updates.length}`)
}
console.log(`\n✓ Wrote ${written} rows (${failed} failed).`)
