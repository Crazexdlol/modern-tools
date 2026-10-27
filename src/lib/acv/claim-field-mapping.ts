// Central mapping of ClaimInfo fields -> which assignment-sheet parsers
// extract them, and under which label. This is the source of truth for
// "what gets auto-filled when an assignment sheet is uploaded." When adding
// a new ClaimInfo field, update:
//   1. src/lib/acv/types.ts (ClaimInfo interface)
//   2. src/lib/acv/parsers/types.ts (ParsedClaim) if the field can be parsed
//   3. Each parser in src/lib/acv/parsers/*.ts
//   4. The spread in ClaimWorkspace.tsx handlePdfUpload that applies parsed values
//   5. This file — add an entry under the appropriate parser's label map
//
// CLAUDE.md enforces step 5 for every new field.

export type ParserLabel = {
  /** Label as it appears in the PDF (first match wins; multiple = fallback chain). */
  labels: string[]
  /** Human-readable description of how this field is derived (optional). */
  note?: string
}

/** Fields that are populated by the Modern Appraisers assignment sheet parser. */
export const MODERN_APPRAISERS_FIELDS: Record<string, ParserLabel> = {
  maNumber: { labels: ['MA #', 'MA#', 'File #'] },
  claimNumber: { labels: ['Claim #', 'Claim Number'] },
  dateReceived: { labels: ['Date Created', 'Date Assigned'] },
  dateOfLoss: { labels: ['Date of Loss', 'DOL'] },
  clientType: { labels: ['Claim For'], note: "'Insured' or 'Claimant'" },
  clientName: { labels: ['Business Name'] },
  insuredName: { labels: ['Insured Name'] },
  ownerName: { labels: ['First Name', 'Last Name'], note: 'Owner Information section — First + Last concatenated' },
  ownerPhone: { labels: ['Mobile Phone', 'Home Phone', 'Work Phone'] },
  ownerEmail: { labels: ['Client Email'] },
  ownerAddress: { labels: ['Address 1', 'Address 2', 'City', 'State', 'Zip'] },
  // Modern Appraisers assignment sheets don't carry a distinct Claimant
  // block. Claimant fields are left blank for the appraiser to fill
  // manually when the claim is a third-party / Claimant-type claim.
  // Previously these were mirrored from the Insured — Henry removed that
  // behavior 2026-10-12 after it polluted third-party claims.
  claimantName: { labels: [], note: 'Blank — fill manually for third-party claims' },
  claimantPhone: { labels: [], note: 'Blank — fill manually for third-party claims' },
  claimantEmail: { labels: [], note: 'Blank — fill manually for third-party claims' },
  claimantAddress: { labels: [], note: 'Blank — fill manually for third-party claims' },
  insuranceCompany: { labels: ['Insurance Company', 'Carrier'] },
  adjuster: { labels: ['Adjuster'] },
  adjusterPhone: { labels: ['Adjuster Phone'] },
  adjusterEmail: { labels: ['Adjuster Email'] },
  deductible: { labels: ['Deductible', 'Policy Deductible', 'Deductible Amount'] },
  vin: { labels: ['VIN #', 'VIN'] },
  year: { labels: ['Year'] },
  make: { labels: ['Make'] },
  model: { labels: ['Model'] },
  mileage: { labels: ['Mileage'] },
  zip: { labels: ['Zip', 'Zip Code'] },
}

/** Fields populated by the Eagle View assignment sheet parser. */
export const EAGLE_VIEW_FIELDS: Record<string, ParserLabel> = {
  claimNumber: { labels: ['Claim #'] },
  insuranceCompany: { labels: ['Client'] },
  clientType: { labels: ['Party'], note: "'Insured' or 'Claimant'" },
  dateOfLoss: { labels: ['Date of Loss'] },
  year: { labels: ['Vehicle Year'] },
  make: { labels: ['Vehicle Make'] },
  model: { labels: ['Vehicle Model'] },
  vin: { labels: ['VIN'] },
  mileage: { labels: ['Mileage'] },
  // Address + contact come from the 4 party blocks (VehicleLocation / Claimant / Insured / Owner).
  // Party blocks are split by header line position in older Eagle View layouts
  // and by "Company Name" occurrence counting in newer GEICO-via-Eagle-View
  // sheets where every section header is stacked at the top of the extracted
  // text (Henry 2026-10-20). First "Company Name" is Appraiser Details; the
  // next 4 are the party blocks in order.
  insuredName: { labels: [], note: 'From Insured party block (First + Last)' },
  ownerName: { labels: [], note: 'From Owner party block (First + Last) — falls back to insured when Owner block is empty' },
  ownerPhone: { labels: [], note: 'From Owner party block, falling back to Insured' },
  ownerEmail: { labels: [], note: 'From Owner party block, falling back to Insured' },
  ownerAddress: { labels: [], note: 'From Owner party block (Address + City/State/Zip), falling back to Insured' },
  claimantName: { labels: [], note: 'From Claimant party block (First + Last)' },
  claimantPhone: { labels: [], note: 'From Claimant party block' },
  claimantEmail: { labels: [], note: 'From Claimant party block' },
  claimantAddress: { labels: [], note: 'From Claimant party block' },
  clientName: { labels: [], note: 'Hardcoded "Sedgwick" (Eagle View is Sedgwick\'s platform)' },
  // Notes extracted from the end-of-sheet Notes section. Supports both the
  // "Notes\n...body..." standard form AND the GEICO variant where "Notes" is
  // concatenated to the preceding line with no delimiter (e.g.
  // "...Rowlett, TX 75088Notes\n..."). Leaked field labels, bare phone lines,
  // and standalone phone-type words that trail past the Notes header are
  // stripped so the extracted text reads as freeform narrative.
  //
  // The parsed value lands in TWO places on the claim:
  //   1. claim.appraiserNotes — rendered as "Handling Instructions" at the
  //      bottom of the Claim Info tab (persistent, user-editable)
  //   2. pendingAutoNoteRef — fires a one-shot auto-message on claim save
  //      (Eagle View only), so the first inbox message mirrors what the
  //      assignment sheet said
  notes: { labels: ['Notes'], note: 'Also populates claim.appraiserNotes on upload' },
}

/** Fields populated by the CCC report parser (placeholder — pending sample data). */
export const CCC_FIELDS: Record<string, ParserLabel> = {
  claimNumber: { labels: ['Claim Number', 'Claim #'] },
  insuranceCompany: { labels: ['Insurance Company', 'Carrier'] },
  dateOfLoss: { labels: ['Date of Loss', 'Loss Date'] },
  vin: { labels: ['VIN', 'Vehicle Identification Number'] },
  year: { labels: ['Year', 'Vehicle Year'] },
  make: { labels: ['Make'] },
  model: { labels: ['Model'] },
  trim: { labels: ['Trim', 'Series'] },
  mileage: { labels: ['Odometer', 'Mileage'] },
  // Owner block typically appears as "Owner:" / "Owner Name:" in CCC reports.
  insuredName: { labels: ['Owner', 'Owner Name', 'Insured'] },
  ownerPhone: { labels: ['Phone', 'Owner Phone'] },
  ownerAddress: { labels: ['Address'] },
}

/**
 * Fields that are app-internal only — set in the app, not from any
 * assignment sheet. New fields that fit here don't need parser updates.
 */
export const APP_INTERNAL_FIELDS = [
  'negotiatingAppraiser',
  'claimTypes',
  'trim',           // sometimes parsed, often set from VIN decode
  'engine',
  'drivetrain',
  'transmission',
  'fuelType',
  'bodyType',       // set from VIN decode's bodyStyle (normalized), editable in UI
  'radius',
  'vehicleLocationName',    // holder's name (body shop / tow yard / residence)
  'vehicleLocationAddress', // holder's street address
  'vehicleLocationContact', // contact at the holder (name + phone/email, freeform string)
  'vehicleLocation',        // legacy single-field; superseded by the two above but kept for old claims
  // appraiserNotes is primarily app-internal but ALSO auto-populated from the
  // Eagle View parser's `notes` field — see EAGLE_VIEW_FIELDS.notes above.
  'appraiserNotes',
  'factOfLoss',
] as const
