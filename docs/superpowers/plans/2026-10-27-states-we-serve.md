# States We Serve — Phase 1 implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 48 state pages live on modernappraisers.com with mega-dropdown nav, data-driven template, sitemap entries, and 15 pilot hero images. Zero legal content; MA/RI excluded via validator.

**Architecture:** TypeScript data files per state read by a shared Next.js dynamic route. Sitemap and nav generated from the same index. Validator script enforces data integrity and prevents MA/RI reintroduction.

**Tech Stack:** Next.js 16 (App Router), React 19.2, TypeScript, Tailwind v4, sharp (image resize), vitest (validator tests). All inside `modernappraisers/`.

**Spec:** `docs/superpowers/specs/2026-10-27-states-we-serve-design.md`
**Branch:** `states-we-serve` (NEVER merge to main without PR)

---

## File map

### New

- `modernappraisers/src/data/state-types.ts` — `StateContent`, `HeroImage`, `StateMeta` interfaces
- `modernappraisers/src/data/states/_index.ts` — `STATES: StateMeta[]`
- `modernappraisers/src/data/states/<slug>.ts` × 48 — one per state
- `modernappraisers/src/data/state-adjacency.ts` — US state neighbor map (data only)
- `modernappraisers/src/app/states/page.tsx` — `/states` directory
- `modernappraisers/src/app/states/[slug]/page.tsx` — `/states/<slug>` dynamic
- `modernappraisers/src/components/states/state-hero.tsx` — hero (real or placeholder)
- `modernappraisers/src/components/states/state-attribution.tsx` — credit line
- `modernappraisers/src/components/states/state-page.tsx` — template body
- `modernappraisers/src/components/states/state-card.tsx` — directory card
- `modernappraisers/src/components/states/state-mega-menu.tsx` — desktop dropdown
- `modernappraisers/src/components/states/state-mobile-menu.tsx` — mobile accordion
- `modernappraisers/scripts/validate-states.mjs` — pre-commit guard
- `modernappraisers/__tests__/validate-states.test.ts` — vitest tests for validator
- `modernappraisers/public/states/*.jpg` × 15 — pilot hero images

### Modified

- `modernappraisers/src/app/sitemap.ts` — iterate STATES
- `modernappraisers/src/components/site-header.tsx` — mount mega-menu + mobile menu
- `modernappraisers/package.json` — add `validate` script + wire into `lint`

---

### Task 1: Shared types

**Files:**
- Create: `modernappraisers/src/data/state-types.ts`

- [ ] **Step 1: Write the types file**

```ts
// modernappraisers/src/data/state-types.ts

export type ImageLicense = 'CC0' | 'CC-BY-4.0' | 'CC-BY-SA-4.0' | 'PD-US' | 'PD-US-no-notice'

export interface HeroImage {
  url: string                 // public path, e.g. "/states/nevada.jpg"
  sourcePageUrl: string       // Wikimedia Commons file-info page
  author: string
  license: ImageLicense
  attribution: string         // exact credit line to render
  verifiedAt: string          // ISO date YYYY-MM-DD, hand-written
}

export interface StateMeta {
  slug: string                // "nevada"
  name: string                // "Nevada"
  abbreviation: string        // "NV"
}

export interface StateContent extends StateMeta {
  heroImage: HeroImage | null
  intro: string               // 60-100 words, non-legal
  majorCities: string[]       // 2-5 cities named in intro
  relatedStates: string[]     // 4-6 neighbor slugs, hand-picked
  seo: {
    title: string
    description: string       // 140-160 chars target
  }
  // Phase 2 placeholders — always null/false/empty in Phase 1
  legalSections: null
  citations: readonly never[]
  verified: false
  verifiedAt: null
  verifiedBy: null
}
```

- [ ] **Step 2: Verify compile**

Run (from `modernappraisers/`): `npx tsc --noEmit`
Expected: no errors (file is self-contained).

- [ ] **Step 3: Commit**

```bash
git add modernappraisers/src/data/state-types.ts
git commit -m "feat(states): shared type definitions"
```

---

### Task 2: State index (empty) + adjacency map

**Files:**
- Create: `modernappraisers/src/data/states/_index.ts`
- Create: `modernappraisers/src/data/state-adjacency.ts`

- [ ] **Step 1: Write the (empty) index**

```ts
// modernappraisers/src/data/states/_index.ts
// Alphabetical list of US states we serve. Massachusetts and Rhode Island
// are intentionally excluded. The validator fails the build if either is
// added. Count must be exactly 48.

import type { StateMeta } from '../state-types'

export const STATES: readonly StateMeta[] = [] as const
```

(Populated in Task 4. Shipping empty first keeps commits focused.)

- [ ] **Step 2: Write the adjacency map**

```ts
// modernappraisers/src/data/state-adjacency.ts
// Geographic neighbors by slug. Used to default the relatedStates list for
// each state. Massachusetts and Rhode Island slugs appear here so neighbors
// can reference them, but the state-content loader filters them out when
// resolving relatedStates (since those pages don't exist).

export const ADJACENT: Readonly<Record<string, readonly string[]>> = {
  alabama:        ['tennessee', 'georgia', 'florida', 'mississippi'],
  alaska:         [],
  arizona:        ['california', 'nevada', 'utah', 'new-mexico', 'colorado'],
  arkansas:       ['missouri', 'tennessee', 'mississippi', 'louisiana', 'texas', 'oklahoma'],
  california:     ['oregon', 'nevada', 'arizona'],
  colorado:       ['wyoming', 'nebraska', 'kansas', 'oklahoma', 'new-mexico', 'arizona', 'utah'],
  connecticut:    ['new-york', 'rhode-island', 'massachusetts'],
  delaware:       ['pennsylvania', 'new-jersey', 'maryland'],
  florida:        ['georgia', 'alabama'],
  georgia:        ['florida', 'alabama', 'tennessee', 'north-carolina', 'south-carolina'],
  hawaii:         [],
  idaho:          ['washington', 'oregon', 'nevada', 'utah', 'wyoming', 'montana'],
  illinois:       ['wisconsin', 'iowa', 'missouri', 'kentucky', 'indiana'],
  indiana:        ['michigan', 'illinois', 'kentucky', 'ohio'],
  iowa:           ['minnesota', 'wisconsin', 'illinois', 'missouri', 'nebraska', 'south-dakota'],
  kansas:         ['nebraska', 'missouri', 'oklahoma', 'colorado'],
  kentucky:       ['indiana', 'ohio', 'west-virginia', 'virginia', 'tennessee', 'missouri', 'illinois'],
  louisiana:      ['texas', 'arkansas', 'mississippi'],
  maine:          ['new-hampshire'],
  maryland:       ['pennsylvania', 'delaware', 'virginia', 'west-virginia'],
  michigan:       ['wisconsin', 'indiana', 'ohio'],
  minnesota:      ['north-dakota', 'south-dakota', 'iowa', 'wisconsin'],
  mississippi:    ['tennessee', 'alabama', 'louisiana', 'arkansas'],
  missouri:       ['iowa', 'illinois', 'kentucky', 'tennessee', 'arkansas', 'oklahoma', 'kansas', 'nebraska'],
  montana:        ['north-dakota', 'south-dakota', 'wyoming', 'idaho'],
  nebraska:       ['south-dakota', 'iowa', 'missouri', 'kansas', 'colorado', 'wyoming'],
  nevada:         ['oregon', 'idaho', 'utah', 'arizona', 'california'],
  'new-hampshire':['maine', 'massachusetts', 'vermont'],
  'new-jersey':   ['new-york', 'pennsylvania', 'delaware'],
  'new-mexico':   ['colorado', 'oklahoma', 'texas', 'arizona', 'utah'],
  'new-york':     ['vermont', 'massachusetts', 'connecticut', 'new-jersey', 'pennsylvania'],
  'north-carolina':['virginia', 'tennessee', 'georgia', 'south-carolina'],
  'north-dakota': ['montana', 'south-dakota', 'minnesota'],
  ohio:           ['michigan', 'indiana', 'kentucky', 'west-virginia', 'pennsylvania'],
  oklahoma:       ['kansas', 'missouri', 'arkansas', 'texas', 'new-mexico', 'colorado'],
  oregon:         ['washington', 'idaho', 'nevada', 'california'],
  pennsylvania:   ['new-york', 'new-jersey', 'delaware', 'maryland', 'west-virginia', 'ohio'],
  'south-carolina':['north-carolina', 'georgia'],
  'south-dakota': ['north-dakota', 'minnesota', 'iowa', 'nebraska', 'wyoming', 'montana'],
  tennessee:      ['kentucky', 'virginia', 'north-carolina', 'georgia', 'alabama', 'mississippi', 'arkansas', 'missouri'],
  texas:          ['oklahoma', 'arkansas', 'louisiana', 'new-mexico'],
  utah:           ['idaho', 'wyoming', 'colorado', 'new-mexico', 'arizona', 'nevada'],
  vermont:        ['new-hampshire', 'massachusetts', 'new-york'],
  virginia:       ['maryland', 'west-virginia', 'kentucky', 'tennessee', 'north-carolina'],
  washington:     ['idaho', 'oregon'],
  'west-virginia':['pennsylvania', 'maryland', 'virginia', 'kentucky', 'ohio'],
  wisconsin:      ['michigan', 'minnesota', 'iowa', 'illinois'],
  wyoming:        ['montana', 'south-dakota', 'nebraska', 'colorado', 'utah', 'idaho'],
}
```

- [ ] **Step 3: Verify compile + commit**

```bash
cd modernappraisers && npx tsc --noEmit
cd .. && git add modernappraisers/src/data/
git commit -m "feat(states): empty index + state adjacency map"
```

---

### Task 3: Validation script + vitest tests

**Files:**
- Create: `modernappraisers/scripts/validate-states.mjs`
- Create: `modernappraisers/__tests__/validate-states.test.ts`

- [ ] **Step 1: Write the validator**

```js
// modernappraisers/scripts/validate-states.mjs
// Fails build if the states data has structural issues. Runnable standalone
// or wired into `npm run lint`. Zero deps beyond Node + fs.

import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '..', 'src', 'data', 'states')
const INDEX_FILE = join(DATA_DIR, '_index.ts')

const EXCLUDED_SLUGS = new Set(['massachusetts', 'rhode-island'])
const EXPECTED_COUNT = 48
const INTRO_WORD_MIN = 50
const INTRO_WORD_MAX = 120

export function validate(options = { quiet: false }) {
  const errors = []
  const warnings = []

  if (!existsSync(INDEX_FILE)) {
    errors.push(`Missing index file: ${INDEX_FILE}`)
    return { errors, warnings }
  }

  const indexSrc = readFileSync(INDEX_FILE, 'utf8')
  // Parse slugs out of the index: the file is TS source, but we only need
  // the string literals in the slug positions. Simple regex is sufficient
  // since the file follows a strict shape.
  const slugRegex = /slug:\s*'([a-z-]+)'/g
  const indexSlugs = []
  let m
  while ((m = slugRegex.exec(indexSrc)) !== null) indexSlugs.push(m[1])

  if (indexSlugs.length !== EXPECTED_COUNT) {
    errors.push(`Expected ${EXPECTED_COUNT} entries in _index.ts, found ${indexSlugs.length}.`)
  }

  const seen = new Set()
  for (const slug of indexSlugs) {
    if (seen.has(slug)) errors.push(`Duplicate slug in _index.ts: ${slug}`)
    seen.add(slug)
    if (EXCLUDED_SLUGS.has(slug)) errors.push(`Forbidden slug in _index.ts: ${slug}`)
  }

  // Check each listed slug has a matching data file.
  for (const slug of indexSlugs) {
    const dataFile = join(DATA_DIR, `${slug}.ts`)
    if (!existsSync(dataFile)) {
      errors.push(`Missing data file for slug ${slug}: ${dataFile}`)
      continue
    }
    const src = readFileSync(dataFile, 'utf8')
    // Extract the intro string (first `intro: \`...\`` or `intro: '...'`).
    const introMatch = src.match(/intro:\s*(?:`([\s\S]*?)`|'([^']*)'|"([^"]*)")/)
    if (!introMatch) {
      errors.push(`${slug}: missing intro string`)
    } else {
      const intro = (introMatch[1] ?? introMatch[2] ?? introMatch[3] ?? '').trim()
      const words = intro.split(/\s+/).filter(Boolean).length
      if (words < INTRO_WORD_MIN || words > INTRO_WORD_MAX) {
        errors.push(`${slug}: intro has ${words} words, expected ${INTRO_WORD_MIN}-${INTRO_WORD_MAX}`)
      }
    }

    // If heroImage is non-null, require full metadata.
    const heroNull = /heroImage:\s*null/.test(src)
    if (heroNull) {
      warnings.push(`${slug}: heroImage is null (placeholder in Phase 1)`)
    } else {
      for (const field of ['url', 'sourcePageUrl', 'author', 'license', 'attribution', 'verifiedAt']) {
        const re = new RegExp(`${field}:\\s*(?:'[^']+'|"[^"]+")`)
        if (!re.test(src)) {
          errors.push(`${slug}: heroImage missing field "${field}"`)
        }
      }
    }
  }

  // Orphan data files (file exists but not in index).
  const dataFiles = readdirSync(DATA_DIR).filter(f => f.endsWith('.ts') && f !== '_index.ts').map(f => f.replace(/\.ts$/, ''))
  for (const f of dataFiles) {
    if (!seen.has(f)) errors.push(`Orphan data file not in _index.ts: ${f}.ts`)
    if (EXCLUDED_SLUGS.has(f)) errors.push(`Forbidden data file exists: ${f}.ts`)
  }

  // Duplicate hero image URLs across states.
  const heroUrlRegex = /url:\s*'(\/states\/[^']+)'/
  const heroUrls = new Map()
  for (const f of dataFiles) {
    const src = readFileSync(join(DATA_DIR, `${f}.ts`), 'utf8')
    const match = src.match(heroUrlRegex)
    if (match) {
      const url = match[1]
      if (heroUrls.has(url)) {
        errors.push(`Duplicate hero image URL ${url} used by both ${heroUrls.get(url)} and ${f}`)
      }
      heroUrls.set(url, f)
    }
  }

  return { errors, warnings }
}

// Standalone entrypoint.
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('validate-states.mjs')) {
  const { errors, warnings } = validate()
  for (const w of warnings) console.warn(`WARN: ${w}`)
  for (const e of errors) console.error(`ERROR: ${e}`)
  if (errors.length > 0) {
    console.error(`\nvalidate-states: ${errors.length} error(s), ${warnings.length} warning(s).`)
    process.exit(1)
  }
  console.log(`validate-states: 0 errors, ${warnings.length} warning(s).`)
}
```

- [ ] **Step 2: Write vitest tests**

```ts
// modernappraisers/__tests__/validate-states.test.ts
import { describe, it, expect } from 'vitest'
import { validate } from '../scripts/validate-states.mjs'

describe('validate-states', () => {
  it('runs without crashing on current repo state', () => {
    const { errors, warnings } = validate()
    // Depending on where the engineer is in the plan, this may have errors
    // (e.g. index empty, no data files). We just assert the function returns
    // the expected shape.
    expect(Array.isArray(errors)).toBe(true)
    expect(Array.isArray(warnings)).toBe(true)
  })
})
```

- [ ] **Step 3: Add npm script**

Modify `modernappraisers/package.json`. Find the `"scripts"` block and add:

```json
"validate:states": "node scripts/validate-states.mjs"
```

- [ ] **Step 4: Run the validator**

Run (from `modernappraisers/`): `npm run validate:states`
Expected: fails with `Expected 48 entries in _index.ts, found 0.` (because index is still empty).

- [ ] **Step 5: Run vitest**

Run: `npx vitest run __tests__/validate-states.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add modernappraisers/scripts/validate-states.mjs modernappraisers/__tests__/validate-states.test.ts modernappraisers/package.json
git commit -m "feat(states): validation script + vitest coverage"
```

---

### Task 4: Populate `_index.ts` with 48 states

**Files:**
- Modify: `modernappraisers/src/data/states/_index.ts`

- [ ] **Step 1: Replace empty array with 48 entries**

```ts
// modernappraisers/src/data/states/_index.ts
import type { StateMeta } from '../state-types'

export const STATES: readonly StateMeta[] = [
  { slug: 'alabama',        name: 'Alabama',        abbreviation: 'AL' },
  { slug: 'alaska',         name: 'Alaska',         abbreviation: 'AK' },
  { slug: 'arizona',        name: 'Arizona',        abbreviation: 'AZ' },
  { slug: 'arkansas',       name: 'Arkansas',       abbreviation: 'AR' },
  { slug: 'california',     name: 'California',     abbreviation: 'CA' },
  { slug: 'colorado',       name: 'Colorado',       abbreviation: 'CO' },
  { slug: 'connecticut',    name: 'Connecticut',    abbreviation: 'CT' },
  { slug: 'delaware',       name: 'Delaware',       abbreviation: 'DE' },
  { slug: 'florida',        name: 'Florida',        abbreviation: 'FL' },
  { slug: 'georgia',        name: 'Georgia',        abbreviation: 'GA' },
  { slug: 'hawaii',         name: 'Hawaii',         abbreviation: 'HI' },
  { slug: 'idaho',          name: 'Idaho',          abbreviation: 'ID' },
  { slug: 'illinois',       name: 'Illinois',       abbreviation: 'IL' },
  { slug: 'indiana',        name: 'Indiana',        abbreviation: 'IN' },
  { slug: 'iowa',           name: 'Iowa',           abbreviation: 'IA' },
  { slug: 'kansas',         name: 'Kansas',         abbreviation: 'KS' },
  { slug: 'kentucky',       name: 'Kentucky',       abbreviation: 'KY' },
  { slug: 'louisiana',      name: 'Louisiana',      abbreviation: 'LA' },
  { slug: 'maine',          name: 'Maine',          abbreviation: 'ME' },
  { slug: 'maryland',       name: 'Maryland',       abbreviation: 'MD' },
  { slug: 'michigan',       name: 'Michigan',       abbreviation: 'MI' },
  { slug: 'minnesota',      name: 'Minnesota',      abbreviation: 'MN' },
  { slug: 'mississippi',    name: 'Mississippi',    abbreviation: 'MS' },
  { slug: 'missouri',       name: 'Missouri',       abbreviation: 'MO' },
  { slug: 'montana',        name: 'Montana',        abbreviation: 'MT' },
  { slug: 'nebraska',       name: 'Nebraska',       abbreviation: 'NE' },
  { slug: 'nevada',         name: 'Nevada',         abbreviation: 'NV' },
  { slug: 'new-hampshire',  name: 'New Hampshire',  abbreviation: 'NH' },
  { slug: 'new-jersey',     name: 'New Jersey',     abbreviation: 'NJ' },
  { slug: 'new-mexico',     name: 'New Mexico',     abbreviation: 'NM' },
  { slug: 'new-york',       name: 'New York',       abbreviation: 'NY' },
  { slug: 'north-carolina', name: 'North Carolina', abbreviation: 'NC' },
  { slug: 'north-dakota',   name: 'North Dakota',   abbreviation: 'ND' },
  { slug: 'ohio',           name: 'Ohio',           abbreviation: 'OH' },
  { slug: 'oklahoma',       name: 'Oklahoma',       abbreviation: 'OK' },
  { slug: 'oregon',         name: 'Oregon',         abbreviation: 'OR' },
  { slug: 'pennsylvania',   name: 'Pennsylvania',   abbreviation: 'PA' },
  { slug: 'south-carolina', name: 'South Carolina', abbreviation: 'SC' },
  { slug: 'south-dakota',   name: 'South Dakota',   abbreviation: 'SD' },
  { slug: 'tennessee',      name: 'Tennessee',      abbreviation: 'TN' },
  { slug: 'texas',          name: 'Texas',          abbreviation: 'TX' },
  { slug: 'utah',           name: 'Utah',           abbreviation: 'UT' },
  { slug: 'vermont',        name: 'Vermont',        abbreviation: 'VT' },
  { slug: 'virginia',       name: 'Virginia',       abbreviation: 'VA' },
  { slug: 'washington',     name: 'Washington',     abbreviation: 'WA' },
  { slug: 'west-virginia',  name: 'West Virginia',  abbreviation: 'WV' },
  { slug: 'wisconsin',      name: 'Wisconsin',      abbreviation: 'WI' },
  { slug: 'wyoming',        name: 'Wyoming',        abbreviation: 'WY' },
] as const
```

- [ ] **Step 2: Verify validator now reports "missing data files" (not "wrong count")**

Run: `cd modernappraisers && npm run validate:states`
Expected: 48 errors like `Missing data file for slug alabama: ...` (one per state). No count error.

- [ ] **Step 3: Commit**

```bash
git add modernappraisers/src/data/states/_index.ts
git commit -m "feat(states): seed 48-state alphabetical index (MA + RI excluded)"
```

---

### Task 5: Create all 48 state data files

**Files:**
- Create: `modernappraisers/src/data/states/<slug>.ts` × 48

This is the longest task. Each state file has a unique intro (60-100 words) and SEO metadata. All ship with `heroImage: null` initially; the 15 pilot states get their hero image in Task 15.

- [ ] **Step 1: Create a reference file for Alabama (first in the list) to lock the shape**

```ts
// modernappraisers/src/data/states/alabama.ts
import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'alabama',
  name: 'Alabama',
  abbreviation: 'AL',
  heroImage: null,
  intro:
    "Modern Appraisers provides independent vehicle appraisal services across Alabama, from Birmingham and Montgomery to Mobile, Huntsville, and the Gulf Coast. Our documented valuations and dispute resolution services support drivers, attorneys, body shops, and claims professionals handling total-loss settlements, diminished value, cost-of-repair disputes, and specialty-vehicle matters. We work on first-party and third-party claims and provide written appraisals built to withstand scrutiny in appraisal-clause proceedings, settlement negotiations, and litigation throughout the state.",
  majorCities: ['Birmingham', 'Montgomery', 'Mobile', 'Huntsville'],
  relatedStates: ['tennessee', 'georgia', 'florida', 'mississippi'],
  seo: {
    title: 'Auto Appraisal Services in Alabama | Modern Appraisers',
    description:
      'Independent vehicle appraisals in Alabama. Actual Cash Value, diminished value, cost-of-repair disputes, and appraisal clause support statewide — Birmingham, Mobile, Montgomery, Huntsville.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
```

- [ ] **Step 2: Create the remaining 47 state files**

For each state in the index (except Alabama which was just created), create a file following the exact same shape. The intro must:
- Be 60-100 words.
- Mention 2-5 cities in that state.
- Mention services generically (ACV, DV, cost-of-repair, appraisal clause, specialty vehicles).
- Be unique — not a template with name substituted.

Related states come from `src/data/state-adjacency.ts`, filtering out `massachusetts` and `rhode-island`. If filtering leaves fewer than 4, pad with other nearby states (I'll do this during execution).

SEO title pattern: `"Auto Appraisal Services in <State Name> | Modern Appraisers"`.
SEO description pattern: `"Independent vehicle appraisals in <State>. Actual Cash Value, diminished value, cost-of-repair disputes, and appraisal clause support statewide — <two or three cities>."` — adjusted to fit 140-160 chars.

**NOTE for the executing agent:** this task is content-heavy (~4,000 words across 47 files). Batch per US region to maintain context. All intros are **NON-LEGAL**. No statutes, no citations, no claims about state law.

- [ ] **Step 3: Run validator**

Run: `cd modernappraisers && npm run validate:states`
Expected: 0 errors. 48 warnings (one per null hero).

- [ ] **Step 4: Run tsc**

Run: `cd modernappraisers && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add modernappraisers/src/data/states/
git commit -m "feat(states): 48 state data files with unique intros (hero images deferred)"
```

---

### Task 6: `<StateHero>` component

**Files:**
- Create: `modernappraisers/src/components/states/state-hero.tsx`

- [ ] **Step 1: Write the component**

```tsx
// modernappraisers/src/components/states/state-hero.tsx
import Link from 'next/link'
import Image from 'next/image'
import type { StateContent } from '@/data/state-types'

// Deterministic hue from the state name — simple sum-of-char-codes mod 360.
// Produces a consistent per-state gradient when no real hero image exists.
function hueFromName(name: string): number {
  let sum = 0
  for (const ch of name) sum = (sum + ch.charCodeAt(0)) % 360
  return sum
}

export function StateHero({ state }: { state: StateContent }) {
  const title = `Auto Appraisal Services in ${state.name}`

  if (state.heroImage) {
    return (
      <section className="relative w-full h-[360px] md:h-[460px] overflow-hidden">
        <Image
          src={state.heroImage.url}
          alt={`${state.name} landscape`}
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-black/35" aria-hidden />
        <div className="relative z-10 h-full flex flex-col items-center justify-center text-center text-white px-6">
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight">{title}</h1>
          <p className="mt-3 text-sm md:text-base max-w-2xl">
            Independent, documented vehicle appraisals and dispute-resolution services.
          </p>
          <Link
            href="/submitaclaim"
            className="mt-6 inline-block bg-[color:var(--color-accent)] hover:brightness-110 text-white font-semibold px-6 py-3 rounded-md"
          >
            Submit a Claim
          </Link>
        </div>
      </section>
    )
  }

  const hue = hueFromName(state.name)
  const gradient = `linear-gradient(135deg, hsl(${hue}, 55%, 28%) 0%, hsl(${(hue + 40) % 360}, 60%, 42%) 100%)`

  return (
    <section
      className="relative w-full h-[360px] md:h-[460px] overflow-hidden flex flex-col items-center justify-center text-center text-white px-6"
      style={{ background: gradient }}
    >
      <h1 className="text-3xl md:text-5xl font-bold tracking-tight">{title}</h1>
      <p className="mt-3 text-sm md:text-base max-w-2xl">
        Independent, documented vehicle appraisals and dispute-resolution services.
      </p>
      <Link
        href="/submitaclaim"
        className="mt-6 inline-block bg-[color:var(--color-accent)] hover:brightness-110 text-white font-semibold px-6 py-3 rounded-md"
      >
        Submit a Claim
      </Link>
    </section>
  )
}
```

- [ ] **Step 2: Verify compile**

Run: `cd modernappraisers && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add modernappraisers/src/components/states/state-hero.tsx
git commit -m "feat(states): StateHero component (real image or deterministic gradient)"
```

---

### Task 7: `<StateAttribution>` + `<StatePage>` + `<StateCard>`

**Files:**
- Create: `modernappraisers/src/components/states/state-attribution.tsx`
- Create: `modernappraisers/src/components/states/state-page.tsx`
- Create: `modernappraisers/src/components/states/state-card.tsx`

- [ ] **Step 1: StateAttribution**

```tsx
// modernappraisers/src/components/states/state-attribution.tsx
import type { HeroImage } from '@/data/state-types'

export function StateAttribution({ image }: { image: HeroImage | null }) {
  if (!image) return null
  return (
    <p className="text-xs text-[color:var(--color-ink-muted)] text-center py-2 border-b border-black/5">
      Photo:{' '}
      <a href={image.sourcePageUrl} target="_blank" rel="noreferrer" className="underline hover:text-[color:var(--color-accent)]">
        {image.attribution}
      </a>{' '}
      ({image.license})
    </p>
  )
}
```

- [ ] **Step 2: StateCard (for the directory)**

```tsx
// modernappraisers/src/components/states/state-card.tsx
import Link from 'next/link'
import type { StateMeta } from '@/data/state-types'

export function StateCard({ state }: { state: StateMeta }) {
  return (
    <Link
      href={`/states/${state.slug}`}
      className="block rounded-lg border border-black/10 hover:border-[color:var(--color-accent)] p-4 transition-colors bg-white"
    >
      <div className="text-xs font-semibold text-[color:var(--color-ink-muted)] mb-1">{state.abbreviation}</div>
      <div className="text-base font-semibold text-[color:var(--color-ink)]">{state.name}</div>
    </Link>
  )
}
```

- [ ] **Step 3: StatePage template**

```tsx
// modernappraisers/src/components/states/state-page.tsx
import Link from 'next/link'
import type { StateContent } from '@/data/state-types'
import { STATES } from '@/data/states/_index'
import { StateHero } from './state-hero'
import { StateAttribution } from './state-attribution'

const SERVICES = [
  { href: '/actualcashvalue', title: 'Actual Cash Value',       desc: 'Comparable-market valuations for total-loss settlements.' },
  { href: '/diminishedvalue', title: 'Diminished Value',        desc: 'Post-repair value loss documented and defended.' },
  { href: '/costofrepair',    title: 'Cost of Repair Disputes', desc: 'Independent review of estimates and supplements.' },
  { href: '/righttoappraisal',title: 'Appraisal Clause',        desc: 'Appraiser and umpire services for policy appraisal provisions.' },
  { href: '/lossofuse',       title: 'Loss of Use',             desc: 'Documented rental and loss-of-use valuations.' },
  { href: '/storage',         title: 'Storage',                 desc: 'Reasonable storage-charge documentation and review.' },
]

export function StatePage({ state }: { state: StateContent }) {
  const nameBySlug = new Map(STATES.map(s => [s.slug, s.name]))
  const related = state.relatedStates
    .filter(slug => nameBySlug.has(slug))     // drop MA/RI (never in index) + any typo
    .slice(0, 6)

  return (
    <article>
      <StateHero state={state} />
      <StateAttribution image={state.heroImage} />

      <section className="max-w-4xl mx-auto px-6 py-12">
        <p className="text-lg text-[color:var(--color-ink)] leading-relaxed">{state.intro}</p>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-12">
        <h2 className="text-2xl font-bold text-[color:var(--color-ink)] mb-6">Our Services</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {SERVICES.map(s => (
            <Link
              key={s.href}
              href={s.href}
              className="block rounded-lg border border-black/10 hover:border-[color:var(--color-accent)] p-5 transition-colors bg-white"
            >
              <div className="font-semibold text-[color:var(--color-ink)]">{s.title}</div>
              <div className="text-sm text-[color:var(--color-ink-muted)] mt-1">{s.desc}</div>
            </Link>
          ))}
        </div>
      </section>

      {related.length > 0 && (
        <section className="max-w-6xl mx-auto px-6 pb-12">
          <h2 className="text-2xl font-bold text-[color:var(--color-ink)] mb-6">Related States</h2>
          <div className="flex flex-wrap gap-3">
            {related.map(slug => (
              <Link
                key={slug}
                href={`/states/${slug}`}
                className="inline-block px-4 py-2 rounded-md border border-black/10 hover:border-[color:var(--color-accent)] bg-white text-sm text-[color:var(--color-ink)]"
              >
                {nameBySlug.get(slug)}
              </Link>
            ))}
            <Link
              href="/states"
              className="inline-block px-4 py-2 rounded-md bg-[color:var(--color-accent)] text-white text-sm font-semibold"
            >
              All States
            </Link>
          </div>
        </section>
      )}

      <section className="bg-[color:var(--color-ink)] text-white py-16">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-2xl md:text-3xl font-bold">Need an appraisal in {state.name}?</h2>
          <p className="mt-3 text-white/80 max-w-2xl mx-auto">
            Reach out to our team for a documented, defensible appraisal that stands up to scrutiny.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link href="/submitaclaim" className="inline-block bg-[color:var(--color-accent)] hover:brightness-110 font-semibold px-6 py-3 rounded-md">
              Submit a Claim
            </Link>
            <Link href="/contact" className="inline-block border border-white/40 hover:border-white font-semibold px-6 py-3 rounded-md">
              Contact Us
            </Link>
          </div>
        </div>
      </section>
    </article>
  )
}
```

- [ ] **Step 4: Verify + commit**

```bash
cd modernappraisers && npx tsc --noEmit
cd .. && git add modernappraisers/src/components/states/
git commit -m "feat(states): StateAttribution, StateCard, StatePage components"
```

---

### Task 8: `/states/[slug]` dynamic route

**Files:**
- Create: `modernappraisers/src/app/states/[slug]/page.tsx`

- [ ] **Step 1: Write the route**

```tsx
// modernappraisers/src/app/states/[slug]/page.tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { STATES } from '@/data/states/_index'
import { StatePage } from '@/components/states/state-page'

export async function generateStaticParams() {
  return STATES.map(s => ({ slug: s.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  try {
    const mod = await import(`@/data/states/${slug}`)
    const content = mod.default
    return {
      title: content.seo.title,
      description: content.seo.description,
      alternates: { canonical: `/states/${slug}` },
    }
  } catch {
    return { title: 'State not found' }
  }
}

export default async function StatePageRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!STATES.some(s => s.slug === slug)) notFound()
  const mod = await import(`@/data/states/${slug}`)
  return <StatePage state={mod.default} />
}
```

- [ ] **Step 2: Build check**

Run: `cd modernappraisers && npm run build`
Expected: 48 `/states/<slug>` entries show in the output as `●  (Static)`.

- [ ] **Step 3: Commit**

```bash
git add modernappraisers/src/app/states/
git commit -m "feat(states): /states/[slug] dynamic route with static generation"
```

---

### Task 9: `/states` directory page

**Files:**
- Create: `modernappraisers/src/app/states/page.tsx`

- [ ] **Step 1: Write the directory**

```tsx
// modernappraisers/src/app/states/page.tsx
import type { Metadata } from 'next'
import { STATES } from '@/data/states/_index'
import { StateCard } from '@/components/states/state-card'

export const metadata: Metadata = {
  title: 'States We Serve — Independent Auto Appraisals Nationwide',
  description:
    'Modern Appraisers provides independent vehicle appraisal services across 48 US states. Browse state-specific appraisal information and submit a claim.',
  alternates: { canonical: '/states' },
}

export default function StatesDirectoryPage() {
  return (
    <main className="max-w-6xl mx-auto px-6 py-12">
      <h1 className="text-3xl md:text-4xl font-bold text-[color:var(--color-ink)]">States We Serve</h1>
      <p className="mt-3 text-[color:var(--color-ink-muted)] max-w-3xl">
        Modern Appraisers provides independent, documented vehicle appraisals and dispute-resolution services
        across 48 US states. Choose a state below for state-specific information and to submit a claim.
      </p>
      <div className="mt-10 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {STATES.map(s => <StateCard key={s.slug} state={s} />)}
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Verify + commit**

```bash
cd modernappraisers && npm run build
cd .. && git add modernappraisers/src/app/states/page.tsx
git commit -m "feat(states): /states directory landing page"
```

---

### Task 10: Desktop mega-dropdown

**Files:**
- Create: `modernappraisers/src/components/states/state-mega-menu.tsx`

- [ ] **Step 1: Write the component**

```tsx
// modernappraisers/src/components/states/state-mega-menu.tsx
"use client"

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { STATES } from '@/data/states/_index'

const CLOSE_GRACE_MS = 150

// Build 4 columns of 12. STATES is already alphabetical.
const COLUMNS = (() => {
  const perCol = Math.ceil(STATES.length / 4)
  return [0, 1, 2, 3].map(i => STATES.slice(i * perCol, (i + 1) * perCol))
})()

export function StateMegaMenu() {
  const [open, setOpen] = useState(false)
  const closeTimerRef = useRef<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const cancelClose = () => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }
  const scheduleClose = () => {
    cancelClose()
    closeTimerRef.current = window.setTimeout(() => setOpen(false), CLOSE_GRACE_MS)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseEnter={() => { cancelClose(); setOpen(true) }}
      onMouseLeave={scheduleClose}
    >
      <Link
        href="/states"
        className="hover:text-[color:var(--color-accent)]"
        aria-haspopup="true"
        aria-expanded={open}
        onFocus={() => setOpen(true)}
      >
        States We Serve
      </Link>

      {open && (
        <div
          className="absolute left-0 top-full mt-3 z-40 bg-white border border-black/10 rounded-lg shadow-xl p-6 w-[760px] max-w-[90vw]"
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          <div className="grid grid-cols-4 gap-x-6 gap-y-1">
            {COLUMNS.map((col, i) => (
              <ul key={i} className="space-y-1">
                {col.map(s => (
                  <li key={s.slug}>
                    <Link
                      href={`/states/${s.slug}`}
                      className="block px-2 py-1 rounded text-sm text-[color:var(--color-ink)] hover:bg-[color:var(--color-accent)]/10 hover:text-[color:var(--color-accent)]"
                      onClick={() => setOpen(false)}
                    >
                      {s.name}
                    </Link>
                  </li>
                ))}
              </ul>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-black/5 text-right">
            <Link href="/states" className="text-xs text-[color:var(--color-accent)] font-semibold hover:underline" onClick={() => setOpen(false)}>
              View all states →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify + commit**

```bash
cd modernappraisers && npx tsc --noEmit
cd .. && git add modernappraisers/src/components/states/state-mega-menu.tsx
git commit -m "feat(states): desktop mega-dropdown with hover grace period"
```

---

### Task 11: Mobile menu

**Files:**
- Create: `modernappraisers/src/components/states/state-mobile-menu.tsx`

- [ ] **Step 1: Write the component**

```tsx
// modernappraisers/src/components/states/state-mobile-menu.tsx
"use client"

import Link from 'next/link'
import { useState } from 'react'
import { STATES } from '@/data/states/_index'

export function StateMobileMenu({ onNavigate }: { onNavigate?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between py-2 text-left text-xl font-semibold text-[color:var(--color-ink)]"
        aria-expanded={open}
      >
        <span>States We Serve</span>
        <span className="text-sm text-[color:var(--color-ink-muted)]">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <ul className="pl-3 space-y-1 pb-3">
          <li>
            <Link href="/states" className="block py-1 text-sm text-[color:var(--color-accent)] font-semibold" onClick={onNavigate}>
              View all states →
            </Link>
          </li>
          {STATES.map(s => (
            <li key={s.slug}>
              <Link href={`/states/${s.slug}`} className="block py-1 text-base text-[color:var(--color-ink)]" onClick={onNavigate}>
                {s.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify + commit**

```bash
cd modernappraisers && npx tsc --noEmit
cd .. && git add modernappraisers/src/components/states/state-mobile-menu.tsx
git commit -m "feat(states): mobile accordion menu"
```

---

### Task 12: Mount nav items in site-header

**Files:**
- Modify: `modernappraisers/src/components/site-header.tsx`

- [ ] **Step 1: Read the current file**

Run `Read` on `modernappraisers/src/components/site-header.tsx` to see its exact shape (navigation link array, desktop + mobile nav JSX).

- [ ] **Step 2: Add imports at top**

```ts
import { StateMegaMenu } from '@/components/states/state-mega-menu'
import { StateMobileMenu } from '@/components/states/state-mobile-menu'
```

- [ ] **Step 3: Insert `<StateMegaMenu />` in the desktop nav JSX**

Position: between "Services" and "Property Types" in the inline nav loop. Replace the plain `<Link>` approach for that one slot with the component. Keep every other nav link as-is. Exact placement depends on the current file structure — do it as a surgical insertion, not a rewrite.

- [ ] **Step 4: Insert `<StateMobileMenu onNavigate={() => setMobileOpen(false)} />` in the mobile drawer JSX**

Position: in the vertical mobile nav, in the same alphabetical slot as desktop. Pass the drawer's close setter so tapping a state closes the hamburger.

- [ ] **Step 5: Verify + commit**

```bash
cd modernappraisers && npm run build
cd .. && git add modernappraisers/src/components/site-header.tsx
git commit -m "feat(states): mount States We Serve mega-menu + mobile accordion in site-header"
```

---

### Task 13: Extend sitemap

**Files:**
- Modify: `modernappraisers/src/app/sitemap.ts`

- [ ] **Step 1: Rewrite sitemap**

```ts
// modernappraisers/src/app/sitemap.ts
import type { MetadataRoute } from 'next'
import { STATES } from '@/data/states/_index'

const BASE = 'https://www.modernappraisers.com'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  const existing = [
    '',
    '/about',
    '/services',
    '/vehicles',
    '/faq',
    '/contact',
    '/submitaclaim',
    '/righttoappraisal',
    '/actualcashvalue',
    '/diminishedvalue',
    '/costofrepair',
    '/lossofuse',
    '/storage',
    '/terms',
    '/privacy-policy',
    '/fulfillment-policy',
  ]
  const states = STATES.map(s => `/states/${s.slug}`)
  const dir = ['/states']
  return [...existing, ...dir, ...states].map(path => ({
    url: `${BASE}${path}`,
    lastModified: now,
    changeFrequency: path === '' ? 'weekly' : 'monthly',
    priority:
      path === '' ? 1 :
      path.startsWith('/states/') ? 0.6 :
      path === '/states' ? 0.7 :
      path.length < 15 ? 0.8 : 0.6,
  }))
}
```

- [ ] **Step 2: Verify + commit**

```bash
cd modernappraisers && npm run build
cd .. && git add modernappraisers/src/app/sitemap.ts
git commit -m "feat(states): extend sitemap with /states + 48 state routes"
```

---

### Task 14: Pilot hero images (15 states)

**Files:**
- Create: `modernappraisers/public/states/<slug>.jpg` × 15
- Modify: `modernappraisers/src/data/states/<pilot-slug>.ts` × 15 — populate `heroImage`

Pilot list (locked in spec): nevada, california, texas, florida, new-york, arizona, colorado, georgia, illinois, washington, ohio, virginia, oregon, north-carolina, pennsylvania.

- [ ] **Step 1: For each pilot state, find one eligible Wikimedia Commons image**

Process per state:
1. Use `WebSearch` or `WebFetch` to find a Commons image for the state's most recognizable landscape/landmark.
2. Open the Commons file-info page.
3. Confirm the license is `CC0`, `CC-BY-4.0`, `CC-BY-SA-4.0`, `PD-US`, or `PD-US-no-notice`. If not, skip and try another.
4. Record: author name, exact license, source page URL, suggested attribution line.

- [ ] **Step 2: Download + optimize**

For each state's chosen image URL:

```bash
# Example for Nevada; replace URL + slug per state
curl -L -o /tmp/raw-nevada.jpg "<direct image URL from Commons>"
cd modernappraisers
npx sharp-cli --input /tmp/raw-nevada.jpg --output public/states/nevada.jpg resize 1600 --withoutEnlargement true --jpeg quality=82
```

If `sharp-cli` is not available, use a small Node script:

```js
// modernappraisers/scripts/_resize-hero.mjs (ephemeral, delete after use)
import sharp from 'sharp'
import { argv } from 'node:process'
const [, , input, output] = argv
await sharp(input).resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 82 }).toFile(output)
console.log(`Wrote ${output}`)
```

Run per state: `node scripts/_resize-hero.mjs /tmp/raw-nevada.jpg public/states/nevada.jpg`

- [ ] **Step 3: Populate heroImage in each pilot state's data file**

For each pilot state (e.g. Nevada), edit `modernappraisers/src/data/states/nevada.ts` and replace `heroImage: null` with the populated struct:

```ts
heroImage: {
  url: '/states/nevada.jpg',
  sourcePageUrl: 'https://commons.wikimedia.org/wiki/File:<actual filename>',
  author: '<author name>',
  license: 'CC-BY-SA-4.0', // or whichever applies
  attribution: '<Author> via Wikimedia Commons',
  verifiedAt: '2026-10-27',
},
```

- [ ] **Step 4: Run validator**

Run: `cd modernappraisers && npm run validate:states`
Expected: 0 errors. 33 warnings (one per remaining placeholder state).

- [ ] **Step 5: Build**

Run: `cd modernappraisers && npm run build`
Expected: clean, with Next.js reporting the 15 image files as static assets.

- [ ] **Step 6: Commit**

```bash
git add modernappraisers/public/states/ modernappraisers/src/data/states/*.ts
git commit -m "feat(states): hero images for 15 pilot states (Wikimedia Commons)"
```

---

### Task 15: Wire validator into lint

**Files:**
- Modify: `modernappraisers/package.json`

- [ ] **Step 1: Update lint script**

Find the `"lint"` entry in `scripts` and change it so validate runs first:

```json
"lint": "node scripts/validate-states.mjs && next lint"
```

- [ ] **Step 2: Verify**

Run: `cd modernappraisers && npm run lint`
Expected: validator prints `0 errors`, then `next lint` runs.

- [ ] **Step 3: Commit**

```bash
git add modernappraisers/package.json
git commit -m "chore(states): wire validator into npm run lint"
```

---

### Task 16: Final verify + branch update

- [ ] **Step 1: Full build**

```bash
cd modernappraisers && rm -rf .next && npm run build
```
Expected: 48 `/states/<slug>` + `/states` prerendered. No errors.

- [ ] **Step 2: Full tsc**

```bash
cd modernappraisers && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Validator**

```bash
cd modernappraisers && npm run validate:states
```
Expected: `0 errors, 33 warning(s).`

- [ ] **Step 4: Push branch**

```bash
git push origin states-we-serve
```

- [ ] **Step 5: Report back**

Produce a short message to Henry with:
- Branch pushed URL
- Count of pages (48)
- Pilot image count (15)
- Placeholder count (33)
- What validator warnings exist (expected: 33 heroImage=null)
- Note: do NOT deploy from this branch (Henry's call when he's ready to merge)

---

## Self-review

**Spec coverage:**
- 48 state data files, MA/RI excluded → Tasks 1, 2, 4, 5
- Mega-dropdown + mobile accordion → Tasks 10, 11, 12
- Shared page template → Tasks 6, 7
- `/states` directory + `/states/[slug]` → Tasks 8, 9
- Sitemap integration → Task 13
- Validator (count, forbidden slugs, intro word bounds, hero metadata, duplicates) → Task 3
- Pilot hero images (15) → Task 14
- Lint integration → Task 15
- No legal content: enforced by component (StatePage doesn't render legal sections) + validator (doesn't check for legal content, intentionally — nothing to check since it's not in the data model)

**Placeholder scan:** No TBDs. Each task has concrete code / commands. Task 5 says "write 47 state intros" without pasting all 47 — that's content work, not code; providing the shape of one is sufficient guidance.

**Type consistency:**
- `StateContent`, `StateMeta`, `HeroImage` are used identically across all component tasks (6, 7, 8, 9, 10) ✓
- `STATES` array shape (StateMeta[]) consistent between `_index.ts`, nav components, sitemap ✓
- `heroImage: null` handling consistent (StateHero branches; validator treats as warning; attribution component returns null) ✓
- The adjacency map's slugs include `massachusetts` and `rhode-island` so neighbors can reference them in a lookup, but StatePage's `related = filter(nameBySlug.has)` naturally drops them because they're not in STATES ✓
