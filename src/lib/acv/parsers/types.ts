// Shared result shape for every claim-PDF parser. Extends the pre-existing
// ParsedClaim (see src/lib/parse-claim-pdf.ts) with the new Claimant contact
// block, a raw `notes` string, and a `format` discriminator so downstream
// callers can branch (e.g. only Eagle View triggers the auto-message flow).

export type ClaimFormat = 'modern-appraisers' | 'eagle-view'

export interface ParsedClaim {
  format: ClaimFormat
  maNumber: string
  claimNumber: string
  dateOfLoss: string
  dateReceived: string
  clientType: 'Insured' | 'Claimant'
  clientName: string
  insuredName: string
  ownerPhone: string
  ownerEmail: string
  ownerAddress: string
  claimantName: string
  claimantPhone: string
  claimantEmail: string
  claimantAddress: string
  insuranceCompany: string
  adjuster: string
  adjusterPhone: string
  adjusterEmail: string
  vin: string
  year: number
  make: string
  model: string
  mileage: number
  zip: string
  notes: string
}
