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

  return {
    format: 'modern-appraisers',
    maNumber: na(maNumber),
    claimNumber: na(claimNumber),
    dateOfLoss,
    dateReceived,
    clientType,
    clientName: na(clientName),
    insuredName: na(insuredName || `${firstName} ${lastName}`.trim()),
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
    adjusterEmail: 'N/A',
    vin: na(vin),
    year,
    make: na(make),
    model: na(model),
    mileage,
    zip: na(zip),
    notes: '',
  }
}
