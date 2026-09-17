// scripts/sync-claims-from-csv.mjs
//
// One-time CSV → HamsPortal claim book sync.
// Spec: docs/superpowers/specs/2026-09-11-csv-sync-and-handling-appraiser-list-design.md
//
// Usage:
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/sync-claims-from-csv.mjs <csv-path>
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/sync-claims-from-csv.mjs <csv-path> --apply
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/sync-claims-from-csv.mjs <csv-path> --apply --confirm-closes=N
//
// Behaviour:
//  - Default (no --apply): prints the plan, writes nothing.
//  - --apply: executes each planned action against Supabase via service role.
//  - If planned CLOSE count > 40, --apply refuses unless --confirm-closes=<count> matches.
//
// Matching key: acv_history.claim->>'maNumber' == csv.assignment_id (raw digits).
// HamsPortal rows whose maNumber is empty or non-digit are SKIPPED (test/demo/legacy).
//
// Never touches: comps, adjustments, result, estimate, auction_listings,
// documents, dv, invoice, reports_state, mileage_rate, summaries, storage.

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

// ── config ───────────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://ektglhdstobaipdqssjx.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const CLOSE_SAFETY_GATE = 40

const FABIAN_PROFILE = {
  name: 'Fabian Barahona',
  email: 'fabian.barahona.placeholder@modernappraisers.com',
  role: 'appraiser',
}

// CSV phase label → HamsPortal status_phase code. Both are compared lower-cased.
const CSV_PHASE_MAP = {
  'pending payment': 'pending_payment',
  'umpire ruling':   'umpire',
  'hold':            'hold',
  'dv response':     'dv_response',   // bootstrapped below if missing
  'rush':            'rush',
}

// Admin ID used as user_id on NEW acv_history rows created by this script.
// Henry (henry@modernappraisers.com).
const CREATOR_USER_ID = 'd968ce49-dc3e-4a72-b8ae-5bc7019d97ca'

// ── CLI ──────────────────────────────────────────────────────────────────────
const [, , csvArg, ...flags] = process.argv
if (!csvArg) {
  console.error('usage: node sync-claims-from-csv.mjs <csv-path> [--apply] [--confirm-closes=N]')
  process.exit(1)
}
if (!SERVICE_KEY) {
  console.error('missing SUPABASE_SERVICE_ROLE_KEY env var')
  process.exit(1)
}
const APPLY = flags.includes('--apply')
const confirmFlag = flags.find(f => f.startsWith('--confirm-closes='))
const CONFIRM_CLOSES = confirmFlag ? Number(confirmFlag.split('=')[1]) : null
const CSV = path.resolve(csvArg)

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
const logLines = []
const log = (line) => { console.log(line); logLines.push(line) }

// ── CSV parser (RFC-4180 subset — handles quoted, embedded commas & newlines) ─
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

// ── helpers ──────────────────────────────────────────────────────────────────
const trim = (s) => (s ?? '').trim()
const normDate = (s) => {
  const t = trim(s)
  if (!t || t.startsWith('0000-00-00')) return ''
  // Accept "YYYY-MM-DD HH:MM:SS" and "YYYY-MM-DD" — return just the date part.
  const m = t.match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : t
}
const digits = (s) => trim(s).replace(/\D/g, '')
const nameKey = (s) => trim(s).toLowerCase()
const isDigitMa = (s) => /^\d+$/.test(trim(s))

const claimTypesFromAssType = (t) => {
  const v = trim(t).toLowerCase()
  if (v === 'auto') return ['acv']
  if (v === 'diminished value') return ['dv']
  if (v === 'estimate review') return ['estimate']
  return ['other']
}

// Slugify a CSV phase string via the explicit map (fall back to a slug so we
// can log unknown phases with the raw slug).
const csvPhaseToCode = (raw) => {
  const k = trim(raw).toLowerCase()
  if (!k) return null
  return CSV_PHASE_MAP[k] ?? k.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

const iso = () => new Date().toISOString()

// ── load CSV ─────────────────────────────────────────────────────────────────
if (!fs.existsSync(CSV)) { console.error(`CSV not found: ${CSV}`); process.exit(1) }
const rawText = fs.readFileSync(CSV, 'utf8').replace(/^﻿/, '')
const rows = parseCSV(rawText).filter(r => r.length > 1)
const header = rows[0]
const idx = Object.fromEntries(header.map((h, i) => [h.trim(), i]))
const csvRows = rows.slice(1)

log(`\n=== ${APPLY ? 'APPLY' : 'DRY-RUN'} — CSV: ${CSV} ===`)
log(`CSV data rows: ${csvRows.length}`)

// Build a lookup by digit-only assignment_id, and detect duplicates within CSV.
const csvByMa = new Map()
const csvDupes = []
for (let ri = 0; ri < csvRows.length; ri++) {
  const r = csvRows[ri]
  const ma = digits(r[idx.assignment_id])
  if (!ma) continue
  if (csvByMa.has(ma)) csvDupes.push(ma)
  else csvByMa.set(ma, r)
}
if (csvDupes.length) log(`WARN: ${csvDupes.length} duplicate assignment_id in CSV (kept first): ${csvDupes.slice(0, 10).join(', ')}`)

// ── load profiles ────────────────────────────────────────────────────────────
const { data: profileRows, error: pErr } = await sb
  .from('profiles')
  .select('id, name, email, role, is_active')
if (pErr) { console.error('profiles fetch failed:', pErr.message); process.exit(1) }
const profilesByName = new Map(profileRows.map(p => [nameKey(p.name), p]))
const profilesByEmail = new Map(profileRows.map(p => [p.email.toLowerCase(), p]))
log(`Loaded ${profileRows.length} profiles`)

// ── bootstrap: ensure Fabian's profile exists ────────────────────────────────
let fabianId = profilesByEmail.get(FABIAN_PROFILE.email.toLowerCase())?.id
if (!fabianId) {
  if (APPLY) {
    log(`Creating profile for ${FABIAN_PROFILE.name} (${FABIAN_PROFILE.email}) via admin.createUser...`)
    // Random password Fabian can reset later; email confirm auto-set so no invite.
    const password = crypto.randomBytes(24).toString('base64url')
    const { data: created, error: cErr } = await sb.auth.admin.createUser({
      email: FABIAN_PROFILE.email,
      password,
      email_confirm: true,
      user_metadata: { name: FABIAN_PROFILE.name },
    })
    if (cErr) { console.error('createUser failed:', cErr.message); process.exit(1) }
    fabianId = created.user.id
    // handle_new_user trigger creates a profile row; ensure name/role are set right.
    const { error: uErr } = await sb.from('profiles')
      .update({ name: FABIAN_PROFILE.name, role: FABIAN_PROFILE.role, is_active: true, updated_at: iso() })
      .eq('id', fabianId)
    if (uErr) { console.error('profile update failed:', uErr.message); process.exit(1) }
    profilesByName.set(nameKey(FABIAN_PROFILE.name), { id: fabianId, name: FABIAN_PROFILE.name, email: FABIAN_PROFILE.email, role: FABIAN_PROFILE.role, is_active: true })
    log(`  Created profile ${fabianId}`)
  } else {
    log(`WOULD CREATE profile: ${FABIAN_PROFILE.name} (${FABIAN_PROFILE.email}, role=${FABIAN_PROFILE.role})`)
  }
} else {
  log(`Profile for ${FABIAN_PROFILE.name} already exists (${fabianId}).`)
}

// ── bootstrap: ensure `dv_response` phase code exists ────────────────────────
const { data: phaseRows, error: phErr } = await sb.from('status_phase_configs').select('code, label')
if (phErr) { console.error('phase configs fetch failed:', phErr.message); process.exit(1) }
const phaseCodes = new Set(phaseRows.map(p => p.code))
if (!phaseCodes.has('dv_response')) {
  if (APPLY) {
    const { error: pxErr } = await sb.from('status_phase_configs').upsert({
      code: 'dv_response', label: 'DV Response', color: 'blue', sort_order: 5,
    })
    if (pxErr) { console.error('dv_response phase upsert failed:', pxErr.message); process.exit(1) }
    phaseCodes.add('dv_response')
    log(`Added status_phase_configs.dv_response`)
  } else {
    log(`WOULD ADD status_phase_configs.dv_response (label='DV Response')`)
    // Pretend it exists so downstream planning doesn't skip these 2 rows.
    phaseCodes.add('dv_response')
  }
}

// ── load acv_history (only columns needed to plan) ───────────────────────────
const { data: mtRows, error: hErr } = await sb
  .from('acv_history')
  .select('id, ma_number, status, assigned_to, status_phase, submitted_at, claim')
if (hErr) { console.error('acv_history fetch failed:', hErr.message); process.exit(1) }
log(`Loaded ${mtRows.length} acv_history rows`)

const mtByMa = new Map()
const mtSkippedNonDigit = []
for (const row of mtRows) {
  const ma = row.claim?.maNumber ?? row.ma_number ?? ''
  if (!isDigitMa(ma)) { mtSkippedNonDigit.push(row.id); continue }
  const key = digits(ma)
  if (mtByMa.has(key)) {
    // Two rows with same MA# — very rare. Keep the open one preferentially.
    const existing = mtByMa.get(key)
    if (existing.status === 'closed' && row.status === 'open') mtByMa.set(key, row)
  } else {
    mtByMa.set(key, row)
  }
}
log(`  ${mtByMa.size} rows with digit MA# considered for sync`)
log(`  ${mtSkippedNonDigit.length} rows skipped (non-digit MA#): ${mtSkippedNonDigit.slice(0, 5).join(', ')}${mtSkippedNonDigit.length > 5 ? '...' : ''}`)

// ── plan builder ─────────────────────────────────────────────────────────────
const plan = {
  add: [],           // { ma, csvRow, assigneeId, phaseCode }
  reopen: [],        // { ma, mtRow, csvRow, assigneeId, phaseCode }
  reassign: [],      // { ma, mtRow, from, to, fromName, toName, phaseCode, csvRow }
  phaseOnly: [],     // { ma, mtRow, fromPhase, toPhase }
  close: [],         // { ma, mtRow }
  noop: 0,
  warnings: [],
  claimInfoDiffs: [],// { ma, field, current, csv }
}

const resolveAppraiser = (csvName) => {
  const raw = trim(csvName)
  if (!raw) return { id: null, name: '' }
  if (raw.toLowerCase() === 'modern appraisers') return { id: null, name: '' }
  const hit = profilesByName.get(nameKey(raw))
  if (!hit || hit.is_active === false) {
    plan.warnings.push(`unresolved appraiser "${raw}" → unassigned`)
    return { id: null, name: '' }
  }
  return { id: hit.id, name: hit.name }
}

const diffField = (ma, field, current, csv) => {
  const c = (current ?? '').toString().trim()
  const v = (csv ?? '').toString().trim()
  if (!v) return // don't complain about blanks in CSV
  if (c !== v) plan.claimInfoDiffs.push({ ma, field, current: c || '(empty)', csv: v })
}

for (const [ma, r] of csvByMa) {
  const { id: csvAssignId, name: csvHandlingName } = resolveAppraiser(r[idx.appraiser])
  const csvPhaseRaw = trim(r[idx.phase])
  const csvPhaseCode = csvPhaseToCode(csvPhaseRaw)
  const csvPhaseValid = csvPhaseCode && phaseCodes.has(csvPhaseCode) ? csvPhaseCode : null
  if (csvPhaseCode && !csvPhaseValid) {
    plan.warnings.push(`MA ${ma}: phase "${csvPhaseRaw}" (${csvPhaseCode}) not in status_phase_configs — phase skipped`)
  }

  const mt = mtByMa.get(ma)
  if (!mt) {
    plan.add.push({ ma, csvRow: r, assigneeId: csvAssignId, csvHandlingName, phaseCode: csvPhaseValid })
    continue
  }

  // Existing row — diff Claim Info (report only; never write).
  const c = mt.claim ?? {}
  diffField(ma, 'claimNumber',      c.claimNumber,      r[idx.claim_number])
  diffField(ma, 'vin',              c.vin,              r[idx.v_vin])
  diffField(ma, 'year',             c.year,             r[idx.v_year])
  diffField(ma, 'make',             c.make,             r[idx.v_make])
  diffField(ma, 'model',            c.model,            r[idx.v_model])
  diffField(ma, 'insuranceCompany', c.insuranceCompany, r[idx.insurance])
  diffField(ma, 'adjuster',         c.adjuster,         r[idx.adjuster])
  diffField(ma, 'insuredName',      c.insuredName,      [trim(r[idx.owner_first_name]), trim(r[idx.owner_last_name])].filter(Boolean).join(' '))
  diffField(ma, 'ownerPhone',       c.ownerPhone,       r[idx.mobile_phone])
  diffField(ma, 'dateOfLoss',       c.dateOfLoss,       normDate(r[idx.date_of_loss]))

  if (mt.status === 'closed') {
    plan.reopen.push({ ma, mtRow: mt, csvRow: r, assigneeId: csvAssignId, csvHandlingName, phaseCode: csvPhaseValid })
    continue
  }

  // Open (active or completed queue).
  const needReassign = (mt.assigned_to ?? null) !== (csvAssignId ?? null)
  const currentPhase = mt.status_phase ?? null
  const needPhase = csvPhaseValid !== null
    ? currentPhase !== csvPhaseValid
    : (!csvPhaseRaw && currentPhase !== null) // blank CSV phase clears MT phase
      ? true
      : false
  // Note: an unresolved (but non-blank) CSV phase never clears — we warned above.

  if (needReassign) {
    // Look up current assignee's name for the log.
    const fromProfile = profileRows.find(p => p.id === mt.assigned_to)
    plan.reassign.push({
      ma, mtRow: mt, csvRow: r,
      from: mt.assigned_to, to: csvAssignId,
      fromName: fromProfile?.name ?? '(unassigned)', toName: csvHandlingName || '(unassigned)',
      phaseCode: needPhase ? (csvPhaseRaw ? csvPhaseValid : null) : mt.status_phase,
      csvHandlingName,
    })
  } else if (needPhase) {
    plan.phaseOnly.push({ ma, mtRow: mt, fromPhase: currentPhase, toPhase: csvPhaseRaw ? csvPhaseValid : null })
  } else {
    plan.noop++
  }
}

// close pass: MT open with digit MA# not in CSV
for (const [ma, mt] of mtByMa) {
  if (mt.status !== 'open') continue
  if (csvByMa.has(ma)) continue
  plan.close.push({ ma, mtRow: mt })
}

// ── print plan ───────────────────────────────────────────────────────────────
const showFirst = (label, arr, formatter) => {
  log(`\n${label}: ${arr.length}`)
  arr.slice(0, 20).forEach(x => log(`  ${formatter(x)}`))
  if (arr.length > 20) log(`  ...and ${arr.length - 20} more`)
}

showFirst('ADD (new to MT)',        plan.add,      x => `MA ${x.ma}  assignee=${x.csvHandlingName || '(unassigned)'}  phase=${x.phaseCode ?? '(none)'}`)
showFirst('REOPEN (closed in MT)',  plan.reopen,   x => `MA ${x.ma}  assignee=${x.csvHandlingName || '(unassigned)'}`)
showFirst('REASSIGN',               plan.reassign, x => `MA ${x.ma}  ${x.fromName} → ${x.toName}${x.mtRow.submitted_at ? '  (was in completed queue — will un-submit)' : ''}`)
showFirst('PHASE change',           plan.phaseOnly,x => `MA ${x.ma}  ${x.fromPhase ?? '(none)'} → ${x.toPhase ?? '(none)'}`)
showFirst('CLOSE (not in CSV)',     plan.close,    x => `MA ${x.ma}  ${x.mtRow.claim?.insuredName ?? ''}${x.mtRow.submitted_at ? '  (was in completed queue)' : ''}`)
log(`\nNO-OP (in CSV, no changes): ${plan.noop}`)

log('\n=== Warnings ===')
if (!plan.warnings.length) log('  (none)')
else plan.warnings.slice(0, 30).forEach(w => log(`  ${w}`))
if (plan.warnings.length > 30) log(`  ...and ${plan.warnings.length - 30} more`)

log('\n=== Claim Info diffs (existing rows — WILL NOT be updated) ===')
if (!plan.claimInfoDiffs.length) log('  (none)')
else {
  plan.claimInfoDiffs.slice(0, 60).forEach(d => log(`  MA ${d.ma}: ${d.field}: ${JSON.stringify(d.current)} → ${JSON.stringify(d.csv)}`))
  if (plan.claimInfoDiffs.length > 60) log(`  ...and ${plan.claimInfoDiffs.length - 60} more diffs`)
}

const total = plan.add.length + plan.reopen.length + plan.reassign.length + plan.phaseOnly.length + plan.close.length
log(`\nTotal actions: ${total}`)

if (!APPLY) {
  const logPath = `csv-sync-${new Date().toISOString().replace(/[:.]/g, '-')}.log`
  fs.writeFileSync(logPath, logLines.join('\n'))
  log(`\nDry-run complete. Log: ${logPath}`)
  log(`Re-run with --apply to execute. If CLOSE > ${CLOSE_SAFETY_GATE}, also pass --confirm-closes=${plan.close.length}.`)
  process.exit(0)
}

// ── apply ────────────────────────────────────────────────────────────────────
if (plan.close.length > CLOSE_SAFETY_GATE && CONFIRM_CLOSES !== plan.close.length) {
  console.error(`\nCLOSE count is ${plan.close.length} (> gate of ${CLOSE_SAFETY_GATE}). Pass --confirm-closes=${plan.close.length} to proceed.`)
  process.exit(1)
}

log('\n=== APPLYING CHANGES ===')

let applied = { add: 0, reopen: 0, reassign: 0, phase: 0, close: 0 }
let errors = []

// helper: merge handlingAppraiser into existing claim jsonb without touching other keys
const withHandling = (claim, name) => ({ ...(claim ?? {}), handlingAppraiser: name })

// ADD
for (const x of plan.add) {
  const r = x.csvRow
  const vehicle = [trim(r[idx.v_year]), trim(r[idx.v_make]), trim(r[idx.v_model])].filter(Boolean).join(' ')
  const insuredName = [trim(r[idx.owner_first_name]), trim(r[idx.owner_last_name])].filter(Boolean).join(' ')
  const addrParts = [trim(r[idx.v_address]), trim(r[idx.v_city]), trim(r[idx.v_state]), trim(r[idx.v_zip])].filter(Boolean)
  const yearNum = parseInt(trim(r[idx.v_year]), 10) || 0
  const claimJson = {
    maNumber: x.ma,
    claimNumber: trim(r[idx.claim_number]),
    handlingAppraiser: x.csvHandlingName || '',
    dateReceived: normDate(r[idx.date_created]),
    dateOfLoss: normDate(r[idx.date_of_loss]),
    clientType: 'Insured',
    clientName: '',
    insuredName,
    ownerPhone: trim(r[idx.mobile_phone]),
    ownerEmail: '',
    ownerAddress: addrParts.join(', '),
    insuranceCompany: trim(r[idx.insurance]),
    adjuster: trim(r[idx.adjuster]),
    adjusterPhone: '',
    adjusterEmail: '',
    vin: trim(r[idx.v_vin]).toUpperCase(),
    year: yearNum,
    make: trim(r[idx.v_make]),
    model: trim(r[idx.v_model]),
    trim: '',
    engine: '',
    drivetrain: '',
    transmission: '',
    fuelType: '',
    mileage: 0,
    zip: trim(r[idx.v_zip]),
    radius: 0,
    claimTypes: claimTypesFromAssType(r[idx.ass_type]),
  }
  const insertRow = {
    id: `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    user_id: CREATOR_USER_ID,
    date: (normDate(r[idx.date_created]) || new Date().toISOString().slice(0, 10)) + 'T00:00:00.000Z',
    mode: 'comp-finder',
    vehicle,
    vin: trim(r[idx.v_vin]).toUpperCase() || null,
    ma_number: x.ma,
    acv: 0,
    claim: claimJson,
    comps: [],
    adjustments: {},
    result: {},
    mileage_rate: 0,
    status: 'open',
    assigned_to: x.assigneeId,
    assigned_at: x.assigneeId ? iso() : null,
    status_phase: x.phaseCode,
    status_phase_set_at: x.phaseCode ? iso() : null,
  }
  const { error } = await sb.from('acv_history').insert(insertRow)
  if (error) { errors.push(`ADD MA ${x.ma}: ${error.message}`); continue }
  applied.add++
  log(`  ADD MA ${x.ma}  id=${insertRow.id}  assignee=${x.csvHandlingName || '(unassigned)'}`)
}

// REOPEN + REASSIGN + PHASE (combined update)
for (const x of plan.reopen) {
  const upd = {
    status: 'open',
    submitted_at: null,
    submitted_by: null,
    assigned_to: x.assigneeId,
    assigned_at: x.assigneeId ? iso() : null,
    last_status_request_at: null,
    status_phase: x.phaseCode,
    status_phase_set_at: x.phaseCode ? iso() : null,
    claim: withHandling(x.mtRow.claim, x.csvHandlingName),
  }
  const { error } = await sb.from('acv_history').update(upd).eq('id', x.mtRow.id)
  if (error) { errors.push(`REOPEN MA ${x.ma}: ${error.message}`); continue }
  applied.reopen++
  log(`  REOPEN MA ${x.ma}  → assignee=${x.csvHandlingName || '(unassigned)'}`)
}

// REASSIGN (open row, assignee differs)
for (const x of plan.reassign) {
  const upd = {
    assigned_to: x.to,
    assigned_at: x.to ? iso() : null,
    last_status_request_at: null,
    submitted_at: null,
    submitted_by: null,
    status_phase: x.phaseCode,
    status_phase_set_at: x.phaseCode ? iso() : null,
    claim: withHandling(x.mtRow.claim, x.csvHandlingName),
  }
  const { error } = await sb.from('acv_history').update(upd).eq('id', x.mtRow.id)
  if (error) { errors.push(`REASSIGN MA ${x.ma}: ${error.message}`); continue }
  applied.reassign++
  log(`  REASSIGN MA ${x.ma}  ${x.fromName} → ${x.toName}`)
}

// PHASE-only
for (const x of plan.phaseOnly) {
  const upd = {
    status_phase: x.toPhase,
    status_phase_set_at: x.toPhase ? iso() : null,
  }
  const { error } = await sb.from('acv_history').update(upd).eq('id', x.mtRow.id)
  if (error) { errors.push(`PHASE MA ${x.ma}: ${error.message}`); continue }
  applied.phase++
  log(`  PHASE MA ${x.ma}  ${x.fromPhase ?? '(none)'} → ${x.toPhase ?? '(none)'}`)
}

// CLOSE
for (const x of plan.close) {
  const { error } = await sb.from('acv_history').update({ status: 'closed' }).eq('id', x.mtRow.id)
  if (error) { errors.push(`CLOSE MA ${x.ma}: ${error.message}`); continue }
  applied.close++
  log(`  CLOSE MA ${x.ma}`)
}

// ── summary ──────────────────────────────────────────────────────────────────
log('\n=== APPLY RESULT ===')
log(`  ADD:      ${applied.add} / ${plan.add.length}`)
log(`  REOPEN:   ${applied.reopen} / ${plan.reopen.length}`)
log(`  REASSIGN: ${applied.reassign} / ${plan.reassign.length}`)
log(`  PHASE:    ${applied.phase} / ${plan.phaseOnly.length}`)
log(`  CLOSE:    ${applied.close} / ${plan.close.length}`)
if (errors.length) {
  log(`\n${errors.length} ERRORS:`)
  errors.forEach(e => log(`  ${e}`))
}

const logPath = `csv-sync-${new Date().toISOString().replace(/[:.]/g, '-')}.log`
fs.writeFileSync(logPath, logLines.join('\n'))
log(`\nLog written to ${logPath}`)
process.exit(errors.length ? 2 : 0)
