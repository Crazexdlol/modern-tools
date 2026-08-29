// Extract 2-letter USPS state code from a freeform US address like
// "123 Main St, Miami, FL 33101" or "Apt 4, Tampa, FL, 33612-1234".
// Returns null if no state found.
export function extractLossState(ownerAddress: string | undefined | null): string | null {
  if (!ownerAddress) return null
  // Primary: state directly before ZIP (most reliable — 99% of US addresses)
  const before = ownerAddress.match(/\b([A-Z]{2})\s+\d{5}(?:-\d{4})?\b/)
  if (before) return before[1]
  // Fallback: state at end after comma (e.g. "…, FL")
  const trail = ownerAddress.match(/,\s*([A-Z]{2})\s*$/)
  if (trail) return trail[1]
  return null
}
