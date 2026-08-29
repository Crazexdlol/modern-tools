// Claim work types — controls which tool tabs appear in the workspace.
// 'other' unlocks every tool (used for mixed/complex claims). Multiple can
// be selected. Empty array = legacy claim (no filtering, all tools shown).
export type ClaimType = 'acv' | 'dv' | 'estimate' | 'other'

export interface ClaimInfo {
  maNumber: string
  claimNumber: string
  handlingAppraiser?: string
  // Type-driven tool visibility. Optional so pre-existing claims (imported
  // or created before this field existed) fall through to "show all tools".
  claimTypes?: ClaimType[]
  // Date the assignment was received (parsed from the CL PDF's Appraisal
  // Information -> Date Created field). Auto-fills Date Received Claim on
  // the Summary Page. Optional so existing claims that predate this field
  // continue to work.
  dateReceived?: string
  dateOfLoss: string
  clientType: 'Insured' | 'Claimant'
  clientName: string
  insuredName: string
  ownerPhone: string
  ownerEmail: string
  ownerAddress: string
  // Optional Claimant contact block. Populated when the assignment PDF
  // captures a separate claimant party from the insured (Eagle View format
  // only for now). Existing claims fall through with these undefined —
  // non-breaking; downstream consumers keep reading insuredName/owner*.
  claimantName?: string
  claimantPhone?: string
  claimantEmail?: string
  claimantAddress?: string
  insuranceCompany: string
  adjuster: string
  adjusterPhone: string
  adjusterEmail: string
  vin: string
  year: number
  make: string
  model: string
  trim: string
  engine: string
  drivetrain: string
  transmission: string
  fuelType: string
  mileage: number
  zip: string
  radius: number
}

export interface MarketComp {
  id: string
  vin: string
  price: number
  miles: number
  year: number
  make: string
  model: string
  trim: string
  engine: string
  drivetrain: string
  transmission: string
  fuelType: string
  dealerName: string
  dealerPhone: string
  dealerCity: string
  dealerState: string
  photoUrl: string
  heading: string
  distanceMi: number
  vdpUrl: string
}

export interface SelectedComp extends MarketComp {
  mileageDiffRaw: number      // comp_miles - subject_miles
  mileageAdjDollar: number    // $ adjustment for mileage
  yearDiffRaw: number         // comp_year - subject_year
  yearAdjDollar: number       // $ adjustment for year
  compValue: number           // price + mileageAdjDollar + yearAdjDollar
}

export interface ACVAdjustments {
  vehicleHistory: number
  vehicleHistoryNote: string
  priorDamages: number
  priorDamagesNote: string
  additions: number
  additionsNote: string
  deductions: number           // always -500 for dealer vs private
  deductionsNote: string
  taxRate: number
  notes: string
}

export interface ACVResult {
  comp1Value: number
  comp2Value: number
  comp3Value: number
  averageValue: number
  totalAdjustments: number
  taxAmount: number
  acv: number
}
