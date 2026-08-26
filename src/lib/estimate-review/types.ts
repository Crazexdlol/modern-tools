// Shape of a single flagged line item in an Estimate Review.
// See docs/superpowers/specs/2026-08-25-estimate-review-design.md §3.
export type FlagCategory = 'not_included' | 'overlap' | 'excess_labor' | 'duplicate'
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
  impact: number            // negative dollars (reduction)
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
  documentId?: string       // set after auto-filing to Documents tab
  error?: string            // set if this file's review failed (empty flags[])
}

// Human-facing label lookup for a category badge.
export const CATEGORY_LABEL: Record<FlagCategory, string> = {
  not_included: 'Not Included',
  overlap: 'Overlap Not Deducted',
  excess_labor: 'Excess Labor',
  duplicate: 'Duplicate Charge',
}
