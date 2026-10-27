// Verify the bodyType auto-widen logic end-to-end. Reproduces the exact
// filter code from ClaimWorkspace.tsx's sortedListings useMemo and runs it
// against synthetic data that simulates the Kia Soul scenario.
//
// Scenarios:
//   1. Subject "SUV" + comps all Hatchback → strict returns 0 → auto-widen fires
//   2. Subject "Sedan" + comps all Sedan → strict returns matches → no widen
//   3. Subject bodyType empty → no widen regardless
//   4. Subject "SUV" + bodyType match turned OFF → strict returns all, no widen
//   5. Subject "SUV" + comps all Hatchback + another spec mismatch → widen but
//      still 0 (other spec is strict) → no widen, no banner

const MATCH_KEYS = ['trim', 'engine', 'drivetrain', 'transmission', 'fuelType', 'bodyType']

// Copied from the component's `matchesSubjectSpec`. Simplified: trim is tolerant,
// everything else is normalised-equality.
function matchesSubjectSpec(key, subjectVal, compVal) {
  const s = (subjectVal || '').toLowerCase().trim()
  const c = (compVal || '').toLowerCase().trim()
  if (key === 'bodyType') return s === c
  if (key === 'trim') return c.includes(s)
  return s === c
}

function runFilter(listings, claim, matchSubject, activeFilters) {
  const applyFilters = (includeBodyType) => listings.filter((comp) => {
    if (!comp.id.startsWith('manual-')) {
      for (const key of MATCH_KEYS) {
        if (key === 'bodyType' && !includeBodyType) continue
        const subjectVal = claim[key]
        if (matchSubject[key] && subjectVal && !matchesSubjectSpec(key, subjectVal, comp[key] || '')) {
          return false
        }
      }
    }
    if (activeFilters.trim.length > 0 && !activeFilters.trim.includes(comp.trim || '')) return false
    if (activeFilters.bodyType.length > 0 && !activeFilters.bodyType.includes(comp.bodyType || '')) return false
    return true
  })

  const strict = applyFilters(true)
  let filtered = strict
  let widened = false
  if (strict.length === 0 && matchSubject.bodyType && (claim.bodyType || '').trim()) {
    const widenedList = applyFilters(false)
    if (widenedList.length > 0) {
      filtered = widenedList
      widened = true
    }
  }
  return { sortedListings: filtered, bodyTypeAutoWidened: widened }
}

const noFilters = { trim: [], drivetrain: [], transmission: [], engine: [], fuelType: [], bodyType: [] }
const allMatch = { trim: true, engine: true, drivetrain: true, transmission: false, fuelType: true, bodyType: true }

const scenarios = [
  {
    name: 'Kia Soul decoded as "SUV", listings are Hatchback → auto-widen fires',
    claim: { bodyType: 'SUV', trim: 'LX', engine: '', drivetrain: 'FWD', transmission: '', fuelType: 'Gasoline' },
    listings: [
      { id: 'c1', bodyType: 'Hatchback', trim: 'LX', engine: '', drivetrain: 'FWD', transmission: '', fuelType: 'Gasoline' },
      { id: 'c2', bodyType: 'Hatchback', trim: 'LX', engine: '', drivetrain: 'FWD', transmission: '', fuelType: 'Gasoline' },
      { id: 'c3', bodyType: 'Wagon',     trim: 'LX', engine: '', drivetrain: 'FWD', transmission: '', fuelType: 'Gasoline' },
    ],
    matchSubject: allMatch,
    expect: { count: 3, widened: true },
  },
  {
    name: 'Sedan subject, Sedan comps → strict matches, no widen',
    claim: { bodyType: 'Sedan', trim: 'LE', engine: '', drivetrain: 'FWD', transmission: '', fuelType: 'Gasoline' },
    listings: [
      { id: 'c1', bodyType: 'Sedan', trim: 'LE', engine: '', drivetrain: 'FWD', transmission: '', fuelType: 'Gasoline' },
      { id: 'c2', bodyType: 'Sedan', trim: 'LE', engine: '', drivetrain: 'FWD', transmission: '', fuelType: 'Gasoline' },
    ],
    matchSubject: allMatch,
    expect: { count: 2, widened: false },
  },
  {
    name: 'Subject bodyType empty → no widen even if 0 results',
    claim: { bodyType: '', trim: 'FOOBAR', engine: '', drivetrain: 'FWD', transmission: '', fuelType: 'Gasoline' },
    listings: [
      { id: 'c1', bodyType: 'Sedan', trim: 'LE', engine: '', drivetrain: 'FWD', transmission: '', fuelType: 'Gasoline' },
    ],
    matchSubject: allMatch,
    expect: { count: 0, widened: false },
  },
  {
    name: 'Subject "SUV" but Body match toggled OFF → no widen (match not on)',
    claim: { bodyType: 'SUV', trim: 'LX', engine: '', drivetrain: 'FWD', transmission: '', fuelType: 'Gasoline' },
    listings: [
      { id: 'c1', bodyType: 'Hatchback', trim: 'LX', engine: '', drivetrain: 'FWD', transmission: '', fuelType: 'Gasoline' },
    ],
    matchSubject: { ...allMatch, bodyType: false },
    expect: { count: 1, widened: false },
  },
  {
    name: 'Subject "SUV" + Hatchback comps + wrong drivetrain → widen gives 0, no banner',
    claim: { bodyType: 'SUV', trim: 'LX', engine: '', drivetrain: 'AWD', transmission: '', fuelType: 'Gasoline' },
    listings: [
      { id: 'c1', bodyType: 'Hatchback', trim: 'LX', engine: '', drivetrain: 'FWD', transmission: '', fuelType: 'Gasoline' },
    ],
    matchSubject: allMatch,
    expect: { count: 0, widened: false },
  },
  {
    name: 'Mixed: 1 strict match + others only match if widened → strict wins (no widen)',
    claim: { bodyType: 'SUV', trim: 'LX', engine: '', drivetrain: 'FWD', transmission: '', fuelType: 'Gasoline' },
    listings: [
      { id: 'c1', bodyType: 'SUV',       trim: 'LX', engine: '', drivetrain: 'FWD', transmission: '', fuelType: 'Gasoline' },
      { id: 'c2', bodyType: 'Hatchback', trim: 'LX', engine: '', drivetrain: 'FWD', transmission: '', fuelType: 'Gasoline' },
    ],
    matchSubject: allMatch,
    expect: { count: 1, widened: false },
  },
]

let allPass = true
for (const s of scenarios) {
  const result = runFilter(s.listings, s.claim, s.matchSubject, noFilters)
  const pass = result.sortedListings.length === s.expect.count && result.bodyTypeAutoWidened === s.expect.widened
  if (!pass) allPass = false
  const mark = pass ? '✓' : '✗'
  console.log(`${mark} ${s.name}`)
  console.log(`    got: count=${result.sortedListings.length}, widened=${result.bodyTypeAutoWidened}  expected: count=${s.expect.count}, widened=${s.expect.widened}`)
}

console.log(`\n${allPass ? 'ALL SCENARIOS PASS' : 'SOME SCENARIOS FAILED'}`)
process.exit(allPass ? 0 : 1)
