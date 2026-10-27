#!/usr/bin/env node
// ACV-only test matrix covering every Complete-Report / Submit / rough-
// numbers scenario. Nukes prior TEST-* claims first, then rebuilds. All
// assigned to Henry (appraiser). Idempotent on MA#.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import crypto from 'node:crypto'
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

const HENRY_ID = 'd968ce49-dc3e-4a72-b8ae-5bc7019d97ca'
const { data: company } = await sb.from('companies').select('id').eq('slug', 'modern-appraisers').maybeSingle()
if (!company) { console.error('company not found'); process.exit(1) }

const now = new Date().toISOString()

// Wipe any lingering TEST-* claims so the matrix is a clean rebuild.
const { data: existing } = await sb.from('acv_history').select('id, ma_number').like('ma_number', 'TEST-%')
for (const r of existing ?? []) {
  await sb.from('claim_stage_events').delete().eq('claim_id', r.id)
  await sb.from('messages').delete().eq('claim_id', r.id)
  await sb.from('acv_history').delete().eq('id', r.id)
}
if ((existing ?? []).length > 0) {
  console.log(`cleaned up ${existing.length} prior TEST-* claim(s)`)
}

const SCENARIOS = [
  {
    ma: 'TEST-ACV-A-PICKER',
    label: 'A — RTA + Alex negotiating (picker)',
    vehicle: '2022 Toyota Camry SE',
    vin: '4T1G11AK3NU000001',
    make: 'Toyota', model: 'Camry', year: 2022,
    claimTypes: ['acv', 'rta'],
    negotiatingAppraiser: 'Alex Aleksanyan',
    needsRoughNumbers: false,
    roughNumbersHandoffAt: null,
    expect: 'Complete Report ▾ dropdown. Alex at top, alphabetical list below. Pick → claim reassigns.',
  },
  {
    ma: 'TEST-ACV-B-SUBMIT-SAME',
    label: 'B — RTA + negotiator = assignee',
    vehicle: '2021 Honda Civic LX',
    vin: '2HGFC2F57MH000002',
    make: 'Honda', model: 'Civic', year: 2021,
    claimTypes: ['acv', 'rta'],
    negotiatingAppraiser: 'Henry Aleksanyan',
    needsRoughNumbers: false,
    roughNumbersHandoffAt: null,
    expect: 'Green Submit for QC. No handoff needed — you ARE the negotiator.',
  },
  {
    ma: 'TEST-ACV-C-SUBMIT-NO-NEG',
    label: 'C — RTA + no negotiator set',
    vehicle: '2020 Nissan Altima SV',
    vin: '1N4BL4BV4LC000003',
    make: 'Nissan', model: 'Altima', year: 2020,
    claimTypes: ['acv', 'rta'],
    negotiatingAppraiser: '',
    needsRoughNumbers: false,
    roughNumbersHandoffAt: null,
    expect: 'Green Submit for QC. Negotiator empty → nothing to hand off to.',
  },
  {
    ma: 'TEST-ACV-D-ROUGH-PENDING',
    label: 'D — RTA + rough pending + Alex',
    vehicle: '2024 Hyundai Elantra SE',
    vin: 'KMHLL4AG7RU000005',
    make: 'Hyundai', model: 'Elantra', year: 2024,
    claimTypes: ['acv', 'rta'],
    negotiatingAppraiser: 'Alex Aleksanyan',
    needsRoughNumbers: true,
    roughNumbersHandoffAt: null,
    expect: 'Green Submit Rough Numbers. Routes to Wendy, phase "Rough Numbers", cycle paused. Alex not touched.',
  },
  {
    ma: 'TEST-ACV-E-ROUGH-PENDING-NO-NEG',
    label: 'E — RTA + rough pending + no negotiator',
    vehicle: '2023 Mazda 3 Preferred',
    vin: 'JM1BPAKL6P1000006',
    make: 'Mazda', model: '3', year: 2023,
    claimTypes: ['acv', 'rta'],
    negotiatingAppraiser: '',
    needsRoughNumbers: true,
    roughNumbersHandoffAt: null,
    expect: 'Green Submit Rough Numbers. Identical outcome to D.',
  },
  {
    ma: 'TEST-ACV-F-ROUGH-POST',
    label: 'F — RTA + rough done + Alex',
    vehicle: '2022 Chevrolet Malibu LT',
    vin: '1G1ZD5ST3PF000007',
    make: 'Chevrolet', model: 'Malibu', year: 2022,
    claimTypes: ['acv', 'rta'],
    negotiatingAppraiser: 'Alex Aleksanyan',
    needsRoughNumbers: true,
    roughNumbersHandoffAt: now,
    expect: 'Complete Report ▾ dropdown returns. Rough handoff done → gate reopens.',
  },
  {
    ma: 'TEST-ACV-G-REPORT-ONLY',
    label: 'G — NO RTA + Alex negotiating (report-only)',
    vehicle: '2023 Subaru Outback Premium',
    vin: '4S4BTAFC3P3000008',
    make: 'Subaru', model: 'Outback', year: 2023,
    claimTypes: ['acv'],
    negotiatingAppraiser: 'Alex Aleksanyan',
    needsRoughNumbers: false,
    roughNumbersHandoffAt: null,
    expect: 'Green Submit for QC. Alex is on file (licensing display) but no RTA = no handoff. Submit → QC directly.',
  },
]

for (const s of SCENARIOS) {
  const claimJson = {
    maNumber: s.ma,
    claimNumber: s.ma.replace(/[^0-9A-Z]/g, '').slice(0, 20) || 'TEST',
    dateOfLoss: '2026-09-15',
    insuranceCompany: 'TEST — Progressive',
    adjuster: 'Test Adjuster',
    adjusterPhone: '(555) 555-0100',
    adjusterEmail: 'adj@example.com',
    insuredName: `TEST — ${s.label}`,
    ownerName: `TEST — ${s.label}`,
    ownerAddress: '123 Test St, Phoenix, AZ 85001',
    ownerPhone: '(555) 555-0200',
    ownerEmail: 'test@example.com',
    clientName: 'TEST — Progressive',
    deductible: 500,
    vin: s.vin,
    year: s.year,
    make: s.make,
    model: s.model,
    trim: 'LX',
    engine: '2.0L I4',
    drivetrain: 'FWD',
    transmission: 'Automatic',
    fuelType: 'Gasoline',
    mileage: 25000,
    zip: '85001',
    radius: 100,
    claimTypes: s.claimTypes,
    negotiatingAppraiser: s.negotiatingAppraiser,
    needsRoughNumbers: s.needsRoughNumbers,
  }

  const row = {
    id: `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    user_id: HENRY_ID,
    company_id: company.id,
    date: now,
    mode: 'comp-finder',
    vehicle: s.vehicle,
    vin: s.vin,
    ma_number: s.ma,
    acv: 0,
    claim: claimJson,
    comps: [],
    adjustments: {},
    result: {},
    mileage_rate: 0,
    status: 'open',
    workflow_stage: 'main',
    workflow_stage_set_at: now,
    assigned_to: HENRY_ID,
    assigned_at: now,
    starred: false,
    needs_rough_numbers: s.needsRoughNumbers,
    rough_numbers_handoff_at: s.roughNumbersHandoffAt,
    status_phase: s.needsRoughNumbers && s.roughNumbersHandoffAt ? null : null, // phase cleared post-reassign in real flow; left null here
    status_phase_set_at: null,
    submitted_at: null,
    submitted_by: null,
    close_reason: null,
    closed_at: null,
  }

  const { error } = await sb.from('acv_history').insert(row)
  if (error) {
    console.error(`[${s.ma}] ${error.message}`)
    continue
  }
  console.log(`CREATED  ${s.ma.padEnd(32)}  ${s.label}`)
}

console.log('\nAll claims: ACV only, Main stage, open, assigned to Henry.')
console.log('MA# prefix TEST-ACV-* — delete with: node scripts/delete-test-matrix.mjs')
