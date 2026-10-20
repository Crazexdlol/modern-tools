import type { ClaimFormat } from './types'

// Detects the source format of an uploaded PDF from its extracted text.
// Priority order: branded formats checked first (specific fingerprints),
// then softer heuristics, then the Modern Appraisers fallback.
export function detectFormat(text: string): ClaimFormat {
  // CCC ONE / CCC Market Valuation reports — fingerprint strings vary across
  // report types (Market Valuation, Full Report, Verifacts, etc.) but share
  // the "CCC" branding and "Market Valuation" or "Workfile ID" labels.
  const hasCccBrand = /CCC ONE\b|CCC Information Services|CCC Intelligent Solutions/i.test(text)
  const hasMarketValuation = /Market Valuation Report|Workfile ID/i.test(text)
  if (hasCccBrand || hasMarketValuation) {
    return 'ccc'
  }

  // ClaimSolution Inc. (dba Dakabi) — strong branded fingerprint.
  if (/ClaimSolution Inc\.|\bDakabi File\b|@claimsolution\.com/i.test(text)) {
    return 'claim-solution'
  }

  // Corbett Claim Service — "Assignment Details ... Claim Ref:" shape, plus
  // the explicit "CORBETT CLAIM SERVICE" string in the Recipient block.
  if (/CORBETT CLAIM SERVICE/i.test(text)) {
    return 'corbett'
  }

  // Crawford Vehicle Services — strong email/branding fingerprint.
  if (/Crawford Vehicle Services|@us\.crawco\.com|Crawford and Company/i.test(text)) {
    return 'crawford'
  }

  const hasEagleViewName = /Eagle View Enterprises/i.test(text)
  const hasAdminData = /(^|\n)\s*Admin Data\s*(\n|$)/i.test(text)
  const hasAppraiserDetails = /(^|\n)\s*Appraiser Details\s*(\n|$)/i.test(text)
  if (hasEagleViewName || (hasAdminData && hasAppraiserDetails)) {
    return 'eagle-view'
  }
  return 'modern-appraisers'
}
