import type { ACVHistoryEntry } from '@/lib/supabase/history'

// Shared multi-term search for claim rows. Used by every search surface
// (dashboard filter, nav-bar magnifying-glass popover, messages queue). The
// query is tokenized on whitespace and ALL tokens must match at least one of
// the searchable fields (AND semantics). This lets Henry type queries like
// "Sedgwick ACV" and match claims whose client is Sedgwick AND whose claim
// type includes ACV.
//
// Searchable surface (lowercased, concatenated per entry):
//   • MA # and claim #
//   • VIN and vehicle y/m/m
//   • insured name, client name, insurance company name
//   • claim types (both the raw code and the human label — "acv", "ACV",
//     "dv", "DV", "estimate", "Est", "storage", "Storage", "LOU", etc.)
//   • negotiating appraiser name (claim.negotiatingAppraiser)
//   • assigned-to display name (admin-only context — pass nameFor)
//
// Pass empty query → everything matches.

const CLAIM_TYPE_LABELS: Record<string, string> = {
  rta: 'RTA Right To Appraisal',
  acv: 'ACV',
  dv: 'DV',
  estimate: 'Estimate Est',
  storage: 'Storage',
  other: 'Other',
  desk: 'Desk',
  lou: 'LOU Loss of Use',
  full: 'Full',
  salvage: 'Salvage',
  specialty: 'Specialty',
  umpire: 'Umpire',
}

function buildSearchable(entry: ACVHistoryEntry, assigneeName: string): string {
  const parts: string[] = []
  const push = (v: unknown) => {
    if (v == null) return
    const s = String(v).trim()
    if (s) parts.push(s.toLowerCase())
  }
  push(entry.maNumber)
  push(entry.vin)
  push(entry.vehicle)
  push(entry.claim?.claimNumber)
  push(entry.claim?.ownerName)
  push(entry.claim?.insuredName)
  push(entry.claim?.claimantName)
  push(entry.claim?.clientName)
  push(entry.claim?.insuranceCompany)
  push(entry.claim?.negotiatingAppraiser)
  push(assigneeName)
  const types = entry.claim?.claimTypes ?? []
  for (const t of types) {
    push(t)                                 // raw code: 'acv', 'dv', …
    push(CLAIM_TYPE_LABELS[t] ?? '')        // human labels: 'ACV', 'DV', …
  }
  return parts.join(' | ')
}

export function matchesClaimSearch(
  entry: ACVHistoryEntry,
  query: string,
  assigneeName: string = '',
): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const haystack = buildSearchable(entry, assigneeName)
  // Tokenize on any whitespace, AND-match. Empty tokens (double-space) are
  // dropped so "a  b" behaves the same as "a b".
  const tokens = q.split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return true
  return tokens.every(t => haystack.includes(t))
}
