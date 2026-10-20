import type { ParsedClaim } from './types'

// Parses a ClaimSolution Inc. / Dakabi assignment sheet. One flat line of
// space-separated label-value pairs — no colons. Field order is stable
// across the samples we've seen (Progressive TPAC, Travelers CL, etc).
//
// IMPORTANT: Never populates `negotiatingAppraiser` — even if the sheet lists
// an "Appraiser" (which is OUR side at Modern Appraisers), Henry wants that
// field left blank for the user to assign.

const toIsoDate = (raw: string): string => {
  if (!raw) return ''
  const d = new Date(raw)
  return isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0]
}

const na = (v: string) => v || 'N/A'

export function parseClaimSolution(text: string): ParsedClaim {
  // Flatten whitespace so greedy/lazy regexes behave predictably.
  const flat = text.replace(/\s+/g, ' ').trim()

  // MA# / internal file number.
  const maNumber = (flat.match(/Dakabi File\s+(\S+)/i)?.[1] ?? '').trim()

  // Date received: "Received M/D/YYYY, EMAIL" or similar.
  const received = flat.match(/Received\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i)?.[1] ?? ''
  const dateReceived = toIsoDate(received)

  // DOL.
  const dol = flat.match(/\bDOL\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i)?.[1] ?? ''
  const dateOfLoss = toIsoDate(dol)

  // Insurance company. Format: "Client NNNN NAME ... <street#> <street> <city> <ST> <zip> Rep"
  // Capture NAME until a 2+ digit number followed by a word (street address).
  let insuranceCompany = ''
  const clientMatch = flat.match(/\bClient\s+\d{3,}\s+([A-Z0-9][A-Z0-9 &\-'.]*?)\s+\d{2,}\s+[A-Z]/i)
  if (clientMatch) insuranceCompany = clientMatch[1].trim()

  // Claim number — label is "Claim No" (possibly prefixed, e.g. "TPAC Claim No").
  const claimNumber = (flat.match(/\bClaim No\s+(\S+)/i)?.[1] ?? '').trim()

  // Deductible.
  const dedRaw = flat.match(/\bDeductible\s+\$?([\d,.]+)/i)?.[1] ?? ''
  const dedNum = dedRaw ? Number(dedRaw.replace(/,/g, '')) : NaN
  const deductible = Number.isFinite(dedNum) && dedNum >= 0 ? dedNum : undefined

  // Adjuster — the "Rep" field. Variants:
  //   "Rep WILSON MALLOY (570) 351-5750 Wilson_J_Malloy@progressive.com"
  //   "Rep PHONE: mmcgee6@travelers.com"           — no name
  //   "Rep NAME phone email"                       — common
  // Capture a plausible NAME (ALL-CAPS or title-case tokens, no colons/digits).
  let adjuster = ''
  let adjusterPhone = ''
  let adjusterEmail = ''
  const repSlice = flat.match(/\bRep\s+([^]*?)(?=\s+Claim\s+Vertical|\s+Class\s+|\s+Policy\s+|$)/i)?.[1] ?? ''
  if (repSlice) {
    const emailM = repSlice.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)
    adjusterEmail = emailM?.[0] ?? ''
    const phoneM = repSlice.match(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/)
    adjusterPhone = phoneM?.[0] ?? ''
    const nameM = repSlice.match(/^\s*([A-Z][A-Za-z'.\- ]+?)(?=\s*(?:\(?\d{3}|[\w.+-]+@|PHONE:|$))/)
    const candidate = (nameM?.[1] ?? '').trim()
    // Reject noise like "PHONE:" prefix.
    if (candidate && !/^(PHONE|FAX|EMAIL)/i.test(candidate)) adjuster = candidate
  }

  // Owner block. Format varies but typically:
  //   "Owner BUSINESS NAME STREET CITY ST ZIP[-####] (###) ###-#### PERSON NAME [Appointment|Vehicle]"
  // We only need: ownerName, ownerPhone, ownerAddress, zip. Business name
  // comes through as part of `clientName` (billing-side), person as insured.
  const ownerSlice = flat.match(/\bOwner\s+([^]*?)(?=\s+(?:Appointment|Vehicle)\b)/i)?.[1] ?? ''
  let ownerPhone = ''
  let ownerAddress = ''
  let insuredName = ''
  let ownerBusiness = ''
  let zip = ''
  if (ownerSlice) {
    const phoneM = ownerSlice.match(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/)
    ownerPhone = phoneM?.[0] ?? ''
    const zipM = ownerSlice.match(/\b(\d{5})(?:-\d{4})?\b/)
    zip = zipM?.[1] ?? ''
    // Split "<before phone> <phone> <after phone>" — before = business + address,
    // after = person name (and possibly trailing junk).
    if (phoneM) {
      const beforePhone = ownerSlice.slice(0, phoneM.index!).trim()
      const afterPhone = ownerSlice.slice(phoneM.index! + phoneM[0].length).trim()
      // Business name = first run of ALL-CAPS tokens (stops at first lowercase
      // or at a street number). Fall back to the first word if nothing matches.
      const bizM = beforePhone.match(/^([A-Z0-9&'.\- ]+?)(?=\s+\d|\s+[A-Z][a-z]|$)/)
      ownerBusiness = (bizM?.[1] ?? '').trim()
      ownerAddress = beforePhone.replace(/^([A-Z0-9&'.\- ]+?)(?=\s+\d|\s+[A-Z][a-z]|$)\s*/, '').trim()
      // Person name = everything after phone, until a trailing noise token.
      const personM = afterPhone.match(/^([A-Z][A-Za-z'.\- ]+?)(?=\s+(?:DBA|USA|undefined|\d{3,})|$)/)
      insuredName = (personM?.[1] ?? afterPhone.split(/\s{2,}/)[0] ?? '').trim()
    } else {
      ownerAddress = ownerSlice
    }
  }

  // Vehicle block: "Vehicle YYYY MAKE MODEL VIN XXXXXXX..."
  const vehSlice = flat.match(/\bVehicle\s+(\d{4})\s+([A-Z0-9\-]+)\s+(.+?)\s+VIN\s+([A-HJ-NPR-Z0-9]{17})/i)
  const year = vehSlice ? parseInt(vehSlice[1], 10) || 0 : 0
  const make = vehSlice?.[2] ?? ''
  const model = (vehSlice?.[3] ?? '').trim()
  const vin = vehSlice?.[4] ?? ''

  // Mileage isn't a label on this sheet — most ClaimSolution assignments
  // omit it. Leave 0 so the UI shows blank; appraiser fills in on inspection.
  const mileage = 0

  // Client type: ClaimSolution assigns on behalf of the carrier — the owner
  // is typically the insured (first-party). Default to Insured.
  const clientType: 'Insured' | 'Claimant' = 'Insured'

  // When Insured, mirror owner contact into claimant fields (matches the
  // Modern Appraisers parser convention).
  const sameAsInsured = clientType === 'Insured'
  const copyIf = (v: string) => (sameAsInsured && v ? v : '')

  return {
    format: 'claim-solution',
    maNumber: na(maNumber),
    claimNumber: na(claimNumber),
    dateOfLoss,
    dateReceived,
    clientType,
    // Client = relay/admin company (ClaimSolution). The underlying insurer
    // (Progressive, Travelers, etc.) is reflected under insuranceCompany.
    clientName: 'ClaimSolution Inc.',
    insuredName: na(insuredName || ownerBusiness),
    // ClaimSolution format shares insured + owner; mirror so the Owner
    // chip reflects the same person as the Insured field.
    ownerName: na(insuredName || ownerBusiness),
    ownerPhone: na(ownerPhone),
    ownerEmail: na(''),
    ownerAddress: na(ownerAddress),
    claimantName: copyIf(insuredName || ownerBusiness),
    claimantPhone: copyIf(ownerPhone),
    claimantEmail: '',
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
