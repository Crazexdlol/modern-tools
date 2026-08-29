import type { ParsedClaim } from './types'

// Labels used as stop-words in inline "Label Value NextLabel..." patterns.
// Order matters only for LABEL_STOP construction (longest-first minimises
// premature stops, but the labels here don't overlap by prefix).
const ADMIN_LABELS = [
  'Claim #', 'Policy Number', 'Created By', 'Client', 'File Number',
  'ClientPhone', 'Assignment Type', 'Date of Loss', 'Loss Category',
  'Loss Code', 'Party', 'Deductible',
]
const VEHICLE_LABELS = [
  'Vehicle Year', 'Vehicle Damage Severity', 'Vehicle Make', 'Plate#',
  'Vehicle Model', 'Mileage', 'VIN', 'Total Loss Indicator', 'Color',
  'Drivable', 'Primary Point Of Impact', 'Secondary Point Of Impact',
  'Prior Damage Description', 'Damage Description',
]
const BLOCK_LABELS = [
  'Company Name', 'Contact Name', 'First Name', 'Last Name',
  'Address', 'City, State Zip', 'Email', 'Phone Numbers',
]
const SECTION_HEADERS = [
  'Appraiser Details', 'Admin Data', 'Vehicle', 'Vehicle Location',
  'Claimant', 'Insured', 'Owner', 'Notes',
]

function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Grabs the value that immediately follows `label`, stopping at any of
// `stopLabels`, a newline, or end-of-string. Value is trimmed.
// BUG 4 FIX: removed trailing \b from the stop alternation — the bare
// substring match is safe for Eagle View labels and \b was semantically
// incorrect for labels ending in non-word chars (e.g. "Plate#", "Claim #").
function grabInline(text: string, label: string, stopLabels: string[]): string {
  const stop = stopLabels.length
    ? `(?=(?:${stopLabels.map(esc).join('|')})|\\n|$)`
    : `(?=\\n|$)`
  const re = new RegExp(`${esc(label)}\\s+([\\s\\S]*?)${stop}`, 'i')
  const m = text.match(re)
  return m ? m[1].trim() : ''
}

// Eagle View blocks render phones as:
//   Phone Numbers Mobile
//   (702)461-6633
// or
//   Phone Numbers Home
//   (765)413-6602
// Capture the type word + the number on the next line. Returns '' if no
// number line follows.
// BUG 2 FIX: replaces the grabInline call for phone which only returned
// the type word (e.g. "Mobile") because grabInline stops at \n.
function grabPhone(block: string): string {
  const m = block.match(/Phone Numbers\s+(Mobile|Home|Work|1st Contact|\S+)\s*\n\s*([\(\d][\d\s\-\(\)\.ext]*)/i)
  if (!m) return ''
  const type = m[1].trim()
  const number = m[2].trim()
  return type && number ? `${type} ${number}` : number || type
}

// Parses one party block (Vehicle Location / Claimant / Insured / Owner).
// Block is expected to start at (or just before) "Company Name" and end
// before the next "Company Name" occurrence.
function parseBlock(block: string): {
  first: string; last: string; address: string;
  cityStateZip: string; email: string; phone: string;
} {
  return {
    first: grabInline(block, 'First Name', ['Last Name', ...BLOCK_LABELS.filter(l => l !== 'First Name' && l !== 'Last Name')]),
    last: grabInline(block, 'Last Name', BLOCK_LABELS.filter(l => l !== 'Last Name')),
    address: grabInline(block, 'Address', ['City, State Zip', ...BLOCK_LABELS.filter(l => l !== 'Address' && l !== 'City, State Zip')]),
    cityStateZip: grabInline(block, 'City, State Zip', BLOCK_LABELS.filter(l => l !== 'City, State Zip')),
    email: grabInline(block, 'Email', ['Phone Numbers', ...BLOCK_LABELS.filter(l => l !== 'Email' && l !== 'Phone Numbers')]),
    phone: grabPhone(block),
  }
}

// Splits the text into the 4 party blocks in fixed order:
// [0] Vehicle Location, [1] Claimant, [2] Insured, [3] Owner.
// Uses "Company Name" as the block-start marker and finds all 4 occurrences.
// BUG 5 FIX: breaks after 4 starts (was incorrectly breaking at 5).
function splitPartyBlocks(text: string): { blocks: [string, string, string, string]; starts: number[] } {
  const starts: number[] = []
  const re = /Company Name/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    starts.push(m.index)
    if (starts.length === 4) break // only need 4; was erroneously 5
  }
  const empty = ''
  const b0 = starts[0] !== undefined ? text.slice(starts[0], starts[1] ?? text.length) : empty
  const b1 = starts[1] !== undefined ? text.slice(starts[1], starts[2] ?? text.length) : empty
  const b2 = starts[2] !== undefined ? text.slice(starts[2], starts[3] ?? text.length) : empty
  const b3 = starts[3] !== undefined ? text.slice(starts[3], text.length) : empty
  return { blocks: [b0, b1, b2, b3], starts }
}

function joinName(first: string, last: string): string {
  return `${first} ${last}`.trim().replace(/\s+/g, ' ')
}

function joinAddress(street: string, csz: string): string {
  if (street && csz) return `${street}, ${csz}`
  return street || csz || ''
}

function extractZip(csz: string): string {
  const m = csz.match(/\b(\d{5})(?:-\d{4})?\b/)
  return m ? m[1] : ''
}

// Parses "MM/DD/YYYY [HH:MM AM/PM]" -> "YYYY-MM-DD". Empty if unparseable.
// BUG 3 FIX: uses explicit regex parse rather than new Date() which is
// implementation-defined for non-ISO strings.
function parseDate(raw: string): string {
  if (!raw) return ''
  const cleaned = raw.replace(/\s+\d{1,2}:\d{2}(:\d{2})?\s*(AM|PM)?.*$/i, '').trim()
  const m = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return ''
  const mm = m[1].padStart(2, '0')
  const dd = m[2].padStart(2, '0')
  return `${m[3]}-${mm}-${dd}`
}

// Returns everything after the last "Notes" header in `text`, stripped of
// any known-label lines that leaked past the header due to PDF layout quirks.
// Trimmed; runs of 3+ blank lines collapsed to 2.
// NOTE: uses the full text (not a sliced offset) so that Sample 2 — where
// the only Notes header appears before the last party block — is still found.
// The leakedFieldLine filter handles the bleed from that block.
function extractNotes(text: string): string {
  const m = text.match(/(?:^|\n)\s*Notes\s*\n([\s\S]*)$/i)
  if (!m) return ''
  const raw = m[1]
  const labelLine = new RegExp(
    `^\\s*(?:${BLOCK_LABELS.map(esc).join('|')})(?:\\s+(?:${BLOCK_LABELS.map(esc).join('|')}))*\\s*$`
  )
  // Catches lines like "First Name LT Peter Last Name Paris" or
  // "Address 9735 N ATOSSA RD City, State Zip Kingman, AZ 86401" that
  // leaked past the Notes header because it appeared before the last
  // Company Name block in the PDF.
  const leakedFieldLine = new RegExp(
    `^\\s*(?:${BLOCK_LABELS.map(esc).join('|')})\\s+\\S`
  )
  const kept = raw
    .split('\n')
    .filter((line) => !labelLine.test(line) && !SECTION_HEADERS.includes(line.trim()) && !leakedFieldLine.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return kept
}

// Parses text extracted from an Eagle View Enterprises assignment PDF.
export function parseEagleView(text: string): ParsedClaim {
  // Admin Data — every value inline, stop at the next admin label.
  const claimNumber = grabInline(text, 'Claim #', ADMIN_LABELS.filter(l => l !== 'Claim #'))
  const insuranceCompany = grabInline(text, 'Client', ADMIN_LABELS.filter(l => l !== 'Client'))
  const partyRaw = grabInline(text, 'Party', ADMIN_LABELS.filter(l => l !== 'Party'))
  const clientType: 'Insured' | 'Claimant' =
    partyRaw.toLowerCase().includes('claimant') ? 'Claimant' : 'Insured'
  const dateOfLoss = parseDate(grabInline(text, 'Date of Loss', ADMIN_LABELS.filter(l => l !== 'Date of Loss')))

  // Vehicle
  const year = parseInt(grabInline(text, 'Vehicle Year', VEHICLE_LABELS.filter(l => l !== 'Vehicle Year')), 10) || 0
  const make = grabInline(text, 'Vehicle Make', VEHICLE_LABELS.filter(l => l !== 'Vehicle Make'))
  const model = grabInline(text, 'Vehicle Model', VEHICLE_LABELS.filter(l => l !== 'Vehicle Model'))
  const vin = grabInline(text, 'VIN', VEHICLE_LABELS.filter(l => l !== 'VIN'))
  const mileageRaw = grabInline(text, 'Mileage', VEHICLE_LABELS.filter(l => l !== 'Mileage'))
  const mileage = parseInt(mileageRaw.replace(/,/g, ''), 10) || 0

  // 4 party blocks in fixed order: [VehicleLocation, Claimant, Insured, Owner]
  const { blocks } = splitPartyBlocks(text)
  const [, claimantBlock, insuredBlock] = blocks
  const insured = parseBlock(insuredBlock)
  const claimant = parseBlock(claimantBlock)

  const insuredName = joinName(insured.first, insured.last)
  const claimantName = joinName(claimant.first, claimant.last)

  const zip = extractZip(insured.cityStateZip) || extractZip(claimant.cityStateZip)

  const notes = extractNotes(text)

  return {
    format: 'eagle-view',
    maNumber: '',
    claimNumber,
    dateOfLoss,
    dateReceived: '',
    clientType,
    clientName: '',
    insuredName,
    ownerPhone: insured.phone,
    ownerEmail: insured.email,
    ownerAddress: joinAddress(insured.address, insured.cityStateZip),
    claimantName,
    claimantPhone: claimant.phone,
    claimantEmail: claimant.email,
    claimantAddress: joinAddress(claimant.address, claimant.cityStateZip),
    insuranceCompany,
    adjuster: '',
    adjusterPhone: '',
    adjusterEmail: '',
    vin,
    year,
    make,
    model,
    mileage,
    zip,
    notes,
  }
}
