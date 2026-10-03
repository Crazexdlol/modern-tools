import type { ClaimFormat } from './types'

// Detects the source format of an uploaded PDF from its extracted text.
// Priority: CCC first (branded strings are specific), then Eagle View, else
// default to Modern Appraisers (today's existing fallback behaviour).
export function detectFormat(text: string): ClaimFormat {
  // CCC ONE / CCC Market Valuation reports — fingerprint strings vary across
  // report types (Market Valuation, Full Report, Verifacts, etc.) but share
  // the "CCC" branding and "Market Valuation" or "Workfile ID" labels.
  const hasCccBrand = /CCC ONE\b|CCC Information Services|CCC Intelligent Solutions/i.test(text)
  const hasMarketValuation = /Market Valuation Report|Workfile ID/i.test(text)
  if (hasCccBrand || hasMarketValuation) {
    return 'ccc'
  }

  const hasEagleViewName = /Eagle View Enterprises/i.test(text)
  const hasAdminData = /(^|\n)\s*Admin Data\s*(\n|$)/i.test(text)
  const hasAppraiserDetails = /(^|\n)\s*Appraiser Details\s*(\n|$)/i.test(text)
  if (hasEagleViewName || (hasAdminData && hasAppraiserDetails)) {
    return 'eagle-view'
  }
  return 'modern-appraisers'
}
