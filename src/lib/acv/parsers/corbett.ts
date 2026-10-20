import type { ParsedClaim } from './types'

// Parses a Corbett Claim Service assignment sheet. Clean "Label: Value"
// format for most fields. Multiple parties can appear (Insured, Owner,
// Driver, Claimant) — we pick Insured first, then fall through to Owner.
//
// IMPORTANT: Never populates `negotiatingAppraiser`.

// Tolerate junk after the date (grabColon can over-capture when the next
// label has a period in it). Pull the first m/d/yyyy occurrence.
const toIsoDate = (raw: string): string => {
  if (!raw) return ''
  const m = raw.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/)
  const candidate = m ? m[1] : raw
  const d = new Date(candidate)
  return isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0]
}

const na = (v: string) => v || 'N/A'

// Grab "Label: value" where value runs until the next recognised label or
// end of text. Period is NOT in the label character class so "Inc." in a
// value doesn't get mistaken for the start of a new label.
function grabColon(text: string, label: string): string {
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(esc + '\\s*:\\s*(.*?)(?=\\s+[A-Z][A-Za-z /&]*?:\\s|$)', 'i')
  return (text.match(re)?.[1] ?? '').trim()
}

export function parseCorbett(text: string): ParsedClaim {
  const flat = text.replace(/\s+/g, ' ').trim()

  const claimNumber = grabColon(flat, 'Claim Ref')
  const dolRaw = grabColon(flat, 'Date of Loss')
  const dateOfLoss = toIsoDate(dolRaw)
  const dateReportedRaw = grabColon(flat, 'Date Reported')
  const dateReceived = toIsoDate(dateReportedRaw)

  // Insurance Carrier — up to "Subsidiary Insurance Carrier" or next ":".
  let insuranceCompany = ''
  const carrierM = flat.match(/\bInsurance Carrier:\s*(.+?)\s+Subsidiary\b/i)
  if (carrierM) insuranceCompany = carrierM[1].trim()

  // Policy / deductible.
  const policy = grabColon(flat, 'Policy Number')
  const dedRaw = grabColon(flat, 'Deductible').replace(/[^0-9.]/g, '')
  const dedNum = dedRaw ? Number(dedRaw) : NaN
  const deductible = Number.isFinite(dedNum) && dedNum >= 0 ? dedNum : undefined

  // Adjuster — the block begins at "Adjuster Code:" and the actual name
  // sits a few labels later as "Name: X". Phone follows as "Phone: Y".
  // Two observed layouts:
  //   "Adjuster Code: JSALONE Other: Name: SALONE, JANICE Other: Phone: 225-372-6074"
  //   "Adjuster Code: Other: 641519 Name: Other: Arney, Brenna Phone: 562-497-7037"
  let adjuster = ''
  let adjusterPhone = ''
  const adjSlice = flat.match(/\bAdjuster Code:[\s\S]{0,160}?Name:\s+(?:Other:\s+)?([A-Za-z,.\- ]+?)\s+(?:Other:\s+)?Phone:\s*([\d()\-\s.+]{7,20})/i)
  if (adjSlice) {
    adjuster = adjSlice[1].replace(/\s+/g, ' ').trim()
    adjusterPhone = adjSlice[2].trim()
  }

  // Insured name + contact. Try "Owner/Insured/Individual" first, then
  // "Insured/Individual" (first-party only, no overlapping owner).
  // Slice-based: find the party header, slice to the next Party:/section
  // boundary, then pull Address 1 / Phone / Email separately.
  function findParty(roleRe: RegExp): { name: string; address: string; phone: string; email: string } | null {
    const headerRe = new RegExp(`Party:\\s+([A-Z][A-Za-z, '.\\-]+?)\\s+${roleRe.source}\\b`, 'i')
    const headerM = flat.match(headerRe)
    if (!headerM) return null
    const name = headerM[1].replace(/\s+/g, ' ').trim()
    const sliceStart = (headerM.index ?? 0) + headerM[0].length
    const rest = flat.slice(sliceStart)
    const stop = rest.search(/\bParty:\s+[A-Z]|\bClaim Date Reported:|\bVehicle Details|\bPolicy & Agent/i)
    const slice = stop >= 0 ? rest.slice(0, stop) : rest

    const addrM = slice.match(/Address 1:\s*(.*?)(?=\s+(?:Phone:|PIN\/Pager:|Email:))/i)
    const address = (addrM?.[1] ?? '').trim()
    const phoneM = slice.match(/Phone:\s*([\d()\-\s.+]+?)(?=\s+(?:\(Cell\)|\(Home\)|\(Work\)|PIN\/Pager:|Email:))/i)
    const phone = (phoneM?.[1] ?? '').trim()
    const emailM = slice.match(/Email:\s*(\S+@\S+)/i)
    const email = (emailM?.[1] ?? '').trim()
    return { name, address, phone, email }
  }
  const insuredParty =
    findParty(/Owner\/Insured\/Individual/i) ||
    findParty(/Insured\/Individual/i) ||
    findParty(/Owner\/Individual/i)
  const insuredName = insuredParty?.name ?? ''
  const ownerAddress = insuredParty?.address ?? ''
  const ownerPhone = insuredParty?.phone ?? ''
  const ownerEmail = insuredParty?.email ?? ''

  // Claimant party, if present (third-party claim).
  const claimantParty = findParty(/Claimant\/Individual/i)
  const claimantName = claimantParty?.name ?? ''
  const claimantAddress = claimantParty?.address ?? ''
  const claimantPhone = claimantParty?.phone ?? ''
  const claimantEmail = claimantParty?.email ?? ''

  // Vehicle.
  const year = parseInt(grabColon(flat, 'Year'), 10) || 0
  const make = grabColon(flat, 'Make')
  const model = grabColon(flat, 'Model')
  const vin = grabColon(flat, 'VIN / Identification Number').replace(/\s+/g, '')
  const mileage = parseInt(grabColon(flat, 'Odometer / Hours').replace(/,/g, ''), 10) || 0

  // ZIP — prefer insured address zip, fall back to vehicle location zip.
  const extractZip = (s: string) => (s.match(/\b(\d{5})(?:-\d{4})?\b/)?.[1] ?? '')
  let zip = extractZip(ownerAddress)
  if (!zip) {
    const vehLocM = flat.match(/\bVehicle Location\b[\s\S]*?Postal Code:\s*(\d{5})/i)
    zip = vehLocM?.[1] ?? ''
  }

  const clientType: 'Insured' | 'Claimant' = claimantParty ? 'Claimant' : 'Insured'

  return {
    format: 'corbett',
    maNumber: na(claimNumber), // Corbett doesn't have a separate MA#; use claim ref
    claimNumber: na(claimNumber || policy),
    dateOfLoss,
    dateReceived,
    clientType,
    // Client = relay/admin company (Corbett). The underlying insurer
    // (GO AUTO, Auto Club, etc.) is reflected under insuranceCompany.
    clientName: 'Corbett Claim Service',
    insuredName: na(insuredName),
    // Corbett format shares insured + owner on first-party claims; mirror
    // the insured so the Owner chip reflects the same person.
    ownerName: na(insuredName),
    ownerPhone: na(ownerPhone),
    ownerEmail: na(ownerEmail),
    ownerAddress: na(ownerAddress),
    claimantName: claimantName || (clientType === 'Insured' ? insuredName : ''),
    claimantPhone: claimantPhone || (clientType === 'Insured' ? ownerPhone : ''),
    claimantEmail: claimantEmail || (clientType === 'Insured' ? ownerEmail : ''),
    claimantAddress: claimantAddress || (clientType === 'Insured' ? ownerAddress : ''),
    insuranceCompany: na(insuranceCompany),
    adjuster: na(adjuster),
    adjusterPhone: na(adjusterPhone),
    adjusterEmail: 'N/A',
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
