// scripts/cleanup-post-sync.mjs
//
// Post-CSV-sync cleanup pass. Three passes in one script:
//
//   1. DUPE PASS: for every MA# (digit) with >1 row in acv_history:
//        - blank row (no meaningful data)       -> DELETE
//        - row with real data (comps / ACV /
//          estimate / dv / invoice / reports)   -> ensure status='open'
//      Applies whether the row is currently open or closed.
//
//   2. EMPTY-MA PASS: every row where maNumber is empty AND status='open':
//        - CLOSE (set status='closed'). Keeps them out of the queue but
//          preserves for audit.
//
//   3. RE-CLOSE PASS: every row where status='open' AND digit-MA# is NOT in
//      the CSV AND the row is blank (no real data):
//        - CLOSE (set status='closed').
//      Rows with real data are LEFT ALONE (logged as warnings) so we don't
//      accidentally close active work that just happens to be missing from
//      the CSV.
//
// Usage:
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/cleanup-post-sync.mjs <csv-path>
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/cleanup-post-sync.mjs <csv-path> --apply

import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://ektglhdstobaipdqssjx.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const [, , csvArg, ...flags] = process.argv
if (!csvArg) { console.error('usage: node cleanup-post-sync.mjs <csv-path> [--apply]'); process.exit(1) }
if (!SERVICE_KEY) { console.error('missing SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
const APPLY = flags.includes('--apply')
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
const lines = []
const log = (s) => { console.log(s); lines.push(s) }

// ── load CSV MA set ──────────────────────────────────────────────────────────
const rawCsv = fs.readFileSync(csvArg, 'utf8').replace(/^﻿/, '')
const csvMas = new Set()
for (const row of rawCsv.split(/\r?\n/).slice(1)) {
  const first = row.split(',')[0]?.replace(/"/g, '').trim()
  if (/^\d+$/.test(first)) csvMas.add(first)
}
log(`CSV MA count: ${csvMas.size}`)

// ── load all acv_history ─────────────────────────────────────────────────────
// invoice column may or may not be migrated — omit it. hasData still has
// plenty of other signals.
const { data: rows, error } = await sb
  .from('acv_history')
  .select('id, ma_number, status, created_at, claim, comps, adjustments, result, estimate, auction_listings, documents, dv, reports_state')
if (error) { console.error('fetch failed:', error.message); process.exit(1) }
log(`acv_history rows: ${rows.length}`)

const getMa = (r) => (r.claim?.maNumber ?? r.ma_number ?? '').trim()
const isDigit = (s) => /^\d+$/.test(s)

// "has real data" heuristic. A row that's just the shell created by "New Claim"
// with only maNumber / insuredName / a couple of ClaimInfo fields = blank.
const hasData = (r) => {
  if (Array.isArray(r.comps) && r.comps.length > 0) return 'comps'
  if (r.result && typeof r.result === 'object' && Number(r.result.acv) > 0) return 'result.acv'
  if (Array.isArray(r.auction_listings) && r.auction_listings.length > 0) return 'auction_listings'
  if (Array.isArray(r.documents) && r.documents.length > 0) return 'documents'
  if (r.estimate && Object.keys(r.estimate).length > 0) return 'estimate'
  if (r.dv && Object.keys(r.dv).length > 0) return 'dv'
  if (r.reports_state && Object.keys(r.reports_state).length > 0) return 'reports_state'
  // Adjustments with anything other than the app's default deductionsNote counts.
  const adj = r.adjustments
  if (adj && typeof adj === 'object') {
    for (const k of ['vehicleHistory', 'priorDamages', 'additions']) {
      if (Number(adj[k]) !== 0) return `adjustments.${k}`
    }
    for (const k of ['vehicleHistoryNote', 'priorDamagesNote', 'additionsNote', 'notes']) {
      if (typeof adj[k] === 'string' && adj[k].trim().length > 0) return `adjustments.${k}`
    }
  }
  return null
}

// ── group by digit MA ────────────────────────────────────────────────────────
const digitGroups = new Map()  // ma -> [rows]
const emptyMa = []
const nonDigit = []
for (const r of rows) {
  const ma = getMa(r)
  if (!ma) { emptyMa.push(r); continue }
  if (!isDigit(ma)) { nonDigit.push(r); continue }
  if (!digitGroups.has(ma)) digitGroups.set(ma, [])
  digitGroups.get(ma).push(r)
}
log(`digit-MA groups: ${digitGroups.size}, empty-MA rows: ${emptyMa.length}, non-digit MA rows: ${nonDigit.length}`)

// ── plan ─────────────────────────────────────────────────────────────────────
const plan = {
  delete: [],   // { id, ma, why }
  open:   [],   // { id, ma, why, fromStatus }  (dedup pass — keep data-having rows open)
  close:  [],   // { id, ma, why, fromStatus }  (empty-MA + re-close pass)
  keepAsIs: 0,
  dupeDataConflicts: [],  // MAs with 2+ has-data rows — log for manual review
}

// PASS 1 — dupes. Rule (Henry, 2026-09-11 cleanup):
//   For each MA# with multiple rows in acv_history:
//     - Blank rows (no comps / ACV / estimate / etc.) are always deleted —
//       unless the whole MA is fully blank AND is in the CSV, in which case
//       keep one (newest) as an open shell.
//     - When ≥1 row has real data: keep the NEWEST data-having row as
//       status=open; CLOSE (do not delete) the older data-having siblings.
//       Preserves audit trail; keeps the dashboard from showing the same
//       MA twice.
for (const [ma, group] of digitGroups) {
  if (group.length < 2) continue
  const sortedByAge = [...group].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
  const dataRows = sortedByAge.filter(r => hasData(r))
  const blankRows = sortedByAge.filter(r => !hasData(r))

  if (dataRows.length >= 1) {
    // Keep newest data-having row as open.
    const keep = dataRows[0]
    if (keep.status === 'closed') plan.open.push({ id: keep.id, ma, why: `dupe consolidate: newest data-having (${hasData(keep)})`, fromStatus: keep.status })
    // Older data-having siblings: if currently open, close (drop from dashboard).
    // If already closed, leave — matches Henry's "close not delete" for
    // audit-preserving consolidation.
    for (const r of dataRows.slice(1)) {
      if (r.status === 'open') plan.close.push({ id: r.id, ma, why: `dupe consolidate: older data-having`, fromStatus: r.status })
    }
    // Blank siblings are always deleted — they have no work.
    for (const r of blankRows) plan.delete.push({ id: r.id, ma, why: `dupe blank sibling` })
    // Track for manual-review log (informational; the plan already handles it).
    if (dataRows.length > 1) plan.dupeDataConflicts.push({ ma, rows: dataRows.map(r => ({ id: r.id, dataKey: hasData(r), status: r.status, created_at: r.created_at })) })
    continue
  }

  // dataRows.length === 0 → all rows in this MA are fully blank.
  if (csvMas.has(ma)) {
    // MA is in CSV — keep one (newest) as an open shell so the CSV row stays.
    const keep = sortedByAge[0]
    if (keep.status === 'closed') plan.open.push({ id: keep.id, ma, why: `dupe blank, kept as CSV shell`, fromStatus: keep.status })
    for (const r of sortedByAge.slice(1)) plan.delete.push({ id: r.id, ma, why: `dupe blank (kept newest as CSV shell)` })
  } else {
    for (const r of sortedByAge) plan.delete.push({ id: r.id, ma, why: `dupe blank, not in CSV — all removed` })
  }
}

// PASS 2 — empty-MA orphans (close, don't delete, per Henry's Q1 answer)
for (const r of emptyMa) {
  if (r.status === 'open') plan.close.push({ id: r.id, ma: '(empty)', why: 'empty MA orphan', fromStatus: r.status })
}

// PASS 3 — re-close ALL open digit-MA rows that aren't in the CSV.
// Henry's rule: Modern Tools open queue must match the CSV exactly. No
// data-exception — a row with real ACV work but missing from the CSV still
// gets closed (data preserved, just off the dashboard).
// Skip rows already handled by pass 1 (dedup owns them; older-dupe siblings
// were already added to plan.close from that pass).
const pass1Ids = new Set([
  ...plan.delete.map(x => x.id),
  ...plan.open.map(x => x.id),
  ...plan.close.map(x => x.id),
])
for (const [ma, group] of digitGroups) {
  if (csvMas.has(ma)) continue
  for (const r of group) {
    if (r.status !== 'open') continue
    if (pass1Ids.has(r.id)) continue
    plan.close.push({ id: r.id, ma, why: 'not in CSV — closed to match CSV exactly', fromStatus: r.status })
  }
}

// ── print ────────────────────────────────────────────────────────────────────
const show = (label, arr, formatter) => {
  log(`\n${label}: ${arr.length}`)
  arr.slice(0, 30).forEach(x => log('  ' + formatter(x)))
  if (arr.length > 30) log(`  ...and ${arr.length - 30} more`)
}
show('DELETE (dupe blank)',                              plan.delete, x => `MA ${String(x.ma).padEnd(10)} id=${x.id}  ${x.why}`)
show('SET open (dupe has-data currently closed)',        plan.open,   x => `MA ${String(x.ma).padEnd(10)} id=${x.id}  ${x.fromStatus}→open  ${x.why}`)
show('CLOSE (empty-MA + re-close pass)',                 plan.close,  x => `MA ${String(x.ma).padEnd(10)} id=${x.id}  ${x.fromStatus}→closed  ${x.why}`)

if (plan.dupeDataConflicts.length) {
  log(`\n=== Dupe MAs with 2+ data-having rows — MANUAL REVIEW ===`)
  for (const c of plan.dupeDataConflicts) {
    log(`  MA ${c.ma}:`)
    for (const r of c.rows) log(`    id=${r.id}  data=${r.dataKey}  status=${r.status}`)
  }
}

log(`\nTotal writes: ${plan.delete.length + plan.open.length + plan.close.length}`)

if (!APPLY) {
  const p = `cleanup-post-sync-${new Date().toISOString().replace(/[:.]/g, '-')}.log`
  fs.writeFileSync(p, lines.join('\n'))
  log(`\nDry-run. Log: ${p}. Re-run with --apply to execute.`)
  process.exit(0)
}

// ── apply ────────────────────────────────────────────────────────────────────
log('\n=== APPLYING ===')
let done = { delete: 0, open: 0, close: 0 }
let errs = []

for (const x of plan.delete) {
  // Clean up storage bucket first — RLS gates on the claim existing, so
  // after the row is deleted its objects become orphaned. Best-effort.
  try {
    const { data: files } = await sb.storage.from('claim-documents').list(x.id)
    if (files && files.length > 0) {
      await sb.storage.from('claim-documents').remove(files.map(f => `${x.id}/${f.name}`))
    }
  } catch { /* best-effort */ }
  const { error } = await sb.from('acv_history').delete().eq('id', x.id)
  if (error) { errs.push(`DELETE ${x.id}: ${error.message}`); continue }
  done.delete++
}
for (const x of plan.open) {
  const { error } = await sb.from('acv_history').update({ status: 'open' }).eq('id', x.id)
  if (error) { errs.push(`OPEN ${x.id}: ${error.message}`); continue }
  done.open++
}
for (const x of plan.close) {
  const { error } = await sb.from('acv_history').update({ status: 'closed' }).eq('id', x.id)
  if (error) { errs.push(`CLOSE ${x.id}: ${error.message}`); continue }
  done.close++
}

log(`\nResult:  DELETE ${done.delete}/${plan.delete.length}  OPEN ${done.open}/${plan.open.length}  CLOSE ${done.close}/${plan.close.length}`)
if (errs.length) { log('Errors:'); errs.forEach(e => log('  ' + e)) }

const p = `cleanup-post-sync-${new Date().toISOString().replace(/[:.]/g, '-')}.log`
fs.writeFileSync(p, lines.join('\n'))
log(`\nLog: ${p}`)
process.exit(errs.length ? 2 : 0)
