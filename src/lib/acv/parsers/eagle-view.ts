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
//
// Each stop label is bounded by a trailing `(?![A-Za-z])` so that labels
// which happen to be the prefix of a VALUE (e.g. stop label "Color" vs the
// Chevrolet "Colorado" model) do not fire a false stop. Without this, parsing
// "Vehicle Model Colorado Mileage" against the stop label "Color" captured
// nothing because the engine stopped at "Color" inside "Colorado". The
// negative lookahead means the stop fires only when the label is NOT
// immediately followed by another letter — correct for every real-world label
// in both ADMIN_LABELS, VEHICLE_LABELS, and BLOCK_LABELS, including the ones
// that end in non-letter chars like "Plate#" and "Claim #".
function grabInline(text: string, label: string, stopLabels: string[]): string {
  const stop = stopLabels.length
    ? `(?=(?:(?:${stopLabels.map(esc).join('|')})(?![A-Za-z]))|\\n|$)`
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
//
// Two extraction strategies, tried in order:
//
//   1) HEADER-based: anchor on each section's header on its own line
//      ("Vehicle Location", "Claimant", "Insured", "Owner"). This is the
//      original strategy — works when headers appear INLINE with their
//      content block (older Eagle View / Sedgwick layouts).
//
//   2) COMPANY-NAME-based (fallback): newer GEICO-via-Eagle-View assignment
//      sheets render ALL section headers stacked at the top of the extracted
//      text (left-column sidebar in the source PDF) with the data content
//      flowing in order underneath. Header anchoring breaks because every
//      header position is in the top block before any party-block data exists.
//      Fallback: locate every "Company Name" occurrence; the first is in
//      Appraiser Details (if the appraiser carries a Company Name line, which
//      Modern Appraisers always does), and the next 4 are the party blocks.
//      End of the last block = the last "Notes" occurrence anywhere (with or
//      without leading newline — PDF 2 concatenates "...TX 75088Notes" with
//      no delimiter) or end-of-text.
//
// We detect "headers stacked at top" by checking whether header-strategy
// slices yielded content past the header line itself. If three or more
// party blocks are empty-or-header-only, we fall back to Company-Name mode.
function splitPartyBlocks(text: string): { blocks: [string, string, string, string]; starts: number[] } {
  const headerMatch = (header: string): number => {
    const re = new RegExp(`(?:^|\\n)\\s*${esc(header)}\\s*(?:\\n|$)`)
    const m = text.match(re)
    return m && m.index !== undefined ? m.index + m[0].indexOf(header) : -1
  }
  const notesIdx = headerMatch('Notes')
  const vlIdx = headerMatch('Vehicle Location')
  const clIdx = headerMatch('Claimant')
  const inIdx = headerMatch('Insured')
  const owIdx = headerMatch('Owner')
  const starts = [vlIdx, clIdx, inIdx, owIdx]
  const endBound = (i: number): number => {
    for (let j = i + 1; j < starts.length; j++) {
      if (starts[j] >= 0) return starts[j]
    }
    return notesIdx >= 0 ? notesIdx : text.length
  }
  const slice = (i: number): string =>
    starts[i] >= 0 ? text.slice(starts[i], endBound(i)) : ''
  const b0 = slice(0)
  const b1 = slice(1)
  const b2 = slice(2)
  const b3 = slice(3)

  // Content check: a block is "empty" if it only contains its own header
  // (and whitespace). Blocks with real party data contain "Company Name" or
  // "First Name" or an "Address" line.
  const hasContent = (block: string): boolean =>
    /\b(Company Name|First Name|Last Name|Address|Email|Phone Numbers)\b/.test(block)
  const populated = [b0, b1, b2, b3].filter(hasContent).length

  if (populated >= 3) {
    return { blocks: [b0, b1, b2, b3], starts }
  }

  // Fallback: Company-Name counting. Collect every "Company Name" position.
  const companyIndices: number[] = []
  const reCn = /Company Name/g
  let m: RegExpExecArray | null
  while ((m = reCn.exec(text)) !== null) companyIndices.push(m.index)

  // Determine the 4 party-block start positions. If there are 5+ hits, the
  // first is Appraiser Details — skip it; take indices [1..5). If exactly 4
  // hits, assume the appraiser block had no "Company Name" line (rare) and
  // use all 4 as the party starts.
  let partyStarts: number[]
  if (companyIndices.length >= 5) partyStarts = companyIndices.slice(1, 5)
  else if (companyIndices.length === 4) partyStarts = companyIndices
  else return { blocks: [b0, b1, b2, b3], starts } // can't split cleanly — give up and return header-strategy result

  // End-of-last-block anchor: first "Notes" occurrence AFTER the last party
  // start. Allowed to be preceded by anything (digit, letter, newline, etc.)
  // — PDF 2 extracts "...Rowlett, TX 75088Notes\n..." with no delimiter. Fall
  // back to end-of-text if no Notes marker is found.
  const lastStart = partyStarts[partyStarts.length - 1]
  const notesRe = /Notes(?:\n|$)/
  const tailMatch = text.slice(lastStart).match(notesRe)
  const notesEnd = tailMatch && tailMatch.index !== undefined
    ? lastStart + tailMatch.index
    : text.length

  const sliceFallback = (i: number): string => {
    const start = partyStarts[i]
    const end = i + 1 < partyStarts.length ? partyStarts[i + 1] : notesEnd
    return text.slice(start, end)
  }

  return {
    blocks: [sliceFallback(0), sliceFallback(1), sliceFallback(2), sliceFallback(3)],
    starts: partyStarts,
  }
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
//
// Historical complication: Eagle View / GEICO assignment sheets sometimes
// extract with "Notes" on its own line, sometimes with "Notes" directly
// concatenated to the previous line (e.g. "...Rowlett, TX 75088Notes\n...").
// The regex below treats either as a valid Notes header:
//   - standard case: optional whitespace + "Notes" + newline/EOT
//   - concatenated case: non-letter boundary + "Notes" + newline/EOT
// The `(?<=[^A-Za-z]|^)` lookbehind ensures we don't match "Notes" that
// happens to appear mid-word (would be rare but safe).
// Still prefers the LAST occurrence of Notes so earlier false positives
// (e.g. the word "Notes" appearing in a label somewhere) don't win.
function extractNotes(text: string): string {
  const allMatches: Array<{ index: number }> = []
  const re = /(?<=[^A-Za-z]|^)Notes(?=\n|$)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) allMatches.push({ index: m.index })
  if (allMatches.length === 0) return ''
  const last = allMatches[allMatches.length - 1]
  const raw = text.slice(last.index + 'Notes'.length).replace(/^\n/, '')
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
  // GEICO-via-Eagle-View sheets concatenate "Notes" to the previous line
  // (e.g. "...Rowlett, TX 75088Notes\n") AND continue the owner block AFTER
  // the Notes header. The owner's "Email Phone Numbers Work\n(469)826-6026\nWork\n(469)826-6026"
  // leaks into the notes region as 4 lines: the field-label line (caught by
  // leakedFieldLine), two bare phone lines, and a standalone phone-type word.
  // Strip the two latter so the extracted notes read as actual freeform text.
  const barePhoneLine = /^\s*[\(\d][\d\s\-\(\)\.ext]*$/
  const bareTypeWord = /^\s*(?:Mobile|Home|Work|1st Contact)\s*$/i
  const kept = raw
    .split('\n')
    .filter((line) =>
      !labelLine.test(line) &&
      !SECTION_HEADERS.includes(line.trim()) &&
      !leakedFieldLine.test(line) &&
      !barePhoneLine.test(line) &&
      !bareTypeWord.test(line)
    )
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
  const deductibleRaw = grabInline(text, 'Deductible', ADMIN_LABELS.filter(l => l !== 'Deductible'))
  const deductibleNum = deductibleRaw ? Number(deductibleRaw.replace(/[^0-9.]/g, '')) : NaN
  const deductible = Number.isFinite(deductibleNum) && deductibleNum > 0 ? deductibleNum : undefined

  // Vehicle
  const year = parseInt(grabInline(text, 'Vehicle Year', VEHICLE_LABELS.filter(l => l !== 'Vehicle Year')), 10) || 0
  const make = grabInline(text, 'Vehicle Make', VEHICLE_LABELS.filter(l => l !== 'Vehicle Make'))
  const model = grabInline(text, 'Vehicle Model', VEHICLE_LABELS.filter(l => l !== 'Vehicle Model'))
  const vin = grabInline(text, 'VIN', VEHICLE_LABELS.filter(l => l !== 'VIN'))
  const mileageRaw = grabInline(text, 'Mileage', VEHICLE_LABELS.filter(l => l !== 'Mileage'))
  const mileage = parseInt(mileageRaw.replace(/,/g, ''), 10) || 0

  // 4 party blocks in fixed order: [VehicleLocation, Claimant, Insured, Owner]
  const { blocks } = splitPartyBlocks(text)
  const [, claimantBlock, insuredBlock, ownerBlock] = blocks
  const insured = parseBlock(insuredBlock)
  const claimant = parseBlock(claimantBlock)
  const owner = parseBlock(ownerBlock)

  const insuredName = joinName(insured.first, insured.last)
  const claimantName = joinName(claimant.first, claimant.last)
  const ownerName = joinName(owner.first, owner.last)

  // ZIP fallback cascade: insured → claimant → owner. Empty if all three
  // sections are blank (shouldn't happen on a real assignment).
  const zip = extractZip(insured.cityStateZip)
    || extractZip(claimant.cityStateZip)
    || extractZip(owner.cityStateZip)

  const notes = extractNotes(text)

  return {
    format: 'eagle-view',
    maNumber: '',
    claimNumber,
    dateOfLoss,
    dateReceived: '',
    clientType,
    // Eagle View is Sedgwick's assignment platform — every PDF from it is
    // a Sedgwick sub-assignment regardless of the underlying insurer.
    clientName: 'Sedgwick',
    insuredName,
    // Vista-branded Eagle View sheets carry a separate Owner block, which
    // may differ from the Insured. If the Owner block was populated use its
    // name; otherwise fall back to insured (preserves the older behaviour
    // where Sedgwick's Owner == Insured).
    ownerName: ownerName || insuredName,
    ownerPhone: owner.phone || insured.phone,
    ownerEmail: owner.email || insured.email,
    ownerAddress: joinAddress(owner.address, owner.cityStateZip)
      || joinAddress(insured.address, insured.cityStateZip),
    claimantName,
    claimantPhone: claimant.phone,
    claimantEmail: claimant.email,
    claimantAddress: joinAddress(claimant.address, claimant.cityStateZip),
    insuranceCompany,
    adjuster: '',
    adjusterPhone: '',
    adjusterEmail: '',
    deductible,
    vin,
    year,
    make,
    model,
    mileage,
    zip,
    notes,
  }
}
