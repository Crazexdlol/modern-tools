#!/usr/bin/env node
// Seeds can_submit_without_handoff=true for the two users Henry wants to
// bypass the Complete-Report handoff: Henry Aleksanyan (appraiser account)
// and George Aleksanyan. Everyone else keeps the default (false).
//
// Run AFTER migration-submit-without-handoff.sql has been applied in the
// Supabase SQL editor.
//
// Usage: node scripts/seed-submit-without-handoff.mjs

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dirname, '..', '.env.local')
const envText = readFileSync(envPath, 'utf8')
const env = Object.fromEntries(
  envText.split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .map(line => {
      const eq = line.indexOf('=')
      return [line.slice(0, eq), line.slice(eq + 1).replace(/^"|"$/g, '')]
    }),
)

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const GRANTEES = [
  { id: 'd968ce49-dc3e-4a72-b8ae-5bc7019d97ca', label: 'Henry Aleksanyan (henry@modernappraisers.com)' },
  { id: '173afcb1-1428-4de1-ac12-c3f3f6e03423', label: 'George Aleksanyan (george@modernappraisers.com)' },
]

for (const g of GRANTEES) {
  const { error } = await sb
    .from('profiles')
    .update({ can_submit_without_handoff: true, updated_at: new Date().toISOString() })
    .eq('id', g.id)
  if (error) {
    console.error(`FAIL: ${g.label} — ${error.message}`)
    process.exitCode = 1
  } else {
    console.log(`GRANTED: ${g.label}`)
  }
}
