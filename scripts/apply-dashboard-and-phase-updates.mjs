// One-off: rename the 'main' dashboard label to 'W/Appraiser' and seed the
// 'pending_information' status phase. Idempotent. Uses the service-role key.
// Run with: node scripts/apply-dashboard-and-phase-updates.mjs

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// Load .env.local manually (no dotenv dep needed for a one-off).
const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '..', '.env.local')
if (existsSync(envPath)) {
  const raw = readFileSync(envPath, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be in .env.local')
  process.exit(1)
}
const db = createClient(url, key, { auth: { persistSession: false } })

async function main() {
  // 1. Rename the 'main' dashboard tab.
  const { error: dashErr, data: dashData } = await db
    .from('dashboard_configs')
    .update({ label: 'W/Appraiser' })
    .eq('code', 'main')
    .select('code, label')
  if (dashErr) { console.error('dashboard update failed:', dashErr); process.exit(1) }
  console.log('dashboard_configs rename:', dashData)

  // 2. Insert the 'pending_information' status phase. Idempotent via on_conflict.
  const { error: phaseErr, data: phaseData } = await db
    .from('status_phase_configs')
    .upsert(
      {
        code: 'pending_information',
        label: 'Pending Information',
        color: 'blue',
        sort_order: 100,
        archived: false,
      },
      { onConflict: 'code' }
    )
    .select('code, label, color')
  if (phaseErr) { console.error('status phase upsert failed:', phaseErr); process.exit(1) }
  console.log('status_phase_configs upsert:', phaseData)

  console.log('\n✓ done')
}

main().catch((e) => { console.error(e); process.exit(1) })
