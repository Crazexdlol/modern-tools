import type { ClaimFormat } from './types'

// Detects the source format of an assignment PDF from its extracted text.
// Signature: any of "Eagle View Enterprises" OR ("Admin Data" AND
// "Appraiser Details") section markers -> eagle-view. Otherwise falls
// through to modern-appraisers (default preserves today's behaviour).
export function detectFormat(text: string): ClaimFormat {
  const hasEagleViewName = /Eagle View Enterprises/i.test(text)
  const hasAdminData = /(^|\n)\s*Admin Data\s*(\n|$)/i.test(text)
  const hasAppraiserDetails = /(^|\n)\s*Appraiser Details\s*(\n|$)/i.test(text)
  if (hasEagleViewName || (hasAdminData && hasAppraiserDetails)) {
    return 'eagle-view'
  }
  return 'modern-appraisers'
}
