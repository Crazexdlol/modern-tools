// Claim work types — controls which tool tabs appear in the workspace.
// 'other' is an "unlock everything" marker — when selected, every tool tab
// is visible regardless of the other type chips. Claims labeled 'other' are
// also excluded from Settlement Analytics (which is strictly ACV).
// 'rta' (Right To Appraisal) is a negotiation flag: when combined with a
// value-dispute type (acv/dv/estimate), it gates the Opposing Appraiser
// field as required at creation. A value-dispute claim WITHOUT 'rta' is
// treated as report-only — no OA needed. Doesn't change tool visibility.
// desk/lou/full/salvage/specialty/umpire are descriptive modifiers (no
// tool-visibility effect on their own). Multiple can be selected. Empty
// array = legacy claim (all tools shown).
export type ClaimType = 'rta' | 'acv' | 'dv' | 'estimate' | 'storage' | 'other' | 'desk' | 'lou' | 'full' | 'salvage' | 'specialty' | 'umpire'

// ── Loss of Use (LOU) tool ───────────────────────────────────────────────────
// Per-claim LOU state, stored as acv_history.lou jsonb via workspace
// auto-save. The two PDF templates (days / hours) share the same input
// shape; only the final-days derivation differs. See
// src/lib/acv/lou-pdf-filler.ts for the field map and the
// supabase/migration-lou.sql for the DB column.
export interface LOURentalListing {
  description: string   // free text — year/make/model/trim or dealer name
  dailyRate: number     // $/day
}

export interface LOUState {
  template: 'days' | 'hours'
  // Insurance co name / address / phone / email, owner contact, adjuster
  // name / phone / email, vehicle year / make / model / VIN / mileage all
  // pull straight from ClaimInfo at print time — same pattern as DV / ACV /
  // Award / Notes. The only state the LOU tab owns is template choice,
  // rentals, dates specific to this tool, and the days/hours inputs below.
  dateUnitReceived: string      // ISO date (YYYY-MM-DD) — the end date of the
                                // loss-of-use period (vehicle returned to owner).
                                // Days = this − Date of Loss for the DAYS variant.
                                // Also fills the right-side date slot on the PDF.
  // Deprecated — merged into dateUnitReceived. Kept on the interface so old
  // saved claims still deserialize; not read by anything new.
  dateCompleted?: string
  // Deprecated — removed from the UI; template still exposes a Dropdown2 for
  // plate state, but we no longer fill it. Kept so old claims deserialize.
  licenseState: string
  rentals: [LOURentalListing, LOURentalListing, LOURentalListing]
  // Used when template === 'days' — direct days count.
  days: number
  // Used when template === 'hours' — the hours-based derivation table on
  // the HOURS template bottom: labor hours → business repair days →
  // weekends + additional days → total days.
  laborHours: number
  businessRepairDays: number
  weekends: number
  additionalDays: number
  // Two freeform adjustment lines that total into "Adjustments" on the form.
  // Positive values add to the LOU; negative values subtract.
  adjustment1Label: string
  adjustment1Value: number
  adjustment2Label: string
  adjustment2Value: number
  // Freeform text for the "Additional Notes" box on the LOU PDF. Falls back
  // to a standard sentence when left empty — matches the ACV notes default.
  notes: string
}

export function defaultLOUState(): LOUState {
  return {
    template: 'days',
    dateUnitReceived: '',
    licenseState: '',
    rentals: [
      { description: '', dailyRate: 0 },
      { description: '', dailyRate: 0 },
      { description: '', dailyRate: 0 },
    ],
    days: 0,
    laborHours: 0,
    businessRepairDays: 0,
    weekends: 0,
    additionalDays: 0,
    adjustment1Label: '',
    adjustment1Value: 0,
    adjustment2Label: '',
    adjustment2Value: 0,
    notes: '',
  }
}

// Sum of the two adjustment lines (the "Adjustments" value on the form).
export function totalLOUAdjustments(state: LOUState): number {
  return (state.adjustment1Value || 0) + (state.adjustment2Value || 0)
}

// Average daily rate across the three rental comps (zero-rate entries
// are ignored so a half-filled form doesn't drag the average down).
export function averageRentalRate(rentals: LOURentalListing[]): number {
  const nonZero = rentals.map(r => r.dailyRate).filter(r => r > 0)
  if (nonZero.length === 0) return 0
  return nonZero.reduce((a, b) => a + b, 0) / nonZero.length
}

// Business Repair Days = labor hours ÷ 4, rounded up.
// (4h = 1d, 6h = 2d, 9h = 3d, 12h = 3d, etc.)
export function hoursBusinessRepairDays(laborHours: number): number {
  if (!laborHours || laborHours <= 0) return 0
  return Math.ceil(laborHours / 4)
}

// Weekend days that fall inside the repair window. Starts at the Date of
// Loss, walks forward one calendar day at a time, counting Sat/Sun as
// weekend days and Mon-Fri as business days until the given number of
// business days is reached.
//
// Examples (DOL = Mon, N business days):
//   N=3  → weekends=0  (Mon, Tue, Wed)
//   N=5  → weekends=0  (Mon-Fri)
//   N=6  → weekends=2  (Mon-Fri + Sat/Sun + Mon)
//   N=15 → weekends=4  (3 weeks of M-F, 2 weekends in between)
// DOL = Fri, N=3 → weekends=2 (Fri + Sat/Sun + Mon-Tue).
export function hoursWeekendDays(businessRepairDays: number, dateOfLoss?: string): number {
  if (businessRepairDays <= 0 || !dateOfLoss) return 0
  const dol = new Date(dateOfLoss)
  if (isNaN(dol.getTime())) return 0
  const cursor = new Date(dol)
  cursor.setHours(0, 0, 0, 0)
  let weekends = 0
  let business = 0
  // Safety ceiling — never iterate past ~2 years of calendar days.
  for (let i = 0; i < 800 && business < businessRepairDays; i++) {
    const dow = cursor.getDay()
    if (dow === 0 || dow === 6) weekends++
    else business++
    cursor.setDate(cursor.getDate() + 1)
  }
  return weekends
}

// Resolve "total days" from an LOU state.
//   'days'  template: derive from (Date Unit Received − Date of Loss).
//                     Fallbacks: legacy `dateCompleted` field, then the
//                     manual `state.days` number.
//   'hours' template: auto-compute Business Repair Days from Labor Hours,
//                     auto-compute weekends from DOL day-of-week + BRD,
//                     then add user-entered Additional Days.
export function totalDaysFor(state: LOUState, dateOfLoss?: string): number {
  if (state.template === 'days') {
    const endDate = state.dateUnitReceived || state.dateCompleted
    if (dateOfLoss && endDate) {
      const dol = new Date(dateOfLoss)
      const end = new Date(endDate)
      if (!isNaN(dol.getTime()) && !isNaN(end.getTime())) {
        const diff = Math.round((end.getTime() - dol.getTime()) / 86_400_000)
        return Math.max(0, diff)
      }
    }
    return Math.max(0, state.days)
  }
  const brd = hoursBusinessRepairDays(state.laborHours)
  const wkd = hoursWeekendDays(brd, dateOfLoss)
  return brd + wkd + Math.max(0, state.additionalDays)
}

// Average Value row: averageRate × totalDays (the "subtotal" before adjustments).
export function averageLOUValue(state: LOUState, dateOfLoss?: string): number {
  return averageRentalRate(state.rentals) * totalDaysFor(state, dateOfLoss)
}

// Final LOU dollar amount: averageRate × totalDays + adjustments.
export function finalLOUFor(state: LOUState, dateOfLoss?: string): number {
  return averageLOUValue(state, dateOfLoss) + totalLOUAdjustments(state)
}

// ── Storage Charges tool ─────────────────────────────────────────────────────
// One row per billable storage-related item. Line total is Hours × Rate;
// Qty is display-only (count of the item, not multiplied into the total).
// Persisted as jsonb on acv_history.storage.
export interface StorageLine {
  id: string          // client-generated per row so React keys are stable
  qty: number         // display only, default 1
  description: string
  hours: number
  rate: number        // $/hr
}

export interface StorageState {
  lines: StorageLine[]
  taxRatePct: number  // 0-100
  notes: string
  savedAt?: string    // ISO
}

export interface ClaimInfo {
  maNumber: string
  claimNumber: string
  // Negotiating Appraiser (renamed from handlingAppraiser 2026-10-13).
  // Metadata on the claim — does NOT drive routing. Admin picks the actual
  // negotiator at reassign time from a dropdown.
  negotiatingAppraiser?: string
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
  // Which specific person at the client company sent us this file. Null when
  // the claim was attributed to the company only. Picked via the ClientPicker
  // when the user selects a "Person @ Company" row. Stored here (jsonb) rather
  // than as a column so no migration is required; per-person counts come
  // from the Clients admin page by filtering acv_history.claim->>'clientContactId'.
  clientContactId?: string | null
  // Display name of the attached contact (duplicated here from
  // client_contacts.name so the read-only Claim Info and the in-claim header
  // can render "Company - Person" without an extra fetch). Stale if the
  // contact is later renamed — acceptable: same stale-copy pattern as
  // vehicle labels / insuredName.
  clientContactName?: string | null
  insuredName: string
  // Vehicle owner name. May differ from the insured (e.g. parent's policy
  // on child's car) or the claimant (third-party claims). Optional for
  // back-compat with existing claims that only tracked insuredName; the UI
  // falls back to insuredName when ownerName is empty.
  ownerName?: string
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
  // Policy deductible in dollars. Optional so existing claims that predate
  // this field still deserialize; downstream consumers should treat undefined
  // as 0 / not-set.
  deductible?: number
  vin: string
  year: number
  make: string
  model: string
  trim: string
  engine: string
  drivetrain: string
  transmission: string
  fuelType: string
  // Body type / chassis — one of BODY_TYPE_OPTIONS (Sedan, Coupe, Hatchback,
  // Wagon, Convertible, SUV, Crossover, Pickup, Van, Minivan, Other) or ''
  // if not set. Populated by VIN decode (bodyStyle → normalizeBodyType) and
  // editable manually in the Claim Info form. Optional for back-compat with
  // existing claims that predate this field.
  bodyType?: string
  mileage: number
  zip: string
  radius: number
  // Where the vehicle physically is for the inspection — body shop, tow
  // yard, residence, etc. Separate from ownerAddress because the vehicle
  // often isn't at the owner's home. Two fields: the holder's name (e.g.
  // "Caliber Collision") and its street address. Both optional for
  // back-compat.
  vehicleLocationName?: string
  vehicleLocationAddress?: string
  // Contact at the location (shop manager, tow-yard clerk, residence contact)
  // — their name and phone/email. Freeform single string, e.g.
  // "John Smith (555) 123-4567". Optional and app-internal; never comes from
  // a parsed assignment sheet.
  vehicleLocationContact?: string
  // Legacy single-field version — kept so pre-split claims still deserialize
  // cleanly. The two new fields above take precedence in the UI; this field
  // is read as a fallback for display only (never written to by new code).
  vehicleLocation?: string
  // Free-form notes surfaced at the bottom of the Claim Info tab. Both
  // optional for back-compat with existing claims; stored inline on the
  // claim jsonb (no schema change needed).
  //  - appraiserNotes: the appraiser's working memo
  //    (displayed as "Handling Instructions" in the UI)
  //  - factOfLoss: narrative description of how the loss happened
  appraiserNotes?: string
  factOfLoss?: string
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
  // Body type (Sedan / Coupe / SUV / etc). Normalised at the API edge from
  // MarketCheck's `build.body_type` or Auto.dev's `vehicle.bodyStyle`. Empty
  // string when the source listing didn't carry one. Used by the subject-spec
  // "Body" match toggle.
  bodyType: string
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
