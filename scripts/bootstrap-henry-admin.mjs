#!/usr/bin/env node
// Bootstrap the Henry Admin super-admin account.
// One-shot script — idempotent, safe to re-run.
//
// Usage: node scripts/bootstrap-henry-admin.mjs
//
// Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// Load .env.local manually — this script doesn't run under Next.
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
    })
)

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const EMAIL = 'henryaleksanyan@gmail.com'
const PASSWORD = 'Hratch33!'
const NAME = 'Henry Admin'

async function main() {
  // 1. Check if the auth user already exists.
  let userId = null
  const { data: listData, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (listErr) throw listErr
  const existing = listData.users.find(u => u.email?.toLowerCase() === EMAIL.toLowerCase())
  if (existing) {
    userId = existing.id
    console.log(`Auth user already exists: ${userId}`)
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
    })
    if (error) throw error
    userId = data.user.id
    console.log(`Created auth user: ${userId}`)
  }

  // 2. Upsert the profile row. Do NOT overwrite an existing name.
  const { data: existingProfile } = await admin
    .from('profiles')
    .select('id, name')
    .eq('id', userId)
    .maybeSingle()

  const nameToWrite = existingProfile?.name || NAME

  const { error: upsertErr } = await admin
    .from('profiles')
    .upsert({
      id: userId,
      email: EMAIL,
      name: nameToWrite,
      role: 'admin',
      is_super_admin: true,
      is_active: true,
      show_in_handling_appraiser_list: false,
      can_reassign_claims: true,
      can_edit_claim_info: true,
      can_create_claims: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' })
  if (upsertErr) throw upsertErr

  console.log(`Profile upserted for ${EMAIL} (name="${nameToWrite}", is_super_admin=true)`)
  console.log('Done. Henry can now log in.')
}

main().catch(err => {
  console.error('Bootstrap failed:', err)
  process.exit(1)
})
