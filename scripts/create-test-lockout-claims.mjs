#!/usr/bin/env node
// Transient: build 4 test claims assigned to henry@modernappraisers.com for
// the status-request lockout demo. Each claim represents a different step of
// the 3-day/5-day timeline so the fire-nag script (run next) exercises all
// branches: fresh, 1st-nag, 2nd-nag, lockout.
//
// IDs all start with 'test-lockout-' so you can wipe them in one shot:
//   delete from acv_history where id like 'test-lockout-%';
//
// Usage: node scripts/create-test-lockout-claims.mjs

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import crypto from 'node:crypto'
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

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const HENRY_APPRAISER_ID = 'd968ce49-dc3e-4a72-b8ae-5bc7019d97ca' // henry@modernappraisers.com (Henry Aleksanyan)

const { data: companyRow, error: companyErr } = await sb
  .from('companies')
  .select('id, slug')
  .eq('slug', 'modern-appraisers')
  .maybeSingle()
if (companyErr || !companyRow) { console.error('Could not find Modern Appraisers:', companyErr?.message); process.exit(1) }

const now = new Date()
const daysAgo = (d) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000).toISOString()

const sharedClaim = (ma, cl, insured, vin, year, make, model) => ({
  maNumber: ma,
  claimNumber: cl,
  dateOfLoss: '2026-09-20',
  insuranceCompany: 'Test Insurance Co.',
  adjuster: 'Jane Doe',
  adjusterPhone: '(555) 555-0100',
  adjusterEmail: 'jdoe@testins.com',
  insuredName: insured,
  ownerAddress: '123 Main St, Phoenix, AZ 85001',
  ownerPhone: '(555) 555-0200',
  ownerEmail: 'owner@example.com',
  clientName: 'Test Insurance Co.',
  deductible: 500,
  vin,
  year,
  make,
  model,
  trim: 'Base',
  engine: '2.5L I4',
  drivetrain: 'FWD',
  transmission: '8-Speed Automatic',
  fuelType: 'Gasoline',
  mileage: 50000,
  zip: '85001',
  radius: 100,
  claimTypes: ['acv'],
})

const claims = [
  {
    tag: 'FRESH',
    id: 'test-lockout-fresh',
    ma: 'TEST-LOCK-A',
    claim: sharedClaim('TEST-LOCK-A', '26-LOCK-A', 'Fresh Test (no nag expected)', 'TLOCKA00000000001', 2024, 'Toyota', 'Camry'),
    assigned_at: daysAgo(0.01), // "just now" — well under 3-day threshold
    status_request_count: 0,
    last_status_request_at: null,
    status_lockout_at: null,
  },
  {
    tag: '1ST NAG',
    id: 'test-lockout-first',
    ma: 'TEST-LOCK-B',
    claim: sharedClaim('TEST-LOCK-B', '26-LOCK-B', 'First Nag Test (expects 1st nag)', 'TLOCKB00000000002', 2023, 'Honda', 'Accord'),
    assigned_at: daysAgo(10), // 10 calendar days = >= 3 business days regardless of weekend positioning
    status_request_count: 0,
    last_status_request_at: null,
    status_lockout_at: null,
  },
  {
    tag: '2ND NAG',
    id: 'test-lockout-second',
    ma: 'TEST-LOCK-C',
    claim: sharedClaim('TEST-LOCK-C', '26-LOCK-C', 'Second Nag Test (expects 2nd nag)', 'TLOCKC00000000003', 2022, 'Nissan', 'Altima'),
    assigned_at: daysAgo(12),
    status_request_count: 1,
    last_status_request_at: daysAgo(2), // >= 1 business day ago regardless of weekend
    status_lockout_at: null,
  },
  {
    tag: 'LOCKOUT',
    id: 'test-lockout-locked',
    ma: 'TEST-LOCK-D',
    claim: sharedClaim('TEST-LOCK-D', '26-LOCK-D', 'Lockout Test (expects status_lockout_at stamp)', 'TLOCKD00000000004', 2021, 'Ford', 'F-150'),
    assigned_at: daysAgo(14),
    status_request_count: 2,
    last_status_request_at: daysAgo(2),
    status_lockout_at: null,
  },
]

// Idempotent: delete any prior test-lockout- rows first so re-runs don't stack
await sb.from('acv_history').delete().like('id', 'test-lockout-%')

const nowIso = now.toISOString()
const todayDate = nowIso.slice(0, 10)

for (const c of claims) {
  const row = {
    id: c.id,
    user_id: HENRY_APPRAISER_ID,
    company_id: companyRow.id,
    date: `${todayDate}T00:00:00.000Z`,
    mode: 'comp-finder',
    vehicle: `${c.claim.year} ${c.claim.make} ${c.claim.model}`,
    vin: c.claim.vin,
    ma_number: c.ma,
    acv: 0,
    claim: c.claim,
    comps: [],
    adjustments: {},
    result: {},
    mileage_rate: 0,
    status: 'open',
    workflow_stage: 'main',
    workflow_stage_set_at: nowIso,
    assigned_to: HENRY_APPRAISER_ID,
    assigned_at: c.assigned_at,
    starred: false,
    status_request_count: c.status_request_count,
    last_status_request_at: c.last_status_request_at,
    status_lockout_at: c.status_lockout_at,
  }
  const { error } = await sb.from('acv_history').insert(row)
  if (error) { console.error(`Insert ${c.id} failed:`, error.message); process.exit(1) }
  console.log(`  [${c.tag.padEnd(7)}]  ${c.id}   MA ${c.ma}   anchor=${c.assigned_at.slice(0, 10)}   count=${c.status_request_count}`)
}

console.log(`\nAll 4 test claims created, assigned to henry@modernappraisers.com (Henry Aleksanyan).`)
console.log(`\nNext: node scripts/fire-test-nag-cron.mjs  — processes only these 4 claim IDs.`)
console.log(`To wipe later: delete from acv_history where id like 'test-lockout-%';`)
