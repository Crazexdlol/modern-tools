// Shape of a single flagged line item in an Estimate Review.
// See docs/superpowers/specs/2026-08-25-estimate-review-design.md §3.
export type FlagCategory = 'not_included' | 'overlap' | 'excess_labor' | 'duplicate' | 'manual_entry'
export type FlagSeverity = 'low' | 'medium' | 'high'
export type SuggestedAction = 'reduce' | 'remove'

export interface FlagAmount {
  laborHours?: number
  laborRate?: number
  partPrice?: number
  total: number // dollars
}

export interface Flag {
  lineDescription: string   // e.g. "Front Bumper Cover — Replace"
  panelOrArea: string       // e.g. "Front End"
  category: FlagCategory
  severity: FlagSeverity
  iaBilled: FlagAmount
  suggested: FlagAmount & { action: SuggestedAction }
  ruleReference: string     // e.g. "P-Pages Ch. 11-18"
  ruleQuote: string         // verbatim excerpt
  // Plain-English explanation of the specific over-write on THIS line: what IA
  // did, what the rulebook says, and how the two conflict. Written as a full
  // sentence a lay reader can follow, not a citation.
  reason: string
  impact: number            // negative dollars (reduction)
}

// Manual entry (typed in by the appraiser instead of pulled from the CCC/Mitchell
// database). These bypass the guide's automated line items and are a common
// vehicle for padding. The AI lists them here so Henry can eyeball each one —
// no computed $ impact. Clearly-inflated manual entries also appear in flags[]
// under the 'manual_entry' category, with an impact.
export interface ManualEntry {
  lineDescription: string
  panelOrArea: string
  iaBilled: FlagAmount
  note?: string          // short AI observation, e.g. "no CCC equivalent found; labor time appears high"
}

// One completed review. A claim can have many.
export interface EstimateReview {
  id: string                // uuid, generated server-side
  reviewNumber: number      // sequential per claim ("#1", "#2", …)
  savedAt: string           // ISO
  fileName: string
  software: string          // e.g. "CCC ONE", "Mitchell", "Unknown"
  grandTotalBilled: number  // parsed from the estimate
  photoCount: number        // 0–10
  flags: Flag[]
  manualEntries?: ManualEntry[]  // review-worthy manual entries not caught by flags[]
  laborRates?: EstimateLaborRate[]         // extracted from the estimate (Phase 1)
  rateFindings?: LaborRateFinding[]         // computed vs. assertedRatesSnapshot
  assertedRatesSnapshot?: LaborRateAssertion[]  // what the appraiser asserted at review time
  partsFindings?: PartsFinding[]            // per-part comparison vs. attached invoices (Phase 2)
  invoiceFileNames?: string[]               // display list of the invoice files attached at review time
  laborRateReferenceFileNames?: string[]    // display list of labor-rate reference photos included at review time
  guidelineFindings?: GuidelineFinding[]    // guideline-doc checks (Phase 3) — legacy field kept for old reviews
  guidelineTitles?: string[]                 // display list of the guideline docs used at review time
  taxFindings?: TaxFinding[]                 // state sales tax check (Phase 4)
  taxBreakdown?: TaxComponentBreakdown[]     // per-component amount + tax extracted from the estimate
  documentId?: string       // set after auto-filing to Documents tab
  error?: string            // set if this file's review failed (empty flags[])
}

// ── Labor rates (Phase 1) ─────────────────────────────────────────────────
// Appraiser asserts "correct" rates per claim; the review extracts what the IA
// used on the estimate; the API computes per-category findings with dollar
// impact. Categories default to body / paint / mechanical / frame / structural
// with an "other" bucket; custom labels are allowed via free-form `label`.
export type LaborRateCategory = 'body' | 'paint' | 'mechanical' | 'frame' | 'structural' | 'other'

export const LABOR_RATE_LABELS: Record<LaborRateCategory, string> = {
  body:       'Body',
  paint:      'Paint',
  mechanical: 'Mechanical',
  frame:      'Frame',
  structural: 'Structural',
  other:      'Other',
}

export const DEFAULT_LABOR_RATE_CATEGORIES: LaborRateCategory[] = [
  'body', 'paint', 'mechanical', 'frame', 'structural',
]

// What the appraiser says the rate SHOULD be for a category.
export interface LaborRateAssertion {
  category: LaborRateCategory | string  // preset code, or custom label slug
  label: string                          // display name shown in the UI
  rate: number                            // $/hr
}

// What the IA actually used on the estimate for a category.
export interface EstimateLaborRate {
  category: LaborRateCategory | string
  label: string
  rate: number    // $/hr as shown on the estimate
  hours: number   // total hours billed at this rate on the estimate
}

// One computed comparison row.
export interface LaborRateFinding {
  category: LaborRateCategory | string
  label: string
  assertedRate: number      // appraiser-asserted rate
  estimateRate: number      // IA's rate on the estimate
  diffPerHour: number       // estimateRate − assertedRate (positive = IA over)
  hoursOnEstimate: number
  dollarImpact: number      // -(diffPerHour × hoursOnEstimate); negative = dispute reduction
  severity: FlagSeverity
}

// ── Parts invoices (Phase 2) ──────────────────────────────────────────────
// Appraiser attaches supplier invoice(s) to a review; the AI extracts line
// items from both the invoices and the estimate; the server matches them by
// part number first, description similarity second, and produces per-part
// findings. Price and qty discrepancies produce a dollar impact; orphans
// (invoice-only or estimate-only) are informational.

// A single line on an appraiser-supplied invoice.
export interface InvoiceLineItem {
  invoiceFileName: string
  partNumber: string | null
  description: string
  qty: number
  unitPrice: number
  total: number
}

// A single part line on the estimate.
export interface EstimatePartLine {
  partNumber: string | null
  description: string
  qty: number
  unitPrice: number
  total: number
}

export type PartsFindingType = 'price_mismatch' | 'qty_mismatch' | 'invoice_orphan' | 'estimate_orphan'

export interface PartsFinding {
  type: PartsFindingType
  partNumber: string | null
  description: string
  invoice?: { fileName: string; qty: number; unitPrice: number; total: number }
  estimate?: { qty: number; unitPrice: number; total: number }
  priceDeltaPerUnit: number   // estimateUnitPrice - invoiceUnitPrice; 0 for orphans
  qtyDelta: number             // estimateQty - invoiceQty; 0 for orphans
  dollarImpact: number         // negative = dispute reduction; 0 for orphans
  severity: FlagSeverity
  matchedBy?: 'part_number' | 'description'
}

// ── Guideline findings (Phase 3) ─────────────────────────────────────────
// Attach reference documents (repair procedures, position statements, P-pages)
// to a review; Claude checks the estimate's operations against those docs and
// emits findings citing document + section. Three types mirror the brief:
//   - missing:   the procedure requires an operation the estimate omits
//   - forbidden: the estimate includes an operation the procedure forbids
//   - conflict:  included/not-included labor mismatch vs. the procedure
export type GuidelineFindingType = 'missing' | 'forbidden' | 'conflict'

export interface GuidelineFinding {
  type: GuidelineFindingType
  documentTitle: string       // matches GuidelineDocument.title at review time
  documentSection: string     // "Section 3.2", "Page 14", "Position Statement item 4", etc.
  documentQuote: string       // verbatim excerpt supporting the finding
  operation: string            // the operation/line the finding is about
  estimateLineDescription?: string  // free-form pointer to the estimate line, if any
  reason: string               // plain-English explanation
  dollarImpact: number         // 0 for informational; negative if a specific reduction is proposed
  suggestedAmount?: number     // dollar-per-unit or total the appraiser should demand
  severity: FlagSeverity
}

// ── Sales tax findings (Phase 4) ─────────────────────────────────────────
// Every review auto-runs this: fetch the state's rule from state_tax_rules,
// extract per-component tax breakdown from the estimate, flag any tax
// charged on components the rule doesn't allow.
export type TaxIssueType = 'taxed_should_not_be' | 'undertaxed_should_be' | 'no_state_rule'

export interface TaxComponentBreakdown {
  category: string     // "parts", "body_labor", "refinish_labor", "materials", "sublet", etc.
  label: string        // display name from the estimate
  amount: number       // pre-tax base as billed
  taxAmount: number    // tax charged on this component
}

export interface TaxFinding {
  type: TaxIssueType
  state: string          // uppercased loss state, or empty string if unknown
  rule: string           // stored rule code (e.g. 'parts_only'); empty if no_state_rule
  ruleLabel: string      // human-readable rule
  component: string      // "Body Labor", "Refinish Labor", etc.
  taxableUnderRule: boolean
  estimateAmount: number
  estimateTax: number
  expectedTax: number
  dollarImpact: number   // -(estimateTax − expectedTax), negative = dispute reduction
  severity: FlagSeverity
  reason: string
}

// Human-facing label lookup for a category badge.
export const CATEGORY_LABEL: Record<FlagCategory, string> = {
  not_included: 'Not Included',
  overlap: 'Overlap Not Deducted',
  excess_labor: 'Excess Labor',
  duplicate: 'Duplicate Charge',
  manual_entry: 'Inflated Manual Entry',
}
