#!/usr/bin/env node
// Audit for behavior regressions introduced by the handoff/RTA/rough-numbers
// gate changes. Flags any live production claim whose displayed button will
// have CHANGED from what it was before this session.

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

// Pull every OPEN, MAIN-stage, non-submitted claim with an assignee. These
// are the ones where an appraiser is currently looking at an action button.
const { data: openClaims } = await sb
  .from('acv_history')
  .select('id, ma_number, claim, assigned_to, needs_rough_numbers, rough_numbers_handoff_at')
  .eq('status', 'open')
  .eq('workflow_stage', 'main')
  .is('submitted_at', null)
  .not('assigned_to', 'is', null)
  .not('ma_number', 'like', 'TEST-%')

const { data: profiles } = await sb.from('profiles').select('id, name, email, role, can_submit_without_handoff')
const profById = new Map(profiles.map(p => [p.id, p]))
const profByName = new Map()
for (const p of profiles) {
  if (p.name) profByName.set(p.name.trim().toLowerCase(), p)
  if (p.email) profByName.set(p.email.trim().toLowerCase(), p)
}

// Replay OLD gate (what was deployed before this session): no RTA check,
// no rough-numbers check.
function oldNeedsHandoff(c) {
  const neg = resolveNeg(c.claim)
  return !!(neg && c.assigned_to && neg.id !== c.assigned_to
    && !isCanBypass(c.assigned_to))
}
// Replay NEW gate (what's live now): adds RTA + rough-numbers requirements.
function newNeedsHandoff(c) {
  const neg = resolveNeg(c.claim)
  if (!neg || !c.assigned_to || neg.id === c.assigned_to) return false
  if (isCanBypass(c.assigned_to)) return false
  if (c.needs_rough_numbers && !c.rough_numbers_handoff_at) return false
  if (!((c.claim?.claimTypes ?? []).includes('rta'))) return false
  return true
}
function resolveNeg(claim) {
  const n = (claim?.negotiatingAppraiser ?? claim?.handlingAppraiser ?? '').toString().trim().toLowerCase()
  if (!n) return null
  return profByName.get(n) ?? null
}
function isCanBypass(assignedTo) {
  return profById.get(assignedTo)?.can_submit_without_handoff === true
}

// Classify
const changedClaims = []       // old=handoff, new=submit (behavior regressed)
const unaffected = []
for (const c of openClaims) {
  const was = oldNeedsHandoff(c)
  const is = newNeedsHandoff(c)
  if (was !== is) {
    changedClaims.push({ ...c, oldButton: was ? 'Complete Report' : 'Submit', newButton: is ? 'Complete Report' : 'Submit' })
  } else {
    unaffected.push(c)
  }
}

console.log(`Scanned ${openClaims.length} open main-stage claims.`)
console.log(`Behavior unchanged: ${unaffected.length}`)
console.log(`Behavior CHANGED by this session's gate updates: ${changedClaims.length}\n`)

if (changedClaims.length > 0) {
  console.log('=== CLAIMS WHERE BUTTON LABEL FLIPPED ===\n')
  for (const c of changedClaims) {
    const assignee = profById.get(c.assigned_to)
    const types = c.claim?.claimTypes ?? []
    const hasAcv = types.includes('acv')
    const hasRta = types.includes('rta')
    const neg = c.claim?.negotiatingAppraiser ?? '(none)'
    let reason
    if (!hasRta && types.length > 0) reason = 'no RTA chip → report-only now'
    else if (c.needs_rough_numbers && !c.rough_numbers_handoff_at) reason = 'rough-numbers pending → admin first now'
    else if (types.length === 0) reason = 'legacy claim with no claimTypes → treated as report-only now'
    else reason = 'unknown — investigate'
    console.log(`  MA#${c.ma_number || '(unset)'}  assignee=${assignee?.name ?? c.assigned_to}  neg=${neg}  types=${JSON.stringify(types)}`)
    console.log(`    ${c.oldButton} → ${c.newButton}   reason: ${reason}`)
  }
}

// Separately, flag claims that NEW gate blocks but WHOSE INTENT is clearly handoff:
// has ACV + has negotiator set + negotiator ≠ assignee + no RTA. These are
// candidates for admins to either tick RTA or accept the new report-only behavior.
console.log('\n=== CLAIMS LIKELY MISSING AN RTA CHIP ===')
console.log('(ACV + negotiator ≠ assignee + no RTA — handoff was active before, now bypassed)\n')
let flagged = 0
for (const c of changedClaims) {
  const types = c.claim?.claimTypes ?? []
  if (!types.includes('acv')) continue
  if (types.includes('rta')) continue
  if (c.needs_rough_numbers && !c.rough_numbers_handoff_at) continue
  const neg = resolveNeg(c.claim)
  if (!neg || neg.id === c.assigned_to) continue
  const assignee = profById.get(c.assigned_to)
  console.log(`  MA#${c.ma_number}  assignee=${assignee?.name}  neg=${c.claim?.negotiatingAppraiser}`)
  flagged++
}
console.log(flagged === 0 ? '  (none)' : `\n  ${flagged} claim(s) above would benefit from the RTA chip being ticked.`)

// Also check: rough-numbers claims that are currently assigned to admins
// (meaning they're sitting in the Rough Numbers inbox). Confirm the admin
// can still submit to QC on them.
console.log('\n=== ROUGH-NUMBERS-IN-INBOX HEALTH CHECK ===\n')
const inInbox = openClaims.filter(c => c.needs_rough_numbers && c.rough_numbers_handoff_at)
let adminCount = 0
for (const c of inInbox) {
  const assignee = profById.get(c.assigned_to)
  if (assignee?.role === 'admin') adminCount++
}
console.log(`  ${inInbox.length} claim(s) have gone through the Rough Numbers inbox at some point.`)
console.log(`  ${adminCount} of those are currently assigned to an admin.`)
console.log(`  All should accept Submit → QC normally (rough-numbers branch skipped because handoff_at is set).`)
