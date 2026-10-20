import type { ParsedClaim } from './types'

// Parser for CCC ONE Market Valuation PDFs. The REPORT SUMMARY page uses a
// two-column layout where right-column VALUES appear in reading order ABOVE
// their left-column LABELS, so label-based grab doesn't work cleanly. We
// instead pattern-match known value shapes (VIN, dates, "LastName, FirstName",
// year make model) within each section slice.
//
// Verified against: ccc-evaluation.pdf (GEICO/Kia Niro), est-totalloss.pdf
// (GEICO/BMW X7). See scripts/_samples/ for both samples.

function sliceBetween(text: string, startRe: RegExp, endRe: RegExp): string {
  const s = text.search(startRe)
  if (s < 0) return ''
  const rest = text.slice(s)
  const e = rest.slice(1).search(endRe)
  if (e < 0) return rest
  return rest.slice(0, e + 1)
}

// "LastName, FirstName" style — common in CCC for owner, adjuster, appraiser.
// Flips to "FirstName LastName" for display.
function flipLastFirst(raw: string): string {
  const m = raw.trim().match(/^([A-Z][a-zA-Z'-]+),\s*(.+)$/)
  if (!m) return raw.trim()
  return `${m[2].trim()} ${m[1].trim()}`
}

// Find a VIN anywhere in the text. VINs are 17 chars, no I/O/Q, uppercase.
function findVin(text: string): string {
  const m = text.match(/\b([A-HJ-NPR-Z0-9]{17})\b/)
  return m ? m[1] : ''
}

function parseDollar(raw: string): number | undefined {
  const n = Number(raw.replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) && n > 0 ? n : undefined
}

function parseDateStr(raw: string): string {
  // Accepts MM/DD/YYYY (with or without a trailing timestamp).
  const m = raw.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (!m) return ''
  const [, mm, dd, yyyy] = m
  return `${yyyy}-${mm}-${dd}`
}

function extractInsuranceCompany(text: string): string {
  // CCC reports lead with "Prepared for <COMPANY>" on page 1.
  const m = text.match(/Prepared for\s+([^\n]+)/i)
  return m ? m[1].trim() : ''
}

export function parseCcc(text: string): ParsedClaim {
  const insuranceCompany = extractInsuranceCompany(text)

  // -- CLAIM INFORMATION section (owner name/addr/city, vehicle, 2 dates) --
  const claimSection = sliceBetween(
    text,
    /CLAIM INFORMATION/i,
    /INSURANCE INFORMATION|VALUATION SUMMARY|REPORT SUMMARY/i,
  )

  // Owner name: look for the "LastName, FirstName" line.
  const ownerLine = claimSection.match(/\n\s{10,}([A-Z][a-zA-Z'-]+,\s*[A-Z][a-zA-Z\s'-]+)\n/)
  const ownerName = ownerLine ? flipLastFirst(ownerLine[1]) : ''

  // Street address: right-column line starting with a street number.
  const streetLine = claimSection.match(/\n\s{10,}(\d+\s+[A-Za-z][^\n]+)\n/)
  const street = streetLine ? streetLine[1].trim() : ''

  // City/state/zip: right-column line matching "City, ST ZIPCODE".
  const cszLine = claimSection.match(/\n\s{10,}([A-Za-z][A-Za-z\s]+?,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?)\n/)
  const csz = cszLine ? cszLine[1].trim() : ''

  const ownerAddress = [street, csz].filter(Boolean).join(', ')

  // Vehicle: right-column line matching "YYYY Make Model...".
  const vehicleLine = claimSection.match(/\n\s{10,}((?:19|20)\d{2}\s+[A-Z][A-Za-z0-9]+\s+[^\n]+)\n/)
  const vehicleStr = vehicleLine ? vehicleLine[1].trim() : ''
  const vehicleParts = vehicleStr.match(/^(\d{4})\s+(\S+)\s+(.+)$/)
  const year = vehicleParts ? parseInt(vehicleParts[1], 10) : 0
  const make = vehicleParts ? vehicleParts[2] : ''
  const model = vehicleParts ? vehicleParts[3] : ''

  // Dates: Loss Incident Date and Claim Reported appear as the last two
  // date-only lines inside the section (in that order).
  const sectionDates = Array.from(claimSection.matchAll(/\n\s{10,}(\d{2}\/\d{2}\/\d{4})\s*\n/g)).map(m => m[1])
  const dateOfLoss = sectionDates.length >= 1 ? parseDateStr(sectionDates[0]) : ''
  const dateReceived = sectionDates.length >= 2 ? parseDateStr(sectionDates[1]) : ''

  // -- INSURANCE INFORMATION section (ref#, claim#, adjuster, appraiser, odometer) --
  const insSection = sliceBetween(
    text,
    /INSURANCE INFORMATION/i,
    /VALUATION SUMMARY|REPORT SUMMARY|Prepared for/i,
  )

  // Right-column values stacked in order. Capture them, then pair with
  // left-column labels (Report Reference Number, Claim Reference, Adjuster,
  // Appraiser (optional), Odometer, Last Updated).
  const insValues = Array.from(insSection.matchAll(/\n\s{10,}([^\n]+?)\s*\n/g)).map(m => m[1].trim())
  const insLabels = Array.from(insSection.matchAll(/\n(Report Reference Number|Claim Reference|Adjuster|Appraiser|Odometer|Last Updated)\s*\n/g)).map(m => m[1])

  // Pair in order. If there are fewer values than labels (Appraiser is
  // frequently absent), labels after the mismatch map to the next value.
  const insMap = new Map<string, string>()
  for (let i = 0; i < Math.min(insValues.length, insLabels.length); i++) {
    insMap.set(insLabels[i], insValues[i])
  }

  const claimNumber = insMap.get('Claim Reference') || ''
  const adjuster = flipLastFirst(insMap.get('Adjuster') || '')
  const odometerRaw = insMap.get('Odometer') || ''
  const mileage = parseInt(odometerRaw.replace(/,/g, ''), 10) || 0

  const vin = findVin(text)

  // Deductible appears in the VALUATION SUMMARY on page 1 — look for the
  // line starting with "- $" before the "Deductible*" label.
  const deductibleMatch = text.match(/-\s*\$\s*([\d,.]+)\s*\n\s*[A-Za-z\s]*Deductible/i)
  const deductible = deductibleMatch ? parseDollar(deductibleMatch[1]) : undefined

  const na = (v: string) => v || 'N/A'

  return {
    format: 'ccc',
    maNumber: '',
    claimNumber: na(claimNumber),
    dateOfLoss,
    dateReceived,
    clientType: 'Insured',
    clientName: 'N/A',
    insuredName: na(ownerName),
    // CCC reports surface an "Owner" field; same value drives both the
    // Owner chip and the Insured field.
    ownerName: na(ownerName),
    ownerPhone: 'N/A',
    ownerEmail: 'N/A',
    ownerAddress: na(ownerAddress),
    // CCC reports don't carry a separate claimant block — leave empty so the
    // UI stays blank rather than mirroring the insured.
    claimantName: '',
    claimantPhone: '',
    claimantEmail: '',
    claimantAddress: '',
    insuranceCompany: na(insuranceCompany),
    adjuster: na(adjuster),
    adjusterPhone: 'N/A',
    adjusterEmail: 'N/A',
    deductible,
    vin: na(vin),
    year,
    make: na(make),
    model: na(model),
    mileage,
    zip: '',
    notes: '',
  }
}
