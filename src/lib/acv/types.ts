export interface ClaimInfo {
  maNumber: string
  claimNumber: string
  dateOfLoss: string
  clientType: 'Insured' | 'Claimant'
  clientName: string
  insuredName: string
  ownerPhone: string
  ownerEmail: string
  ownerAddress: string
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
