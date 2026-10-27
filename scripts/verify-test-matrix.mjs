#!/usr/bin/env node
// End-to-end replay of the handoff/submit gate logic against every live
// TEST-ACV-* claim. Replicates the EXACT frontend `needsReportHandoff`
// gate and the backend validation in /api/claims/[id]/complete-report
// and /api/claims/[id]/submit, then compares against expected outcomes.
//
// Does NOT mutate state — this is a read-only logic replay. If it reports
// all PASS, the live UI behavior should match the matrix exactly.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const envText = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '.env.local'), 'utf8')
const env = Object.fromEntries(
  envText.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')).map(l => {
    const eq = l.indexOf('=')
    return [l.slice(0, eq), l.slice(eq + 1).replace(/^"|"$/g, '')]
  }),
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// Expected outcomes for each scenario.
// button: what the appraiser sees on the claim workspace (viewer = assignee, no can_submit_without_handoff)
// submitBranch: which branch /api/claims/[id]/submit takes if Submit is clicked
// completeReportAllowed: can /api/claims/[id]/complete-report succeed?
// completeReportError: expected 400 message if not allowed (substring match)
const EXPECTED = {
  'TEST-ACV-A-PICKER': {
    button: 'Complete Report (picker)',
    submitBranch: null, // Submit button not shown
    completeReportAllowed: true,
  },
  'TEST-ACV-B-SUBMIT-SAME': {
    button: 'Submit for QC',
    submitBranch: 'qc',
    // UI hides picker (neg = assignee), but API accepts an explicit
    // override to someone different — valid late-breaking handoff.
    completeReportAllowed: true,
  },
  'TEST-ACV-C-SUBMIT-NO-NEG': {
    button: 'Submit for QC',
    submitBranch: 'qc',
    // UI hides picker (no neg), but API accepts explicit toAssignee.
    completeReportAllowed: true,
  },
  'TEST-ACV-D-ROUGH-PENDING': {
    button: 'Submit for Rough Numbers',
    submitBranch: 'rough_numbers',
    completeReportAllowed: false,
    completeReportError: 'Rough numbers pending',
  },
  'TEST-ACV-E-ROUGH-PENDING-NO-NEG': {
    button: 'Submit for Rough Numbers',
    submitBranch: 'rough_numbers',
    completeReportAllowed: false,
    completeReportError: 'Rough numbers pending',
  },
  'TEST-ACV-F-ROUGH-POST': {
    button: 'Complete Report (picker)',
    submitBranch: 'qc', // because rough handoff already done, next Submit → QC
    completeReportAllowed: true,
  },
  'TEST-ACV-G-REPORT-ONLY': {
    button: 'Submit for QC',
    submitBranch: 'qc',
    completeReportAllowed: false,
    completeReportError: 'report-only claim',
    uiHidesHandoff: true,
    uiHideReason: 'no RTA',
  },
}

// Replicates ClaimWorkspace.tsx:needsReportHandoff
function computeNeedsReportHandoff({ claim, assignedTo, submittedAt, closedAt, workflowStage, needsRoughNumbers, roughNumbersHandoffAt, callerCanSubmitWithoutHandoff, negotiatorProfile }) {
  if (workflowStage !== 'main') return false
  if (submittedAt) return false
  if (closedAt) return false
  if (!negotiatorProfile) return false
  if (!assignedTo) return false
  if (negotiatorProfile.id === assignedTo) return false
  if (callerCanSubmitWithoutHandoff) return false
  if (needsRoughNumbers && !roughNumbersHandoffAt) return false
  if (!(claim.claimTypes ?? []).includes('rta')) return false
  return true
}

// Replicates the backend /api/claims/[id]/submit branch choice.
function computeSubmitBranch({ needsRoughNumbers, roughNumbersHandoffAt }) {
  if (needsRoughNumbers && !roughNumbersHandoffAt) return 'rough_numbers'
  return 'qc'
}

// Replicates the backend /api/claims/[id]/complete-report validation.
// Returns { ok: boolean, error?: string } matching the API response shape.
async function dryRunCompleteReport({ claim, assignedTo, submittedAt, closedAt, workflowStage, status, callerId, callerRole, callerCompanyId, companyIdOnClaim, toAssignee, needsRoughNumbers: nrnFromRow, roughNumbersHandoffAt: handoffFromRow }) {
  if (status !== 'open') return { ok: false, error: 'Claim is not open' }
  if ((workflowStage ?? 'main') !== 'main') return { ok: false, error: 'Report-complete only applies to Appraiser-stage claims' }
  if (submittedAt) return { ok: false, error: 'Claim already submitted' }
  if (closedAt) return { ok: false, error: 'Claim is not open' }
  const isAdmin = callerRole === 'admin'
  const isAssignee = assignedTo === callerId
  if (!isAdmin && !isAssignee) return { ok: false, error: 'Not authorized to complete this report' }
  const claimTypes = Array.isArray(claim.claimTypes) ? claim.claimTypes : []
  if (toAssignee && !claimTypes.includes('acv')) {
    return { ok: false, error: 'Handoff override is only available on ACV claims.' }
  }
  if (!claimTypes.includes('rta')) {
    return { ok: false, error: 'This is a report-only claim (no RTA). Submit for QC directly instead.' }
  }
  // Rough-numbers-pending check (mirror of the UI gate). Prefer the row-
  // level columns passed in; fall back to the JSON mirror.
  const needsRoughNumbers = nrnFromRow ?? (claim.needsRoughNumbers === true)
  const roughNumbersHandoffAt = handoffFromRow ?? claim.roughNumbersHandoffAt ?? null
  if (needsRoughNumbers && !roughNumbersHandoffAt) {
    return { ok: false, error: 'Rough numbers pending — submit for admin review first instead of handing off.' }
  }
  // Resolve target (explicit or legacy name-match)
  let target = null
  if (toAssignee) {
    const { data: p } = await sb.from('profiles').select('id, name, email, role, is_active, is_super_admin, claim_types').eq('id', toAssignee).maybeSingle()
    if (!p) return { ok: false, error: 'Target user not found' }
    target = p
  } else {
    const negotiatingName = (claim.negotiatingAppraiser ?? claim.handlingAppraiser ?? '').toString().trim()
    if (!negotiatingName) return { ok: false, error: 'Set a Negotiating Appraiser on the claim first — the report hands off to them.' }
    const { data: profiles } = await sb.from('profiles').select('id, name, email, role, is_active, is_super_admin, claim_types')
    const needle = negotiatingName.toLowerCase()
    target = (profiles ?? []).find(p => (p.name ?? '').trim().toLowerCase() === needle || (p.email ?? '').trim().toLowerCase() === needle)
    if (!target) return { ok: false, error: `Negotiating appraiser "${negotiatingName}" does not match a user profile. Pick from the dropdown.` }
  }
  if (target.id === assignedTo) return { ok: false, error: 'You are already the handoff target — use Submit for QC instead.' }
  if (target.is_active === false) return { ok: false, error: 'Target user is inactive' }
  if (target.is_super_admin === true) return { ok: false, error: 'Target user is not eligible for handoff' }
  if (target.role !== 'appraiser') return { ok: false, error: 'Handoff target must be an appraiser' }
  const targetTypes = Array.isArray(target.claim_types) ? target.claim_types : []
  if (targetTypes.length > 0 && claimTypes.length > 0) {
    const have = new Set(targetTypes)
    const overlaps = claimTypes.some(t => have.has(t))
    if (!overlaps) return { ok: false, error: `${target.name ?? target.email ?? 'Target'} does not handle this claim's types.` }
  }
  return { ok: true, target }
}

// Fetch all TEST-ACV-* claims
const { data: claims } = await sb
  .from('acv_history')
  .select('*')
  .like('ma_number', 'TEST-ACV-%')
  .order('ma_number')

if (!claims || claims.length === 0) {
  console.error('No TEST-ACV-* claims found. Run create-test-matrix.mjs first.')
  process.exit(1)
}

// Load Henry's profile (viewer = assignee)
const HENRY_ID = 'd968ce49-dc3e-4a72-b8ae-5bc7019d97ca'
const { data: henry } = await sb.from('profiles').select('*').eq('id', HENRY_ID).maybeSingle()

// Load all profiles for negotiator name resolution
const { data: profiles } = await sb.from('profiles').select('*')
function resolveProfile(name) {
  const needle = (name ?? '').trim().toLowerCase()
  if (!needle) return null
  return profiles.find(p => (p.name ?? '').trim().toLowerCase() === needle || (p.email ?? '').trim().toLowerCase() === needle) ?? null
}

let allPass = true
const results = []

for (const claim of claims) {
  const ma = claim.ma_number
  const exp = EXPECTED[ma]
  if (!exp) {
    console.log(`[SKIP] ${ma} — no expected outcome configured`)
    continue
  }

  const claimJson = claim.claim ?? {}
  const assignedTo = claim.assigned_to
  const submittedAt = claim.submitted_at
  const closedAt = claim.closed_at
  const workflowStage = claim.workflow_stage ?? 'main'
  const status = claim.status
  const needsRoughNumbers = claim.needs_rough_numbers === true
  const roughNumbersHandoffAt = claim.rough_numbers_handoff_at
  const negotiatorProfile = resolveProfile(claimJson.negotiatingAppraiser)
  const callerCanSubmitWithoutHandoff = henry.can_submit_without_handoff === true

  // 1. Compute button
  const handoff = computeNeedsReportHandoff({
    claim: claimJson,
    assignedTo, submittedAt, closedAt, workflowStage, needsRoughNumbers, roughNumbersHandoffAt,
    callerCanSubmitWithoutHandoff, negotiatorProfile,
  })
  let actualButton
  if (handoff) {
    actualButton = (claimJson.claimTypes ?? []).includes('acv') ? 'Complete Report (picker)' : 'Complete Report (single)'
  } else {
    actualButton = (needsRoughNumbers && !roughNumbersHandoffAt) ? 'Submit for Rough Numbers' : 'Submit for QC'
  }
  const buttonPass = actualButton === exp.button

  // 2. Compute submit branch (if submit button were clicked)
  const actualBranch = computeSubmitBranch({ needsRoughNumbers, roughNumbersHandoffAt })
  const branchPass = exp.submitBranch === null || actualBranch === exp.submitBranch

  // 3. Dry-run complete-report (with Alex as toAssignee when picker, or no toAssignee for legacy)
  const alex = profiles.find(p => p.name === 'Alex Aleksanyan')
  const toAssignee = (claimJson.claimTypes ?? []).includes('acv') ? alex.id : null
  const crResult = await dryRunCompleteReport({
    claim: claimJson,
    assignedTo, submittedAt, closedAt, workflowStage, status,
    callerId: HENRY_ID, callerRole: 'appraiser', callerCompanyId: null, companyIdOnClaim: null,
    toAssignee,
    needsRoughNumbers, roughNumbersHandoffAt,
  })
  const crPass = crResult.ok === exp.completeReportAllowed
    && (!exp.completeReportError || (crResult.error ?? '').includes(exp.completeReportError))

  const pass = buttonPass && branchPass && crPass
  if (!pass) allPass = false

  results.push({
    ma,
    pass,
    button: { actual: actualButton, expected: exp.button, pass: buttonPass },
    submitBranch: { actual: actualBranch, expected: exp.submitBranch, pass: branchPass },
    completeReport: { actual: crResult, expectedAllowed: exp.completeReportAllowed, expectedError: exp.completeReportError, pass: crPass },
  })
}

// Print results
console.log('\n' + '='.repeat(80))
console.log('VERIFICATION RESULTS')
console.log('='.repeat(80) + '\n')

for (const r of results) {
  const icon = r.pass ? '✓ PASS' : '✗ FAIL'
  console.log(`${icon}  ${r.ma}`)
  if (!r.button.pass) {
    console.log(`       button:  expected "${r.button.expected}", got "${r.button.actual}"`)
  } else {
    console.log(`       button:  "${r.button.actual}"`)
  }
  if (!r.submitBranch.pass) {
    console.log(`       submit:  expected branch "${r.submitBranch.expected}", got "${r.submitBranch.actual}"`)
  } else if (r.submitBranch.actual) {
    console.log(`       submit:  branch "${r.submitBranch.actual}"`)
  }
  if (!r.completeReport.pass) {
    console.log(`       cr:      expected allowed=${r.completeReport.expectedAllowed} err~"${r.completeReport.expectedError}", got ok=${r.completeReport.actual.ok} err="${r.completeReport.actual.error ?? ''}"`)
  } else {
    const cr = r.completeReport.actual
    console.log(`       cr:      ${cr.ok ? `OK → ${cr.target?.name ?? cr.target?.email}` : `BLOCKED (${cr.error})`}`)
  }
  console.log('')
}

console.log('='.repeat(80))
console.log(allPass ? '✓ ALL SCENARIOS PASS' : '✗ ONE OR MORE SCENARIOS FAILED')
console.log('='.repeat(80))
process.exit(allPass ? 0 : 1)
