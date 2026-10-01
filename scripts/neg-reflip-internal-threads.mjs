// Retroactively re-flip existing needs_response/unmatched threads whose
// latest message is from an "owner-side" sender (owner's email, same
// domain, or alias). These were marked needs_response because the old sync
// code required a literal ownerEmail match for isOutbound.
//
// Run: SUPABASE_SERVICE_ROLE_KEY='<key>' OWNER_EMAIL='henry@modernappraisers.com' node scripts/neg-reflip-internal-threads.mjs

import { createClient } from '@supabase/supabase-js'

const URL = 'https://ektglhdstobaipdqssjx.supabase.co'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const OWNER = (process.env.OWNER_EMAIL || 'henry@modernappraisers.com').toLowerCase()
const ALIASES = (process.env.IMAP_OWNER_ALIASES || '')
  .toLowerCase()
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)
if (!KEY) { console.error('SUPABASE_SERVICE_ROLE_KEY required'); process.exit(1) }
const supabase = createClient(URL, KEY, { auth: { persistSession: false } })

function isOwnerAddr(addr) {
  if (!addr) return false
  const lower = addr.toLowerCase()
  if (lower === OWNER) return true
  const ownerDomain = OWNER.split('@')[1] || ''
  if (ownerDomain && lower.endsWith(`@${ownerDomain}`)) return true
  return ALIASES.includes(lower)
}

console.log(`[reflip] owner=${OWNER}  aliases=${JSON.stringify(ALIASES)}`)

// Pull every needs_response / unmatched thread with its latest sender.
const { data: threads } = await supabase
  .from('email_threads')
  .select('id, status, latest_from_addr, last_inbound_at, last_outbound_at, latest_sent_at')
  .in('status', ['needs_response', 'unmatched'])
  .limit(2000)

console.log(`[reflip] scanning ${threads?.length ?? 0} threads`)

let flipped = 0
for (const t of threads ?? []) {
  if (!isOwnerAddr(t.latest_from_addr || '')) continue

  // Owner-side was the last to send → thread is 'responded' from the team's
  // perspective. Also pull last_outbound_at forward so future inbound logic
  // works correctly.
  const latestSent = t.latest_sent_at || t.last_inbound_at
  const patch = {
    status: 'responded',
    last_outbound_at: (latestSent && (!t.last_outbound_at || latestSent > t.last_outbound_at))
      ? latestSent
      : t.last_outbound_at,
  }
  const { error } = await supabase
    .from('email_threads')
    .update(patch)
    .eq('id', t.id)
  if (error) { console.error(`  ${t.id} failed:`, error.message); continue }
  flipped++
  console.log(`  ${t.id} ← ${t.latest_from_addr}  flipped to responded`)
}

console.log(`\n[reflip] moved ${flipped} thread(s) to responded`)
