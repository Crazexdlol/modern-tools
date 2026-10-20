import type { ParsedClaim } from './types'

// Parses a Crawford Vehicle Services (Crawford & Company) assignment sheet.
// Semi-structured: labels have colons but values occasionally run into the
// next label when fields are blank. Fields of interest are reliable.
//
// IMPORTANT: Never populates `negotiatingAppraiser` — the sheet lists a
// "Responsible" (us) and an "Appraiser" (also us), but Henry wants that
// field left to the user to assign.

// Tolerate junk after the date (grabColon can over-capture when the next
// label has a period or # in it). Pull the first m/d/yyyy occurrence.
const toIsoDate = (raw: string): string => {
  if (!raw) return ''
  const m = raw.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/)
  const candidate = m ? m[1] : raw
  const d = new Date(candidate)
  return isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0]
}

const na = (v: string) => v || 'N/A'

// Pull a value for a labelled field. Stops at the next labelled field — one
// or more Title-Case words (no periods — "Inc." must NOT be mistaken for a
// label) followed by ":".
function grabColon(text: string, label: string): string {
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(esc + '\\s*:\\s*(.*?)(?=\\s+[A-Z][A-Za-z /&]*?:\\s|\\s+Country\\b|$)', 'i')
  return (text.match(re)?.[1] ?? '').trim()
}

export function parseCrawford(text: string): ParsedClaim {
  const flat = text.replace(/\s+/g, ' ').trim()

  const claimNumber = grabColon(flat, 'Claim Number')
  const policy = grabColon(flat, 'Policy Number')
  const dolRaw = grabColon(flat, 'Date of Loss')
  const dateOfLoss = toIsoDate(dolRaw)

  const dedRaw = grabColon(flat, 'Deductible').replace(/[^0-9.]/g, '')
  const dedNum = dedRaw ? Number(dedRaw) : NaN
  const deductible = Number.isFinite(dedNum) && dedNum >= 0 ? dedNum : undefined

  // Insurance company — Crawford relays for a sub-client, which is the
  // actual insurer. Format: "Company/Client: Crawford and Company - TD Insurance, Inc."
  // Fall back to "Client Name" field if the composite doesn't resolve.
  let insuranceCompany = ''
  const compClient = grabColon(flat, 'Company\\/Client')
  const dashSplit = compClient.split(/\s*-\s*/, 2)
  if (dashSplit.length === 2) insuranceCompany = dashSplit[1].trim()
  if (!insuranceCompany) insuranceCompany = grabColon(flat, 'Client Name')

  // Adjuster / Claim Handler — Crawford's handlers table has one row that
  // looks like: "Crawford and Company Perina Brown (404) 905-8894 perina_brown@us.crawco.com"
  let adjuster = ''
  let adjusterPhone = ''
  let adjusterEmail = ''
  const handlerM = flat.match(/Crawford and Company\s+([A-Z][A-Za-z'.\- ]+?)\s+(\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4})\s+([\w.+-]+@[\w.\-]+)/i)
  if (handlerM) {
    adjuster = handlerM[1].trim()
    adjusterPhone = handlerM[2].trim()
    adjusterEmail = handlerM[3].trim()
  }

  // Vehicle. Crawford interleaves other fields with each Year/Make/Model/VIN
  // label — use the specific interleaved pattern: "Vehicle Year: YYYY ...
  // Make: X ... Model: Y ... VIN: Z ... Mileage: ..."
  const year = parseInt(grabColon(flat, 'Vehicle Year'), 10) || 0
  const make = grabColon(flat, 'Make')
  const model = grabColon(flat, 'Model')
  // Permissive VIN match — Crawford PDFs sometimes include characters the
  // VIN standard excludes (O/I/Q) because the source data was mistyped;
  // accept any 17-char alphanumeric so we don't drop otherwise-good VINs.
  const vinM = flat.match(/\bVIN:\s*([A-Z0-9]{17})/i)
  const vin = vinM?.[1] ?? ''
  const mileageRaw = grabColon(flat, 'Mileage').replace(/[^0-9]/g, '')
  const mileage = mileageRaw ? parseInt(mileageRaw, 10) || 0 : 0

  // Insured block. Format:
  //   "Insured First Name: Noah Last Name: Bissada Address: 2594 Rue Spruce
  //    City, State Zip: Val-David, QC J0T2N0 Country CAN Mobile (438) 499-6624"
  let insuredFirst = ''
  let insuredLast = ''
  let ownerAddress = ''
  let ownerPhone = ''
  let ownerEmail = ''
  const insuredBlockM = flat.match(/\bInsured First Name:\s+([^]*?)(?=\s+Owner First Name:|\s+Repair Facility|\s+Comments\b|$)/i)
  // Include the leading "Insured First Name: " so grabColon can match it
  // inside the slice. Without it, grabColon's regex searches for the label
  // and misses, returning empty.
  const insuredSlice = insuredBlockM ? ('Insured First Name: ' + insuredBlockM[1]) : ''
  if (insuredSlice) {
    insuredFirst = grabColon(insuredSlice, 'Insured First Name')
    insuredLast = grabColon(insuredSlice, 'Last Name')
    const addr = grabColon(insuredSlice, 'Address')
    const cityStateZip = grabColon(insuredSlice, 'City, State Zip')
    ownerAddress = [addr, cityStateZip].filter(Boolean).join(', ')
    // "Mobile" has no colon on these sheets — "Mobile (438) 499-6624" sits
    // between "Country CAN" and "Extension". Match the phone pattern directly.
    const mobileM = insuredSlice.match(/\bMobile\s+(\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4})/i)
    ownerPhone = mobileM?.[1] ?? ''
  }
  // Email usually lives in the Contact block, keyed by email label.
  const contactSlice = flat.match(/\bContact First Name:\s+([^]*?)(?=\s+Insured First Name|$)/i)?.[1] ?? ''
  if (contactSlice) {
    ownerEmail = grabColon(contactSlice, 'Email')
  }

  const insuredName = `${insuredFirst} ${insuredLast}`.trim()

  // ZIP — prefer vehicle-location address (US side). Match "<STATE> <5 digit
  // zip>" so a street number like "10701 Balsam Creek Ave" isn't mistaken
  // for a zip. Fall back to insured address zip (may be a Canadian postal
  // code, in which case stay blank).
  let zip = ''
  const vehLocSlice = flat.match(/\bVehicle Location Address:\s*([^]*?)(?=\s+Contact\s+First Name|\s+Insured\s+First Name|$)/i)?.[1] ?? ''
  if (vehLocSlice) {
    const vlZip = vehLocSlice.match(/\b[A-Z]{2}\s+(\d{5})(?:-\d{4})?\b/)?.[1]
    if (vlZip) zip = vlZip
  }
  if (!zip) {
    const insuredZip = ownerAddress.match(/\b[A-Z]{2}\s+(\d{5})(?:-\d{4})?\b/)?.[1]
    if (insuredZip) zip = insuredZip
  }

  const clientType: 'Insured' | 'Claimant' = 'Insured'
  const copyIf = (v: string) => (clientType === 'Insured' && v ? v : '')

  return {
    format: 'crawford',
    maNumber: na(claimNumber),
    claimNumber: na(claimNumber || policy),
    dateOfLoss,
    dateReceived: '',
    clientType,
    // Client = relay/admin company (Crawford). The underlying insurer
    // (TD Insurance, Nationwide, etc.) is reflected under insuranceCompany.
    clientName: 'Crawford and Company',
    insuredName: na(insuredName),
    // Crawford format doesn't carry a distinct Owner block; share the
    // insured value so the Owner chip isn't blank.
    ownerName: na(insuredName),
    ownerPhone: na(ownerPhone),
    ownerEmail: na(ownerEmail),
    ownerAddress: na(ownerAddress),
    claimantName: copyIf(insuredName),
    claimantPhone: copyIf(ownerPhone),
    claimantEmail: copyIf(ownerEmail),
    claimantAddress: copyIf(ownerAddress),
    insuranceCompany: na(insuranceCompany),
    adjuster: na(adjuster),
    adjusterPhone: na(adjusterPhone),
    adjusterEmail: na(adjusterEmail),
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
