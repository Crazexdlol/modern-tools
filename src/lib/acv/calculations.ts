import type { SelectedComp, ACVAdjustments, ACVResult } from './types'

// ── Mileage adjustment rubric ────────────────────────────────────────────────
type VehicleCategory =
  | 'economy' | 'midsize_sedan' | 'fullsize_sedan' | 'minivan'
  | 'compact_suv' | 'midsize_suv' | 'fullsize_suv'
  | 'light_truck' | 'fullsize_truck' | 'hd_truck'
  | 'luxury' | 'luxury_suv' | 'sports' | 'performance' | 'exotic'

const CATEGORY_BASE_RATE: Record<VehicleCategory, number> = {
  economy: 0.03,
  midsize_sedan: 0.04,
  fullsize_sedan: 0.05,
  minivan: 0.03,
  compact_suv: 0.04,
  midsize_suv: 0.05,
  fullsize_suv: 0.06,
  light_truck: 0.04,
  fullsize_truck: 0.05,
  hd_truck: 0.06,
  luxury: 0.08,
  luxury_suv: 0.09,
  sports: 0.08,
  performance: 0.10,
  exotic: 0.15,
}

// Lowercase model keywords → category
const MODEL_CATEGORY_MAP: [RegExp, VehicleCategory][] = [
  // Exotic
  [/ferrari|lamborghini|mclaren|bugatti|pagani|koenigsegg|aston martin|bentley continental gt/i, 'exotic'],
  // Performance (before luxury so M3/AMG/etc match here)
  [/\bm[2-8]\b|m coupe|m roadster|\bamg\b|rs\s?\d|rc\s?f|lc\s?500|is\s?f|gs\s?f|corvette|gt350|gt500|shelby|hellcat|demon|redeye|srt|nismo|gr supra|type\s?r|\bsti\b|golf\s?r\b/i, 'performance'],
  // Sports
  [/mustang|camaro|challenger|supra|86\b|brz|miata|mx-5|370z|350z|nissan z\b|cayman|boxster|s2000|rx-7|rx-8|wrx/i, 'sports'],
  // Luxury SUV
  [/cayenne|macan|urus|cullinan|bentayga|gls|gle|glc|x[3-7]|q[3-8]|rx|nx|gx|lx|mdx|rdx|xc90|xc60|escalade|navigator|range rover|discovery|velar|evoque|e-pace|f-pace/i, 'luxury_suv'],
  // Luxury
  [/bmw|mercedes|audi|lexus|genesis|porsche|maserati|jaguar|infiniti|acura|volvo|alfa romeo|lincoln|cadillac/i, 'luxury'],
  // HD Truck
  [/f-?250|f-?350|f-?450|f-?550|silverado\s?(2500|3500)|sierra\s?(2500|3500)|ram\s?(2500|3500)|cummins|duramax|power stroke/i, 'hd_truck'],
  // Full-size Truck
  [/f-?150|silverado(?!\s?(2500|3500))|sierra(?!\s?(2500|3500))|ram\s?1500|tundra|titan(?!\s?xd)/i, 'fullsize_truck'],
  // Light Truck
  [/tacoma|ranger|frontier|colorado|canyon|maverick|santa cruz|ridgeline/i, 'light_truck'],
  // Full-size SUV
  [/tahoe|suburban|expedition|sequoia|armada|yukon|4runner|wagoneer|durango/i, 'fullsize_suv'],
  // Midsize SUV
  [/highlander|pilot|explorer|pathfinder|atlas|palisade|telluride|sorento|traverse|blazer(?!.*ev)|cx-9|cx-90/i, 'midsize_suv'],
  // Compact SUV
  [/rav4|cr-v|crv|tucson|sportage|rogue|escape|bronco sport|cx-5|cx-50|seltos|kona|crosstrek|outlander|equinox|trax|kicks|hr-v|hrv|venue|eclipse cross/i, 'compact_suv'],
  // Minivan
  [/sienna|odyssey|pacifica|carnival|grand caravan|sedona/i, 'minivan'],
  // Full-size Sedan
  [/avalon|maxima|charger|300c|impala|taurus|lacrosse|lucerne/i, 'fullsize_sedan'],
  // Midsize Sedan
  [/camry|accord|altima|sonata|malibu|fusion|optima|k5|mazda6|legacy|passat/i, 'midsize_sedan'],
  // Economy
  [/corolla|civic|sentra|elantra|versa|fit|yaris|spark|sonic|cruze|forte|rio|accent|mirage|impreza|jetta|golf(?!\s?r)|mazda3|prius|ioniq|bolt|leaf/i, 'economy'],
]

function classifyVehicle(make: string, model: string, trim: string): VehicleCategory {
  const combined = `${make} ${model} ${trim}`
  for (const [pattern, category] of MODEL_CATEGORY_MAP) {
    if (pattern.test(combined)) return category
  }
  // Fallback: if make is luxury brand, default to luxury
  if (/bmw|mercedes|audi|lexus|genesis|porsche|maserati|jaguar|infiniti|acura|volvo|alfa romeo|lincoln|cadillac/i.test(make)) {
    return 'luxury'
  }
  return 'midsize_sedan'
}

function getAgeMultiplier(vehicleYear: number): number {
  const currentYear = new Date().getFullYear()
  const age = currentYear - vehicleYear
  if (age <= 3) return 1.5
  if (age <= 7) return 1.0
  if (age <= 12) return 0.75
  return 0.5
}

export function getMileageRate(make: string, model: string, trim: string, year: number): number {
  const category = classifyVehicle(make, model, trim)
  const baseRate = CATEGORY_BASE_RATE[category]
  const multiplier = getAgeMultiplier(year)
  return Math.round(baseRate * multiplier * 1000) / 1000 // round to 3 decimals
}

// Coerce to a finite number; NaN/undefined/null (e.g. missing miles on a
// listing, or a partially saved adjustment) become 0 instead of poisoning
// every downstream total with NaN.
const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export function calculateCompValue(comp: Pick<SelectedComp, 'price' | 'mileageAdjDollar' | 'yearAdjDollar'>): number {
  return num(comp.price) + num(comp.mileageAdjDollar) + num(comp.yearAdjDollar)
}

export function calculateACV(comps: SelectedComp[], adjustments: ACVAdjustments): ACVResult {
  const comp1Value = num(comps[0]?.compValue)
  const comp2Value = num(comps[1]?.compValue)
  const comp3Value = num(comps[2]?.compValue)
  const compCount = Math.min(comps.length, 3) || 1
  const averageValue = (comp1Value + comp2Value + comp3Value) / compCount
  const totalAdjustments =
    num(adjustments.vehicleHistory) +
    num(adjustments.priorDamages) +
    num(adjustments.additions) +
    num(adjustments.deductions)
  const taxAmount = averageValue * (num(adjustments.taxRate) / 100)
  const acv = averageValue + totalAdjustments + taxAmount
  return { comp1Value, comp2Value, comp3Value, averageValue, totalAdjustments, taxAmount, acv }
}

export function formatCurrency(val: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val)
}

export function defaultAdjustments(): ACVAdjustments {
  return {
    vehicleHistory: 0,
    vehicleHistoryNote: '',
    priorDamages: 0,
    priorDamagesNote: '',
    additions: 0,
    additionsNote: '',
    deductions: -500,
    deductionsNote: 'Dealer Vs. Private ($500.00)',
    taxRate: 0,
    notes: 'Based on the information provided, I have attached the recommended ACV on this vehicle. Information was calculated using the information supplied and established with available comps.',
  }
}
