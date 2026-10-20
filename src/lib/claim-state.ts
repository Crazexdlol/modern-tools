// Extract 2-letter USPS state code from a freeform US address like
// "123 Main St, Miami, FL 33101" or "Apt 4, Tampa, FL, 33612-1234".
// Returns null if no state found. Case-insensitive — accepts "fl 33101".
export function extractLossState(ownerAddress: string | undefined | null): string | null {
  if (!ownerAddress) return null
  const before = ownerAddress.match(/\b([A-Za-z]{2})\s+\d{5}(?:-\d{4})?\b/)
  if (before) return before[1].toUpperCase()
  const trail = ownerAddress.match(/,\s*([A-Za-z]{2})\s*$/)
  if (trail) return trail[1].toUpperCase()
  return null
}
