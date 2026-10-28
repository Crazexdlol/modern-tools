# States We Serve — Phase 1 design

**Date:** 2026-10-27
**Status:** Design approved; implementation plan pending.
**Branch:** `states-we-serve` (do NOT merge to `main` without PR review).
**Scope:** Phase 1 only. Infrastructure + 48 state data files + unique intros + hero images for 10-15 pilot states. **No legal content.**

## Problem

modernappraisers.com currently advertises as a nationwide appraisal firm but has no state-specific pages. Henry wants a "States We Serve" nav section with 48 individual state pages (US minus Massachusetts and Rhode Island). The eventual goal: SEO visibility across all 48 states, state-specific legal information, and improved credibility.

The eventual goal cannot be fully delivered in one session because:
1. Legally accurate per-state content requires attorney-level research for 48 jurisdictions.
2. The AI drafting the content (Claude) is explicitly excluded by Henry's own instructions from being an authoritative legal source.
3. Hero image research with license verification across 48 states would consume 12-24+ hours.

Phase 1 solves the infrastructure problem and delivers all 48 pages publicly, with the state intros, service links, nav, and SEO plumbing done. Legal content and the remaining hero images are deferred to subsequent sessions.

## Goals (Phase 1)

- "States We Serve" top-nav item with desktop mega-dropdown (4×12) and mobile accordion.
- `/states` directory landing page.
- `/states/<slug>` dynamic route rendering a shared template.
- 48 state data files, each with unique SEO metadata, 60-100 word intro, hero reference, related-state list.
- 10-15 pilot states have real Wikimedia Commons hero images with full attribution metadata. The remaining 33-38 states ship with styled placeholder heroes.
- Sitemap auto-generates all 48 state URLs plus the `/states` directory.
- Validation script enforces data integrity.
- Zero legal content on any state page.

## Non-goals (Phase 1)

- Legal content (appraisal clause rules, ACV methodology, DV rules, licensing requirements) — rendered sections do not exist on page.
- `citations[]` records and the citation display components.
- Hero images for every state (10-15 pilot only; rest placeholder).
- Massachusetts and Rhode Island data files or routes — excluded entirely, with validation blocking any accidental re-introduction.
- Prefill of the Submit a Claim form from a state slug — follow-up ticket.
- Analytics instrumentation.
- Changes to any existing page outside the states feature.
- Changes to HAMS Portal (anything in `src/`, `supabase/`, `scripts/` at the repo root).

## Codebase facts (as of 2026-10-27)

- Framework: Next.js 16, React 19.2, Tailwind v4, TypeScript.
- Site root: `modernappraisers/`.
- Package manager: npm. Scripts: `npm run dev` (port 3100), `npm run build`, `npm run lint`.
- Current nav items (hardcoded in `modernappraisers/src/components/site-header.tsx`): Home, About Us, Services, Property Types, FAQ, Contact Us, plus a Submit a Claim CTA.
- Existing service pages that state pages must link to: `/righttoappraisal`, `/actualcashvalue`, `/diminishedvalue`, `/costofrepair`, `/lossofuse`, `/storage`.
- Sitemap is a static array in `modernappraisers/src/app/sitemap.ts` and must be extended to iterate over the states index.
- CSS tokens: `--color-accent`, `--color-ink`, `--color-ink-muted` (match for all new UI).
- Site metadata base: `https://modernappraisers.com`.
- Supabase client is present but not used by any Phase 1 code.

## File layout

```
modernappraisers/src/
  app/
    states/
      page.tsx                 — /states directory landing
      [slug]/
        page.tsx               — /states/<slug> dynamic page
    sitemap.ts                 — extended to iterate STATES
  components/
    states/
      state-mega-menu.tsx      — desktop hover-dropdown
      state-mobile-menu.tsx    — mobile accordion panel inside existing hamburger drawer
      state-page.tsx           — shared template body
      state-hero.tsx           — hero section (real image OR placeholder)
      state-card.tsx           — card used on /states directory
      state-attribution.tsx    — small credit line beneath hero
    site-header.tsx            — modified to mount mega-menu + mobile menu
  data/
    state-types.ts             — StateContent, HeroImage shape definitions
    states/
      _index.ts                — const STATES: StateMeta[]
      <slug>.ts                — one file per state (48 total)
  public/
    states/
      <slug>.jpg               — hero image for pilot states only
modernappraisers/scripts/
  validate-states.mjs          — pre-commit guard
```

Nothing outside `modernappraisers/` is touched.

## Data model

```ts
// state-types.ts
export interface HeroImage {
  url: string                 // public path, e.g. "/states/nevada.jpg"
  sourcePageUrl: string       // Wikimedia Commons file-info page
  author: string
  license: 'CC0' | 'CC-BY-4.0' | 'CC-BY-SA-4.0' | 'PD-US' | 'PD-US-no-notice'
  attribution: string         // the exact credit line to display
  verifiedAt: string          // ISO date, hand-written per state
}

export interface StateContent {
  slug: string                // "nevada"
  name: string                // "Nevada"
  abbreviation: string        // "NV"
  heroImage: HeroImage | null // null = placeholder gradient in Phase 1
  intro: string               // 60-100 words, NON-LEGAL
  majorCities: string[]       // 2-5, used in intro only; no promises of coverage
  relatedStates: string[]     // 4-6 slugs of neighboring states (hardcoded)
  seo: {
    title: string             // unique per state
    description: string       // unique, 140-160 chars
  }
  // Phase 2 fields - declared but default to null/[]
  legalSections: null         // Phase 1: always null
  citations: never[]          // Phase 1: always empty
  verified: false             // Phase 1: always false
  verifiedAt: null            // Phase 1: always null
  verifiedBy: null            // Phase 1: always null
}

// _index.ts
export const STATES: Pick<StateContent, 'slug' | 'name' | 'abbreviation'>[] = [
  { slug: 'alabama',  name: 'Alabama',  abbreviation: 'AL' },
  { slug: 'alaska',   name: 'Alaska',   abbreviation: 'AK' },
  // ... 48 entries, no Massachusetts, no Rhode Island
]
```

## Routing

- `/states` — static directory page. Lists all 48 states as cards in a 4-column grid (responsive). Each card is a thumbnail + name + link.
- `/states/[slug]` — generated via `generateStaticParams()` reading `STATES` from `_index.ts`. Statically prerendered at build.
- Unknown slug (anything not in the 48) returns Next's default 404.
- Massachusetts and Rhode Island do not have data files; the validator fails the build if someone adds them.

## Page template order (per state)

1. **Hero**
   - If `heroImage` is non-null: full-width photo + overlaid H1 "Auto Appraisal Services in <State>" + 1-line subheading + "Submit a Claim" CTA.
   - If `heroImage` is null: CSS gradient (based on a per-state hue derived from the state name hash) + same H1 + subheading + CTA.
   - Attribution line below the hero if `heroImage` is non-null.
2. **State intro** — the `intro` paragraph.
3. **Service overview** — 5-7 short cards for existing service pages. Each card: icon, title, 1-line description, link. Cards are hardcoded in the template; state-independent.
4. **Related states** — row of 4-6 state links (`relatedStates` slugs resolved to names).
5. **Final CTA** — "Need an appraisal in <State>? Contact us." with link to `/contact` and `/submitaclaim`.

**No legal section headers rendered.** No "coming soon" text. Pages do not advertise the eventual Phase 2 content.

## Nav

**Desktop (`state-mega-menu.tsx`):**
- "States We Serve" link in the top nav bar.
- Hover opens a mega-dropdown positioned below the link.
- 4 columns × 12 rows, alphabetical top-to-bottom per column.
- 150 ms grace period on mouseleave so cursor can bridge the gap.
- Closes on Escape, outside click, or scroll.
- Keyboard navigable: Tab to open, arrow keys to move, Enter to activate, Escape to close.
- Max-width 1200px, left-aligned under the nav link.

**Mobile (`state-mobile-menu.tsx`):**
- Inside the existing hamburger drawer.
- "States We Serve" as an accordion header; tap expands to a vertical scrolling alphabetical list.
- No mega-grid simulation.
- Standard tap targets (44px+ height).

## Hero image pilot (10-15 states)

**Pilot state list** (chosen for geographic diversity and traffic potential):
Nevada, California, Texas, Florida, New York, Arizona, Colorado, Georgia, Illinois, Washington, Ohio, Virginia, Oregon, North Carolina, Pennsylvania.

For each pilot state:
1. Search Wikimedia Commons for a state landmark or landscape photo.
2. Verify license is one of the allowed values (`CC0`, `CC-BY-4.0`, `CC-BY-SA-4.0`, `PD-US`, `PD-US-no-notice`). No fair-use media.
3. Download, resize to ~1600px wide with `sharp`, save to `public/states/<slug>.jpg`.
4. Record `author`, `license`, `attribution`, `sourcePageUrl` in the state data file.
5. `verifiedAt` is today's date, hand-written (no auto-regenerate on build).

Non-pilot states: `heroImage: null`. Page renders a styled gradient placeholder. A build warning fires for every null hero so Phase 2 can see the queue.

## Sitemap

```ts
// sitemap.ts
import { STATES } from '@/data/states/_index'

const base = 'https://www.modernappraisers.com'
const existing = [ /* current hardcoded routes */ ]
const states = STATES.map(s => `/states/${s.slug}`)
const dir = ['/states']
return [...existing, ...dir, ...states].map(path => ({
  url: `${base}${path}`,
  lastModified: new Date(),
  changeFrequency: 'monthly',
  priority: path.startsWith('/states/') ? 0.6 : (path === '' ? 1 : 0.7),
}))
```

## Validation (`scripts/validate-states.mjs`)

Fails the build if:
- `_index.ts` does not export exactly 48 entries.
- Any entry has slug `massachusetts` or `rhode-island`.
- A slug in `_index.ts` has no corresponding `data/states/<slug>.ts` file.
- A data file is not referenced in `_index.ts`.
- Two entries share a slug.
- A state's `intro` is not between 50 and 120 words.
- A state's `heroImage` is non-null but missing `author`, `license`, `sourcePageUrl`, or `attribution`.
- Two states share the same `heroImage.url`.

Warns (but does not fail) if:
- A state has `heroImage: null`.
- A state's SEO description is outside 140-160 chars.

Hooked via `npm run lint` (adds the script to the lint sequence) and runnable standalone.

## Content guidelines (for intros)

- 60-100 words.
- Mentions 2-3 major cities / regions by name but makes **no coverage promises** ("Modern Appraisers serves <state>" is OK; "Modern Appraisers has offices in <city>" is NOT).
- Mentions a selection of services generically.
- Professional, neutral tone. Avoid consumer-side or carrier-side bias.
- Each state is uniquely written. No templated paragraph with the state name substituted.
- Example (Nevada):
> *"Modern Appraisers provides independent vehicle appraisal services throughout Nevada, from Las Vegas and the Mojave corridor to Reno, Carson City, and the agricultural communities of the north. Our documented valuations and dispute-resolution services support drivers, attorneys, body shops, and claims professionals handling total-loss, diminished-value, cost-of-repair, and specialty-vehicle matters. We work on first-party and third-party claims alike, and we provide written appraisals that stand up to scrutiny in appraisal-clause proceedings, settlement negotiations, and litigation."*

## Related-state hardcoding

Each state data file hand-picks 4-6 geographically neighboring state slugs for the "Related States" row. No programmatic distance derivation. If a state's neighbors include Massachusetts or Rhode Island, those neighbors are skipped (never link to a non-existent page).

## Deploy strategy

Henry's local deploys this branch via a feature-branch deploy preview (not `--prod`) until he's ready to merge to `main` and ship.

Phase 1 is production-safe at the point all 48 pages compile and validate pass. Legal content being empty is intentional, not a build failure.

## Verification

- `npm run build` clean in `modernappraisers/`.
- `scripts/validate-states.mjs` returns 0 (zero exit) with the 10-15 pilot image states and 33-38 placeholder states.
- Visit `/states` locally — directory renders 48 cards alphabetically.
- Visit `/states/nevada` (pilot) — hero image + attribution + intro render; no legal sections.
- Visit `/states/alabama` (non-pilot) — placeholder hero + intro render; no legal sections.
- Visit `/states/massachusetts` — 404.
- Visit `/sitemap.xml` — contains `/states` + 48 `/states/<slug>` entries.
- Desktop nav: hover "States We Serve" — mega-menu opens with 48 states in 4 cols × 12 rows.
- Mobile nav: hamburger → tap "States We Serve" → list expands.
- Keyboard: Tab into nav, arrow through dropdown, Enter opens state page.

## Open questions (deferred to implementation)

- Exact placeholder gradient color derivation algorithm — I'll pick a reasonable per-state-name hash during implementation.
- Related-state picks for every state — I'll generate a reasonable neighbor list from a US state adjacency map during implementation, then double-check Massachusetts/Rhode Island are never referenced.
- Whether the mega-menu should get a tiny thumbnail per state or just text names — I'll build text-only in Phase 1 (lighter weight, matches existing nav aesthetic). Thumbnails are a Phase 2 polish.
