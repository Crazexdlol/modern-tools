import type { ParsedClaim } from './types'

// Parser for CCC ONE Market Valuation / full-report PDFs.
//
// CCC reports vary in format across report types (Market Valuation, Verifacts,
// Full Report) and across insurer templates. This parser is best-effort — it
// extracts the fields that appear reliably across the common variants and
// leaves the rest empty for the user to fill. Labels documented in
// src/lib/acv/claim-field-mapping.ts (CCC_FIELDS).
//
// Known limitations:
//   - Owner address is captured as-provided (no city/state/zip split).
//   - Deductible is rarely in CCC reports — left undefined.
//   - Claim number formatting varies; we take whatever follows the label.
//
// This parser can be refined once we have more CCC samples. Add new label
// variants here AND to CCC_FIELDS in claim-field-mapping.ts.

function grab(text: string, label: string): string {
  // Captures everything after `<label>:` up to a newline, two spaces, or next
  // label-like string. Handles both colon and no-colon variants.
  const re = new RegExp(
    `${label.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\s*:?\\s*([^\\n\\r]+?)(?=\\s{2,}[A-Z][a-z]|$|\\n)`,
    'i',
  )
  const m = text.match(re)
  return m ? m[1].trim() : ''
}

function grabFirst(text: string, labels: string[]): string {
  for (const label of labels) {
    const v = grab(text, label)
    if (v) return v
  }
  return ''
}

function parseNumber(raw: string): number {
  const cleaned = raw.replace(/[^0-9.]/g, '')
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : 0
}

export function parseCcc(text: string): ParsedClaim {
  const claimNumber = grabFirst(text, ['Claim Number', 'Claim #', 'Claim No'])
  const insuranceCompany = grabFirst(text, ['Insurance Company', 'Carrier', 'Insurer'])
  const dateOfLossRaw = grabFirst(text, ['Date of Loss', 'Loss Date'])
  let dateOfLoss = ''
  if (dateOfLossRaw) {
    const d = new Date(dateOfLossRaw)
    if (!Number.isNaN(d.getTime())) {
      dateOfLoss = d.toISOString().split('T')[0]
    }
  }

  const vin = grabFirst(text, ['VIN', 'Vehicle Identification Number'])
  const year = parseNumber(grabFirst(text, ['Year', 'Vehicle Year'])) || 0
  const make = grabFirst(text, ['Make'])
  const model = grabFirst(text, ['Model'])
  const mileage = parseNumber(grabFirst(text, ['Odometer', 'Mileage'])) || 0

  const insuredName = grabFirst(text, ['Owner Name', 'Owner', 'Insured Name', 'Insured'])
  const ownerPhone = grabFirst(text, ['Phone', 'Owner Phone'])
  const ownerAddress = grabFirst(text, ['Address'])

  const na = (v: string) => v || 'N/A'

  return {
    format: 'ccc',
    maNumber: '',
    claimNumber: na(claimNumber),
    dateOfLoss,
    dateReceived: '',
    clientType: 'Insured',
    clientName: 'N/A',
    insuredName: na(insuredName),
    ownerPhone: na(ownerPhone),
    ownerEmail: 'N/A',
    ownerAddress: na(ownerAddress),
    // CCC reports don't carry a separate claimant block — leave empty so the
    // UI stays blank rather than mirroring the insured.
    claimantName: '',
    claimantPhone: '',
    claimantEmail: '',
    claimantAddress: '',
    insuranceCompany: na(insuranceCompany),
    adjuster: 'N/A',
    adjusterPhone: 'N/A',
    adjusterEmail: 'N/A',
    vin: na(vin),
    year,
    make: na(make),
    model: na(model),
    mileage,
    zip: 'N/A',
    notes: '',
  }
}
