#!/usr/bin/env node
// One-off: create a test claim for Henry to play with the Send Back flow.
// Idempotent on MA number — re-running updates the existing row rather than
// stacking duplicates.
//
// Usage: node scripts/create-test-claim.mjs

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

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

const HENRY_USER_ID = 'd968ce49-dc3e-4a72-b8ae-5bc7019d97ca'
const MA_NUMBER = 'TEST-SENDBACK-001'

// Resolve Modern Appraisers company so the claim lands under Henry's active
// company and shows up for him by default.
const { data: companyRow, error: companyErr } = await sb
  .from('companies')
  .select('id, slug')
  .eq('slug', 'modern-appraisers')
  .maybeSingle()
if (companyErr || !companyRow) {
  console.error('Could not find Modern Appraisers (slug=modern-appraisers):', companyErr?.message)
  process.exit(1)
}

const nowIso = new Date().toISOString()
const todayDate = nowIso.slice(0, 10)
const dolDate = '2026-09-20'

const claimJson = {
  maNumber: MA_NUMBER,
  claimNumber: '26-TEST-00001',
  dateOfLoss: dolDate,
  insuranceCompany: 'First Chicago Ins. Co.',
  adjuster: 'Jack Smith',
  adjusterPhone: '(555) 555-0100',
  adjusterEmail: 'jsmith@firstchicagoins.com',
  insuredName: 'Test Driver (Playground)',
  ownerAddress: '123 Main St, Phoenix, AZ 85001',
  ownerPhone: '(555) 555-0200',
  ownerEmail: 'test.driver@example.com',
  clientName: 'First Chicago Ins. Co.',
  deductible: 500,
  vin: '4T1G11AK3NU012345',
  year: 2022,
  make: 'Toyota',
  model: 'Camry',
  trim: 'SE',
  engine: '2.5L I4',
  drivetrain: 'FWD',
  transmission: '8-Speed Automatic',
  fuelType: 'Gasoline',
  mileage: 24100,
  zip: '85001',
  radius: 100,
  claimTypes: ['acv'],
}

// Check if the MA already exists to keep this idempotent.
const { data: existing } = await sb
  .from('acv_history')
  .select('id, ma_number')
  .eq('ma_number', MA_NUMBER)
  .maybeSingle()

if (existing) {
  // Reset it back to a clean Main-stage, assigned-to-Henry state so he can
  // repeat the Submit → QC → Send Back cycle on re-runs.
  const { error: upErr } = await sb
    .from('acv_history')
    .update({
      status: 'open',
      workflow_stage: 'main',
      workflow_stage_set_at: nowIso,
      assigned_to: HENRY_USER_ID,
      assigned_at: nowIso,
      submitted_at: null,
      submitted_by: null,
      status_phase: null,
      status_phase_set_at: null,
      closed_at: null,
      close_reason: null,
      claim: claimJson,
    })
    .eq('id', existing.id)
  if (upErr) {
    console.error('Reset failed:', upErr.message)
    process.exit(1)
  }
  console.log(`Reset existing test claim ${existing.id} (MA ${MA_NUMBER}) → Main / assigned to Henry.`)
  process.exit(0)
}

const insertRow = {
  id: `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
  user_id: HENRY_USER_ID,
  company_id: companyRow.id,
  date: `${todayDate}T00:00:00.000Z`,
  mode: 'comp-finder',
  vehicle: '2022 Toyota Camry SE',
  vin: claimJson.vin,
  ma_number: MA_NUMBER,
  acv: 0,
  claim: claimJson,
  comps: [],
  adjustments: {},
  result: {},
  mileage_rate: 0,
  status: 'open',
  workflow_stage: 'main',
  workflow_stage_set_at: nowIso,
  assigned_to: HENRY_USER_ID,
  assigned_at: nowIso,
  starred: false,
}

const { error: insErr } = await sb.from('acv_history').insert(insertRow)
if (insErr) {
  console.error('Insert failed:', insErr.message)
  process.exit(1)
}
console.log(`Created test claim ${insertRow.id} (MA ${MA_NUMBER}) → Main / assigned to Henry.`)
