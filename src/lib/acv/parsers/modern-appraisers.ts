import type { ParsedClaim } from './types'

// Labels used as stop-words for the "Label: Value" regex.
const LABELS = [
  'File #', 'Company', 'Claim Number', 'Policy Number', 'Adjuster',
  'Adjuster Phone', 'Adjuster Email', 'Deductible Amount', 'Date of Loss',
  'Type of Loss', 'Claim For', 'Insured Name', 'Business Name',
  'First Name', 'Last Name', 'Contact Name', 'Address', 'City', 'State',
  'Zip', 'Client Email', 'Mobile Phone', 'Home Phone', 'Work Phone',
  'Location', 'Location Name', 'Location Phone', 'Year', 'Make', 'Model',
  'VIN #', 'VIN', 'License Plate', 'Color', 'Mileage', 'Appraiser',
  'Phone', 'Appraiser Zip', 'Date Created', 'Date Assigned',
  'Appt Date/Time', 'Type of Claim', 'Appointment Set', 'Assignment Type',
  'Unit Type',
]

// Section headers that also act as stop-words (no colon after them).
const SECTION_HEADERS = [
  'Insurance Information', 'Owner Information', 'Location Information',
  'Vehicle Information', 'Appraisal Information', 'Damage', 'Instructions',
]

const LABEL_STOP = LABELS
  .map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|')

const SECTION_STOP = SECTION_HEADERS
  .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|')

const ALL_STOP = `(?:(?:${LABEL_STOP})\\s*:|(?:${SECTION_STOP}))`

function grab(text: string, label: string): string {
  const re = new RegExp(
    label + '\\s*:\\s*(.*?)(?=' + ALL_STOP + '|\\n|$)',
    'i'
  )
  const m = text.match(re)
  return m ? m[1].trim() : ''
}

function buildAddress(section: string): string {
  const address = grab(section, 'Address')
  const city = grab(section, 'City')
  const state = grab(section, 'State')
  const zip = grab(section, 'Zip')
  if (city && state && zip) {
    return `${address ? address + ', ' : ''}${city}, ${state} ${zip}`
  }
  return [address, city, state, zip].filter(Boolean).join(', ')
}

function grabZip(text: string, ownerSection: string): string {
  if (ownerSection) {
    const z = grab(ownerSection, 'Zip')
    if (z && /^\d{5}/.test(z)) return z.slice(0, 5)
  }
  const locSection =
    text.match(/Location Information[\s\S]*?(?=Vehicle Information|Appraisal Information|$)/i)?.[0]
  if (locSection) {
    const z = grab(locSection, 'Zip')
    if (z && /^\d{5}/.test(z)) return z.slice(0, 5)
  }
  const z = grab(text, 'Zip')
  if (z && /^\d{5}/.test(z)) return z.slice(0, 5)
  return ''
}

// Parses text extracted from a Modern Appraisers assignment PDF. Preserves
// the existing behaviour of parseClaimText in src/lib/parse-claim-pdf.ts —
// this is the extract of that function, unchanged except for the two new
// (empty) fields required by ParsedClaim: claimant* and notes, plus the
// `format` discriminator. `na()` (fill empty with 'N/A') behaviour retained.
export function parseModernAppraisers(text: string): ParsedClaim {
  const ownerSection =
    text.match(/Owner Information[\s\S]*?(?=Location Information|Vehicle Information|$)/i)?.[0] || ''
  const vehicleSection =
    text.match(/Vehicle Information[\s\S]*?(?=Appraisal Information|Damage|$)/i)?.[0] || ''
  const insuranceSection =
    text.match(/Insurance Information[\s\S]*?(?=Owner Information|$)/i)?.[0] || text
  const appraisalSection =
    text.match(/Appraisal Information[\s\S]*?(?=Damage|Vehicle Information|$)/i)?.[0] || ''

  const maNumber = grab(text, 'File #')

  let insuranceCompany = ''
  const companyMatch = insuranceSection.match(/Company\s+(.+?)(?=Claim Number|Policy Number|\n)/i)
  if (companyMatch) insuranceCompany = companyMatch[1].trim()

  const claimNumber = grab(insuranceSection, 'Claim Number')
  const adjuster = grab(insuranceSection, 'Adjuster(?! Phone| Email| Zip)')
  const adjusterPhone = grab(insuranceSection, 'Adjuster Phone')

  const dolRaw = grab(text, 'Date of Loss')
  let dateOfLoss = ''
  if (dolRaw) {
    const d = new Date(dolRaw)
    if (!isNaN(d.getTime())) {
      dateOfLoss = d.toISOString().split('T')[0]
    }
  }

  const dcRaw =
    grab(appraisalSection || text, 'Date Created') ||
    grab(appraisalSection || text, 'Date Assigned')
  let dateReceived = ''
  if (dcRaw) {
    const cleaned = dcRaw.replace(/\s+\d{1,2}:\d{2}(:\d{2})?\s*(AM|PM)?.*$/i, '').trim()
    const d = new Date(cleaned)
    if (!isNaN(d.getTime())) {
      dateReceived = d.toISOString().split('T')[0]
    }
  }

  const claimForRaw = grab(text, 'Claim For')
  const clientType: 'Insured' | 'Claimant' =
    claimForRaw.toLowerCase().includes('claimant') ? 'Claimant' : 'Insured'

  let insuredName = grab(text, 'Insured Name')
  insuredName = insuredName.replace(/\s*(Owner Information|Location Information|Vehicle Information).*$/i, '').trim()

  let clientName = grab(ownerSection || text, 'Business Name')
  clientName = clientName
    .replace(/\s*(First Name|Last Name|Contact).*$/i, '')
    .replace(/\b(ACV|DV)\b/gi, '')
    .trim()

  const firstName = grab(ownerSection || text, 'First Name')
  const lastName = grab(ownerSection || text, 'Last Name')

  const ownerAddress = buildAddress(ownerSection || text)
  const ownerPhone =
    grab(ownerSection || text, 'Mobile Phone') ||
    grab(ownerSection || text, 'Home Phone') ||
    grab(ownerSection || text, 'Work Phone')
  const ownerEmail = grab(ownerSection || text, 'Client Email')

  const year = parseInt(grab(vehicleSection || text, 'Year')) || 0
  const make = grab(vehicleSection || text, 'Make')
  const model = grab(vehicleSection || text, 'Model')
  const vin = grab(vehicleSection || text, 'VIN #') || grab(vehicleSection || text, 'VIN')
  const mileage = parseInt(grab(vehicleSection || text, 'Mileage').replace(/,/g, '')) || 0

  const zip = grabZip(text, ownerSection)

  const na = (val: string) => val || 'N/A'
  // Owner Information section's First+Last Name = the vehicle owner. This
  // is the top-of-claim "Owner" chip and the dashboard Owner column.
  const ownerName = `${firstName} ${lastName}`.trim()
  // Insured Name comes from the Insurance Information section. Fall back
  // to the owner name only when the Insured Name label is blank (rare on
  // Modern Appraisers sheets — usually both are present).
  const resolvedInsuredName = insuredName || ownerName

  // Deductible — best-effort extraction. The MA sheet labels this inconsistently
  // across clients; try the common variants and fall through to undefined so
  // the UI shows blank rather than a wrong value.
  const deductibleRaw =
    grab(text, 'Deductible') ||
    grab(text, 'Policy Deductible') ||
    grab(text, 'Deductible Amount')
  const deductibleNum = deductibleRaw
    ? Number(deductibleRaw.replace(/[^0-9.]/g, ''))
    : NaN
  const deductible = Number.isFinite(deductibleNum) && deductibleNum >= 0 ? deductibleNum : undefined

  // Adjuster email — may be present inline near the adjuster block.
  const adjusterEmailExtracted =
    grab(text, 'Adjuster Email') ||
    grab(text, 'Email') // last-resort; may match wrong field — only use if nothing better
      .trim()
  // Guard against the generic 'Email' grab returning the client/owner email
  // we already captured. If it equals ownerEmail (or empty), fall back to N/A.
  const adjusterEmailFinal =
    adjusterEmailExtracted && adjusterEmailExtracted !== ownerEmail
      ? adjusterEmailExtracted
      : ''

  // Modern Appraisers assignment sheets don't carry a distinct Claimant
  // block — only Insurance Information + Owner Information. For first-party
  // ("Insured") claims the insured IS the vehicle owner; for third-party
  // ("Claimant") claims the appraiser fills in the claimant details
  // separately. Leaving claimant fields BLANK is deliberate — mirroring the
  // insured into the claimant was polluting third-party claims and was
  // explicitly removed per Henry (2026-10-12).

  return {
    format: 'modern-appraisers',
    maNumber: na(maNumber),
    claimNumber: na(claimNumber),
    dateOfLoss,
    dateReceived,
    clientType,
    clientName: na(clientName),
    insuredName: na(resolvedInsuredName),
    ownerName: na(ownerName),
    ownerPhone: na(ownerPhone),
    ownerEmail: na(ownerEmail),
    ownerAddress: na(ownerAddress),
    claimantName: '',
    claimantPhone: '',
    claimantEmail: '',
    claimantAddress: '',
    insuranceCompany: na(insuranceCompany),
    adjuster: na(adjuster),
    adjusterPhone: na(adjusterPhone),
    adjusterEmail: na(adjusterEmailFinal),
    deductible,
    vin: na(vin),
    year,
    make: na(make),
    model: na(model),
    mileage,
    zip: na(zip),
    notes: '',
  }
}
