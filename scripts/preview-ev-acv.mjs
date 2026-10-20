// Generate a sample Eagleview ACV PDF for local visual inspection.
// Requires the project to be built (imports from .next/... would need runtime
// wiring). Simpler: use tsx-style transpile on the fly via a require-hook
// isn't in the toolchain, so we manually re-import via the built .next output
// — OR duplicate the builder here. Simplest: point at the compiled JS after
// `npm run build`; but Next puts things under .next/server which is opaque.
//
// Cleanest: use the pre-existing pattern of scripts/debug-full-workflow.mjs —
// load pdf-lib directly and instantiate the builder module via dynamic import
// through the Next/tsx runtime. Since we don't have tsx, we shell out to
// `npx tsx` if available, otherwise fall back to the built app.

import { writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

// Preferred path: use tsx (comes bundled with Next.js's dev experience) or
// bun / deno if available. Fall back to spawn `node --experimental-loader
// tsx` via npx.
const child = spawnSync('npx', [
  '-y',
  'tsx',
  '--eval',
  `
import { buildEagleviewACVPdf } from './src/lib/acv/eagleview-acv-pdf.ts'
import { writeFileSync } from 'node:fs'

const claim = {
  maNumber: 'MA-EV-TEST-01',
  claimNumber: 'CL-2026-98765',
  negotiatingAppraiser: 'Henry Aleksanyan',
  dateOfLoss: '2026-08-14',
  clientType: 'Insured',
  clientName: 'Jane Q. Insured',
  insuredName: 'Jane Q. Insured',
  ownerPhone: '(555) 123-4567',
  ownerEmail: 'jane.insured@example.com',
  ownerAddress: '451 Oak Street, San Antonio, TX 78209',
  insuranceCompany: 'Nationwide Insurance',
  adjuster: 'Mark Johnson',
  adjusterPhone: '(555) 987-6543',
  adjusterEmail: 'mjohnson@nationwide.example',
  vin: '2HGFC2F58LH512345',
  year: 2020,
  make: 'Honda',
  model: 'Civic',
  trim: 'EX',
  engine: '2.0L I4',
  drivetrain: 'FWD',
  transmission: 'CVT',
  fuelType: 'Gasoline',
  mileage: 45892,
  zip: '78209',
  radius: 50,
}

const comps = [
  { id:'c1', vin:'X', price:19750, miles:41200, year:2020, make:'Honda', model:'Civic', trim:'EX',
    engine:'', drivetrain:'', transmission:'', fuelType:'', dealerName:'', dealerPhone:'',
    dealerCity:'', dealerState:'', photoUrl:'', heading:'', distanceMi:12, vdpUrl:'',
    mileageDiffRaw:-4692, mileageAdjDollar:328, yearDiffRaw:0, yearAdjDollar:0, compValue:20078 },
  { id:'c2', vin:'Y', price:18995, miles:52130, year:2020, make:'Honda', model:'Civic', trim:'EX',
    engine:'', drivetrain:'', transmission:'', fuelType:'', dealerName:'', dealerPhone:'',
    dealerCity:'', dealerState:'', photoUrl:'', heading:'', distanceMi:28, vdpUrl:'',
    mileageDiffRaw:6238, mileageAdjDollar:-436, yearDiffRaw:0, yearAdjDollar:0, compValue:18559 },
  { id:'c3', vin:'Z', price:20250, miles:38774, year:2020, make:'Honda', model:'Civic', trim:'EX-L',
    engine:'', drivetrain:'', transmission:'', fuelType:'', dealerName:'', dealerPhone:'',
    dealerCity:'', dealerState:'', photoUrl:'', heading:'', distanceMi:41, vdpUrl:'',
    mileageDiffRaw:-7118, mileageAdjDollar:498, yearDiffRaw:0, yearAdjDollar:0, compValue:20748 },
]

const adjustments = {
  vehicleHistory: 0, vehicleHistoryNote: '',
  priorDamages: 0,   priorDamagesNote: '',
  additions: 0,      additionsNote: '',
  deductions: -500,  deductionsNote: '',
  taxRate: 8.25,
  notes: 'Comps sourced within 50-mile radius. All 3 comparables are similar trim / year / mileage bracket. Private-party market adjustment applied.',
}

const acvAvg = (comps[0].compValue + comps[1].compValue + comps[2].compValue) / 3
const totalAdj = adjustments.vehicleHistory + adjustments.priorDamages + adjustments.additions + adjustments.deductions
const preTax = acvAvg + totalAdj
const tax = preTax * (adjustments.taxRate / 100)
const result = {
  comp1Value: comps[0].compValue,
  comp2Value: comps[1].compValue,
  comp3Value: comps[2].compValue,
  averageValue: acvAvg,
  totalAdjustments: totalAdj,
  taxAmount: tax,
  acv: preTax + tax,
}

const bytes = await buildEagleviewACVPdf(claim, comps, adjustments, result)
writeFileSync('backups/debug-2026-09-17/ev-acv-preview.pdf', bytes)
console.log('wrote', bytes.length, 'bytes to backups/debug-2026-09-17/ev-acv-preview.pdf')
`,
], { stdio: 'inherit', shell: true })

process.exit(child.status ?? 1)
