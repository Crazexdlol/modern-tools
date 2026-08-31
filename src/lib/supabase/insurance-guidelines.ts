import { createClient as createBrowserClient } from './client'

export interface InsuranceGuideline {
  id: string
  name: string        // display case
  nameKey: string     // lowercase, used for matching
  guidelines: string
  createdAt: string
  updatedAt: string
}

interface Row {
  id: string
  name: string
  name_key: string
  guidelines: string
  created_at: string
  updated_at: string
}

function rowToGuideline(r: Row): InsuranceGuideline {
  return {
    id: r.id,
    name: r.name,
    nameKey: r.name_key,
    guidelines: r.guidelines,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export function normalizeCompanyKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

// Aggressive normalization used ONLY for fuzzy matching (claim's insurance
// name → guideline directory lookup). Real-world claim data from external
// systems ships names like "State Farm Mutual Auto Ins. Co.",
// "PROGRESSIVE INSURANCE TPAC 3250", "Allstate®" — none of which match a
// clean directory entry like "State Farm" / "Progressive" / "Allstate"
// under the exact normalizeCompanyKey rule.
//
// This variant:
//   1. Lowercases + trims whitespace + collapses inner runs
//   2. Strips ®, ™, punctuation (`.`, `,`, `-`), digits, and TPAC codes
//   3. Removes common legal / carrier-type suffix tokens
//      (insurance, ins, co, company, mutual, corp, corporation, inc,
//       group, holdings, ltd, casualty, insurers, policyholders)
//   4. Collapses whitespace again after suffix removal
// Stored `name_key` on rows stays the strict key (backward compat); this
// looser key is computed on the fly for matching.
export function normalizeCompanyKeyLoose(name: string): string {
  const STOPWORDS = new Set([
    'insurance', 'insurances', 'insurers', 'insurer', 'ins',
    'co', 'company', 'corp', 'corporation', 'inc', 'incorporated',
    'mutual', 'group', 'holdings', 'ltd', 'llc',
    'casualty', 'property', 'auto', 'automobile', 'general',
    'policyholders', 'reciprocal', 'exchange',
    'tpac', 'the',
  ])
  const tokens = name
    .toLowerCase()
    .replace(/[®™©]/g, '')
    .replace(/[.,\-/]/g, ' ')
    .replace(/\d+/g, ' ')
    .split(/\s+/)
    .filter(t => t && !STOPWORDS.has(t))
  return tokens.join(' ').trim()
}

// Fetch every guideline (for the admin manage list).
export async function fetchAllGuidelinesBrowser(): Promise<InsuranceGuideline[]> {
  const supabase = createBrowserClient()
  const { data, error } = await supabase
    .from('insurance_guidelines')
    .select('*')
    .order('name', { ascending: true })
  if (error) {
    console.error('fetchAllGuidelinesBrowser failed:', error)
    return []
  }
  return (data as Row[]).map(rowToGuideline)
}

// Fetch just the company names, alphabetized. Used by the Insurance Company
// autocomplete on the claim form so the user picks a canonical value that
// matches a guideline exactly.
export async function fetchGuidelineNamesBrowser(): Promise<string[]> {
  const supabase = createBrowserClient()
  const { data, error } = await supabase
    .from('insurance_guidelines')
    .select('name')
    .order('name', { ascending: true })
  if (error) {
    console.error('fetchGuidelineNamesBrowser failed:', error)
    return []
  }
  return ((data ?? []) as { name: string }[]).map(r => r.name).filter(Boolean)
}

// Fetch one guideline for a claim's insurance-company name. Matching order:
//   1. Exact case-insensitive match on the stored name_key
//   2. Loose match: after stripping legal suffixes / punctuation / digits,
//      compare the claim's normalized name against every guideline's
//      normalized name. Take an equality match first, then a
//      startsWith/contains match (claim contains guideline OR guideline
//      contains claim). Longer guideline name wins ties (more specific).
// Returns null when nothing matches — the Guidelines tab renders an
// empty state for that case.
export async function fetchGuidelineByCompanyBrowser(
  companyName: string,
): Promise<InsuranceGuideline | null> {
  const strictKey = normalizeCompanyKey(companyName)
  if (!strictKey) return null

  const supabase = createBrowserClient()

  // Fast path: exact-key lookup.
  const { data: exact, error: exactErr } = await supabase
    .from('insurance_guidelines')
    .select('*')
    .eq('name_key', strictKey)
    .maybeSingle()
  if (exactErr) {
    console.error('fetchGuidelineByCompanyBrowser (exact) failed:', exactErr)
  }
  if (exact) return rowToGuideline(exact as Row)

  // Fuzzy path: fetch all + match in-memory. Directory is bounded
  // (~60-200 companies), so this stays cheap.
  const looseClaim = normalizeCompanyKeyLoose(companyName)
  if (!looseClaim) return null

  const { data: all, error: allErr } = await supabase
    .from('insurance_guidelines')
    .select('*')
  if (allErr) {
    console.error('fetchGuidelineByCompanyBrowser (all) failed:', allErr)
    return null
  }
  const rows = ((all ?? []) as Row[]).map(r => ({
    row: r,
    loose: normalizeCompanyKeyLoose(r.name),
  }))

  // 1. Exact-loose match
  let best: { row: Row; loose: string } | null = null
  for (const r of rows) {
    if (r.loose === looseClaim) { best = r; break }
  }
  if (best) return rowToGuideline(best.row)

  // 2. Containment match, prefer the longer guideline name (most specific)
  const containment = rows.filter(r =>
    r.loose.length > 0 && (looseClaim.includes(r.loose) || r.loose.includes(looseClaim)),
  )
  if (containment.length > 0) {
    containment.sort((a, b) => b.loose.length - a.loose.length)
    return rowToGuideline(containment[0].row)
  }

  return null
}
