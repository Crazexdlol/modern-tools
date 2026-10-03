// Verify each parser against the real PDF samples by extracting text with
// pdftotext (same text pdfjs-dist would produce for well-formed PDFs) and
// feeding it to the parser. Prints the resulting ParsedClaim shape so we can
// eyeball what the parser gets right / wrong.
//
// Usage: node scripts/verify-parsers.mjs

import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SAMPLES = resolve(__dirname, '_samples')

function extractText(pdfPath) {
  // -layout preserves columns; without it, two-column CCC labels/values interleave randomly.
  return execSync(`pdftotext -layout "${pdfPath}" -`, { encoding: 'utf8' })
}

const { parseClaim } = await import('../src/lib/acv/parsers/index.ts')
const { detectFormat } = await import('../src/lib/acv/parsers/detect.ts')

const files = [
  { label: 'cl.pdf (Modern Appraisers CL format)',   path: `${SAMPLES}/cl.pdf` },
  { label: 'assignment-a.pdf (Eagle View, USAA)',     path: `${SAMPLES}/assignment-a.pdf` },
  { label: 'assignment-b.pdf (Eagle View, Sedgwick)', path: `${SAMPLES}/assignment-b.pdf` },
  { label: 'ccc-evaluation.pdf (CCC ONE / GEICO Kia)',path: `${SAMPLES}/ccc-evaluation.pdf` },
  { label: 'est-totalloss.pdf (CCC ONE / GEICO BMW)', path: `${SAMPLES}/est-totalloss.pdf` },
]

for (const f of files) {
  console.log('\n' + '='.repeat(60))
  console.log(f.label)
  console.log('='.repeat(60))
  const text = extractText(f.path)
  const format = detectFormat(text)
  console.log('Detected format:', format)
  const parsed = parseClaim(text)
  const important = {
    format: parsed.format,
    maNumber: parsed.maNumber,
    claimNumber: parsed.claimNumber,
    dateOfLoss: parsed.dateOfLoss,
    dateReceived: parsed.dateReceived,
    clientType: parsed.clientType,
    clientName: parsed.clientName,
    insuredName: parsed.insuredName,
    claimantName: parsed.claimantName,
    insuranceCompany: parsed.insuranceCompany,
    adjuster: parsed.adjuster,
    deductible: parsed.deductible,
    vin: parsed.vin,
    year: parsed.year,
    make: parsed.make,
    model: parsed.model,
    mileage: parsed.mileage,
    zip: parsed.zip,
    ownerAddress: parsed.ownerAddress,
  }
  console.log(JSON.stringify(important, null, 2))
}
