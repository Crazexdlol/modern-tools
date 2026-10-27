#!/usr/bin/env node
// Deletes the TEST-* matrix claims created by create-test-matrix.mjs.
// Also wipes their claim_stage_events + messages (not CASCADE'd).

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

const { data: rows } = await sb.from('acv_history').select('id, ma_number').like('ma_number', 'TEST-%')
if (!rows || rows.length === 0) { console.log('nothing to delete'); process.exit(0) }

for (const r of rows) {
  await sb.from('claim_stage_events').delete().eq('claim_id', r.id)
  await sb.from('messages').delete().eq('claim_id', r.id)
  const { error } = await sb.from('acv_history').delete().eq('id', r.id)
  if (error) console.error(`[${r.ma_number}] ${error.message}`)
  else console.log(`deleted ${r.ma_number}`)
}
