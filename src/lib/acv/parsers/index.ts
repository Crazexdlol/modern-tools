import { detectFormat } from './detect'
import { parseModernAppraisers } from './modern-appraisers'
import { parseEagleView } from './eagle-view'
import { parseCcc } from './ccc'
import { parseClaimSolution } from './claim-solution'
import { parseCorbett } from './corbett'
import { parseCrawford } from './crawford'
import type { ParsedClaim } from './types'

// Entry point every caller uses. Detects the source format and dispatches
// to the correct parser.
export function parseClaim(text: string): ParsedClaim {
  const format = detectFormat(text)
  switch (format) {
    case 'ccc':
      return parseCcc(text)
    case 'eagle-view':
      return parseEagleView(text)
    case 'claim-solution':
      return parseClaimSolution(text)
    case 'corbett':
      return parseCorbett(text)
    case 'crawford':
      return parseCrawford(text)
    case 'modern-appraisers':
    default:
      return parseModernAppraisers(text)
  }
}

export type { ParsedClaim } from './types'
export { detectFormat } from './detect'
