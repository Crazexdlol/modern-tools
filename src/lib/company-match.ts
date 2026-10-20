// Loose matching for company/insurer names. Free-text entries like
// "Allstate", "Allstate Ins. Co.", and "Allstate Insurance Company" all map
// to the same canonical key so dropdowns, filters, and dedup checks can
// treat them as one. Preserve substantive differentiators ("Liberty Mutual"
// stays distinct from "Liberty Insurance") by only stripping true noise
// words — common corporate suffixes and leading "The".

const NOISE_WORDS = new Set([
  'insurance',
  'ins',
  'company',
  'companies',
  'co',
  'corp',
  'corporation',
  'inc',
  'incorporated',
  'llc',
  'ltd',
  'limited',
  'group',
  'holdings',
  'the',
])

// Lowercase, strip punctuation, drop noise words, collapse whitespace.
// Returns '' for an all-noise or empty input so callers can treat null+empty
// as the same bucket.
export function normalizeCompanyName(raw: string | null | undefined): string {
  if (!raw) return ''
  const cleaned = raw
    .toLowerCase()
    .replace(/[.,/&()]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const words = cleaned.split(' ').filter(w => w && !NOISE_WORDS.has(w))
  return words.join(' ')
}

// Tighter key for exact-equality lookups like per-client notification
// routing: drops whitespace too, so "Claim Solution", "ClaimSolution",
// and "ClaimSolution Inc." all collapse to the same bucket. Use for
// map keys where small input variations shouldn't fragment matches.
export function normalizeCompanyKey(raw: string | null | undefined): string {
  return normalizeCompanyName(raw).replace(/\s+/g, '')
}

// Group a flat list by their normalized name. For each bucket, pick a
// display label: the SHORTEST non-empty original wins (ties → first-seen).
// Shortest tends to be the clean canonical form ("Allstate" beats
// "Allstate Insurance Company of North America").
export interface CompanyGroup<T> {
  key: string          // normalized key
  display: string      // chosen display label
  variants: string[]   // every unique raw spelling seen
  items: T[]
}

export function groupByCompanyName<T>(items: T[], getName: (item: T) => string | null | undefined): CompanyGroup<T>[] {
  const buckets = new Map<string, { display: string; variants: Set<string>; items: T[] }>()
  for (const item of items) {
    const raw = getName(item)
    const key = normalizeCompanyName(raw)
    if (!key) continue
    const entry = buckets.get(key)
    if (!entry) {
      buckets.set(key, {
        display: (raw ?? '').trim(),
        variants: new Set([(raw ?? '').trim()]),
        items: [item],
      })
    } else {
      entry.items.push(item)
      const rawTrimmed = (raw ?? '').trim()
      if (rawTrimmed) entry.variants.add(rawTrimmed)
      if (rawTrimmed && rawTrimmed.length < entry.display.length) entry.display = rawTrimmed
    }
  }
  return Array.from(buckets.entries())
    .map(([key, b]) => ({ key, display: b.display, variants: Array.from(b.variants), items: b.items }))
    .sort((a, b) => a.display.localeCompare(b.display))
}
