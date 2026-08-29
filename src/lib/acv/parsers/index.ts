import { detectFormat } from './detect'
import { parseModernAppraisers } from './modern-appraisers'
import type { ParsedClaim } from './types'

// Entry point every caller uses. Detects the source format and dispatches
// to the correct parser. The eagle-view parser is added in a later task —
// until then a detected eagle-view PDF falls through to modern-appraisers
// (which won't extract much, but won't crash).
export function parseClaim(text: string): ParsedClaim {
  const format = detectFormat(text)
  switch (format) {
    case 'eagle-view':
      // TODO(task 7): return parseEagleView(text)
      return parseModernAppraisers(text)
    case 'modern-appraisers':
    default:
      return parseModernAppraisers(text)
  }
}

export type { ParsedClaim } from './types'
export { detectFormat } from './detect'
