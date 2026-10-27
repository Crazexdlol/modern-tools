# Cloud Agent Brief — States We Serve project

**Written:** 2026-10-27, before cloud session kickoff.
**Scope:** This file is specific to the `states-we-serve` branch and the `modernappraisers/` subtree. Do NOT touch anything outside `modernappraisers/`.

## What this project is

Henry wants to add a "States We Serve" section to **modernappraisers.com** (the public marketing site, in this `modernappraisers/` subdirectory of the HamsPortal monorepo). The scope:

- New top-nav tab "States We Serve" with a desktop mega-dropdown + mobile menu
- 48 individual state pages at `/states/<state-slug>` (all US states **except Massachusetts and Rhode Island**)
- Each state page covers: hero (image + intro), service overview, four legal topics (Appraisal Clause rules, ACV methodology, Diminished Value rules, Licensing requirements), citations, CTA, related links
- A central `/states` landing/directory page

Full original spec is in Henry's prompt (saved separately if provided). The highest-priority requirement is **legal accuracy** — he explicitly said: *"I would rather have a legally accurate, well-designed website with clearly identified unfinished research than 48 completed-looking pages full of questionable statements."*

## The hard constraint (read this twice)

Henry's own instructions say:
> *"Do not use competitor websites, SEO articles, outdated blogs, or AI-generated legal summaries as authoritative sources."*

**You, the cloud agent, are an AI-generated source.** You cannot be the final authority on whether a statute is currently effective, whether a case was overruled, whether a regulation has been amended, or whether a license requirement is binding on independent appraisers. Treat every legal statement you draft as needing human verification before publication.

**The correct workflow:**
1. Build complete infrastructure (nav, routes, template, data model, sitemap, SEO metadata, image attribution system, validation tooling).
2. For each state, locate primary sources (state legislature websites, official DOI pages, official licensing boards) and draft content WITH citations.
3. Every state has a `verified: boolean` flag in its data file, defaulting to `false`.
4. States with `verified: false` are **excluded from the sitemap, excluded from the nav dropdown, and either 404 or render a "coming soon" placeholder**. They are NOT published as finished legal resources.
5. A human (Henry or an attorney) reads the drafted content against the citations and flips `verified: true` state by state.

If you cannot find authoritative sources for a given state's section, say so in the data file (`verificationNotes: "Could not locate state-specific DV statute; GA case law suggests ..."`) rather than inventing content.

## What you can safely do without human review

- Build all the infrastructure (components, routes, data model, nav, mega-menu, mobile menu, image handling, SEO metadata plumbing, sitemap, validation scripts).
- Write non-legal state content: service descriptions, intros, CTAs — but keep them generic ("Modern Appraisers serves the entire state of Nevada") rather than claiming specific coverage areas, offices, or affiliations.
- Pick public-domain or CC0 state photography (document the source URL + license + verification date in the data file). Prefer Wikimedia Commons for state landmarks.
- Draft legal sections WITH primary-source citations, flagged `verified: false`.

## What you MUST NOT do

- Deploy. No `vercel --prod`, no `vercel deploy`. Deploys are run from Henry's local terminal, not the cloud.
- Push to `main`. All work on `states-we-serve`. Henry will merge via PR when ready.
- Fabricate statute numbers, case citations, or regulations. Blank sections are better than wrong ones.
- Use the stock images in the repo unless they're documented as rights-cleared.
- Touch anything outside `modernappraisers/`. The parent repo is HamsPortal, a production app. Stay in your lane.
- Run migrations. No touching `modernappraisers/supabase/` schema beyond read-only inspection.

## Codebase orientation

- Next.js app, lives in `modernappraisers/`. Package manager: npm.
- Build/dev: `cd modernappraisers && npm install && npm run dev`. Verify: `npm run build`.
- Font / design conventions: Times New Roman (per HamsPortal HARD RULE, carried over to modernappraisers). Pin via globals.css.
- Existing nav lives in `modernappraisers/src/app/` — inspect `layout.tsx` and the existing header component first.
- Existing pages: about, submit-claim, etc. Match their styling and routing conventions.
- Tailwind v4 is in use.

## Suggested data model (not binding — propose better if you have one)

```
modernappraisers/src/data/states/
  _index.ts                       -- enumerates the 48 included states
  nevada.ts                       -- one file per state
  california.ts
  ...
```

Each state file exports a typed object:

```ts
export interface StateContent {
  slug: string                     // 'nevada'
  name: string                     // 'Nevada'
  excluded: boolean                // true for MA/RI, which should still live
                                   // in the type system but render 404
  heroImage: {
    url: string
    source: string                 // 'wikimedia-commons'
    license: string                // 'CC0' | 'CC BY-SA 4.0' | 'Public Domain'
    attribution: string | null
    verifiedAt: string             // ISO date
  }
  intro: string                    // 60-100 words, state-specific
  sections: {
    appraisalClause: Section
    acv: Section
    diminishedValue: Section
    licensing: Section
  }
  citations: Citation[]
  verified: boolean                // false until human review
  verifiedAt: string | null        // when a human flipped it
  verifiedBy: string | null        // 'Henry' | 'attorney-name'
  verificationNotes: string        // free-text: what was researched,
                                   // what's uncertain, open questions
}

export interface Section {
  summary: string                  // the user-facing text
  citationIndices: number[]        // indices into the parent `citations[]`
}

export interface Citation {
  authority: string                // 'Nevada Revised Statutes'
  identifier: string               // 'NRS 687B.145'
  description: string              // what the citation supports
  url: string                      // link to the official source
  verifiedAt: string               // ISO date
}
```

Sitemap, nav, and the `/states/[slug]` route all read from `_index.ts` and filter by `verified === true`. States with `verified: false` return 404 at the route level AND are omitted from the sitemap.

A `scripts/validate-states.mjs` checks for: duplicate slugs, missing citations behind legal statements, broken image URLs, states listed as served that are actually MA or RI, states missing from `_index.ts`.

## Phase order (strongly recommended)

1. **Infrastructure first:** nav, mega-menu, mobile menu, directory page, template page, data model types, sitemap integration, validation script. ALL 48 states have skeleton data files with `verified: false`. Nothing's live yet. Verify build passes.
2. **Images:** pick + document public-domain state photos. Still `verified: false`.
3. **Content drafting state-by-state:** fill in intros, service text, legal section drafts with citations. Still `verified: false`.
4. **Hand off to Henry** for human verification pass, state by state.

Do NOT publish any state before Henry has flipped `verified: true` for it.

## Who to ask

The cloud agent runs in isolation. If you hit a blocker, add a `BLOCKERS.md` at `modernappraisers/BLOCKERS.md` with questions. Henry will see it on PR review.

## Final

Treat this like a long, careful project. Henry's bar is "legally accurate and well-designed" over "48 pages that look done." Infrastructure is a 1-2 day job; content research is weeks of attorney work. Build the infrastructure, draft the content with citations, flag what you couldn't verify, hand off.
