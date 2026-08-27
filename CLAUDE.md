# CLAUDE.md

This file tells Claude Code (and every future session) how to work on **Modern Tools** without breaking Henry's live production tool.

> **First thing every session, before anything else: read `docs/SESSIONS.md` (newest entry on top).** That tells you what was worked on last, what's live, what's in-progress, what's broken, and what's next. Then finish reading this file.

## Session workflow — do this every session

1. **Read `docs/SESSIONS.md`** (top entry). Skim older entries only if the current work touches something they describe.
2. **Work.** Follow the standing rules below.
3. **At the end of the session, prepend a new entry to `docs/SESSIONS.md`** with:
   - `## YYYY-MM-DD — one-line title`
   - **Worked on:** what the session was about
   - **Changed:** files touched + one-line summary of each
   - **Deploy status:** is it live? deploy id? alias verified? rollback URL for the previous good build?
   - **In progress / broken / unknowns:** anything half-done, known bugs, or things you couldn't verify
   - **Next:** the punch list for the next session
4. No exceptions on the log entry — even trivial sessions get one.

## Standing rules

- **Ask, don't assume.** If a requirement, file location, or approach is ambiguous, stop and ask. Five clarifying questions is cheaper than a wrong implementation.
- **No sloppy code.** Match existing patterns (types in `src/lib/acv/types.ts`, save helpers in `src/lib/supabase/history.ts`, tab components in `src/components/claim/`). No dead code. No half-finished stubs left behind. No premature abstractions.
- **Verify before claiming done.** For any code change: run `npx tsc --noEmit` **and** `npm run build`, and report the actual result. Don't say "should work." For deploys: after `vercel --prod`, re-run `vercel inspect modern-tools-rho.vercel.app --scope henry-as-projects-88caed67` and confirm the alias flipped to the new deploy id. `npm run lint` when the change is meaningfully new code (existing lint output has pre-existing warnings — don't gate every trivial edit on them).
- **Never revert, delete, or rewrite work that wasn't in scope.** If you find something that looks broken or dead, ask before touching it — it may be Henry's in-progress work or load-bearing behavior you don't understand.
- **Autonomous deploy is authorized** (Henry, 2026-08-25). No per-change approval needed for normal code/UI/feature work. Still confirm before anything with real blast radius: destroys data, changes auth, runs a migration, deletes claims, downgrades a package, changes RLS policies.

## Deploy safety — read before ANY deploy

**Production deploys go out via `vercel --prod` from this local folder. Never `git push` as a way to deploy.**

The GitHub repo (`Crazexdlol/modern-tools`) is periodically synced from local — most recently commit `6b2f3d9` on 2026-08-13. But Vercel builds are triggered by the CLI, not by GitHub pushes. Pushing does not deploy today, but keep the rule: if the git integration ever gets re-enabled, a push would silently deploy stale-or-conflicting state. That's what caused the 2026-07-06 incident.

### Pre-flight (before any prod deploy)

1. **Check what's live now:**
   ```
   npx vercel inspect modern-tools-rho.vercel.app --scope henry-as-projects-88caed67
   ```
2. **Capture the current deploy URL** — that's your rollback target if the new build breaks.
3. **Include the rollback command in the message you send to Henry** before the new deploy finishes, with the URL filled in — so if it breaks, one paste restores.
4. **Deploy:**
   ```
   npx vercel --prod --scope henry-as-projects-88caed67 --yes
   ```
5. **Verify:** re-run `vercel inspect` — confirm alias points to the new deploy id and status is `● Ready`.

### Rollback

Vercel deploys are immutable and kept in history:
```
npx vercel promote <good-deploy-url> --scope henry-as-projects-88caed67 --yes
```

### Local folder invariant

There must be exactly **one** local copy of this project. Current path: `C:\XSFA\Modern Tools Official`. Don't clone or duplicate — that's what caused the 07-06 incident. If you find another copy, ask Henry before deleting.

## Commands

```
npm run dev       # Next dev server on :3000
npm run build     # Production build
npm run start     # Serve the prod build locally
npm run lint      # ESLint
```

No test framework configured. `scripts/compare-apis.mjs` is a one-off API-coverage comparison (needs dev server + `.env.local`).

## Environment

`.env.local` at repo root, required:

- `ANTHROPIC_API_KEY` — used by `/api/compare-estimates` (Claude Sonnet 4.6 streaming)
- `MARKETCHECK_API_KEY` — primary listings / VIN decode / depreciation source
- `AUTODEV_API_KEY`, `AUTODEV_API_KEY_2` — secondary listings with round-robin fallback (see `search-comps` route)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase project `ektglhdstobaipdqssjx`

**Paid-API note:** MarketCheck and Auto.dev are metered. `search-comps` can fire up to 4 MarketCheck pages × ~50 rows plus an Auto.dev call per search. Be conservative when iterating on those routes; surface expected call counts before bulk-testing.

## Stack

- Next.js **16.1.6**, React **19.2.3**, TypeScript 5
- Tailwind v4 via `@tailwindcss/postcss` — config lives in `src/app/globals.css`, no `tailwind.config.*` file
- shadcn `base-nova` style, configured in `components.json`
- Path alias `@/*` → `src/*`
- Supabase (`@supabase/ssr` + `@supabase/supabase-js`) — three clients:
  - `src/lib/supabase/client.ts` — browser (`createBrowserClient`)
  - `src/lib/supabase/server.ts` — server components / route handlers
  - `src/lib/supabase/middleware.ts` — edge middleware (cookie refresh)
- PDF: `pdf-lib` for AcroForm fills; `unpdf` + `tesseract.js` for text extraction + OCR fallback; `html2canvas` + `jspdf` for Summary page capture
- `next.config.ts` marks `tesseract.js` and `pdf-lib` as `serverExternalPackages` — the fill/extract routes must run on Node runtime, never edge

## Product context

**Modern Tools** is Modern Appraisers' internal app. Henry is the insured's independent appraiser under the standard auto-policy appraisal clause; the opposing party is the insurance company's appraiser (**IA** / "Opposing Appraiser"). Preserve the "Us vs. IA" framing in any AI prompt or UI copy.

The app is **claim-centric**: every tool lives inside a claim workspace, and everything a tool produces saves onto that claim's single `acv_history` row. Generated report PDFs auto-file into the claim's Documents tab (Supabase storage bucket `claim-documents`).

## Architecture

### Top-level surfaces (`src/app/`)

| Route | What it is |
|---|---|
| `/` | Dashboard — open claims table (`src/app/page.tsx`, uses `components/claims-table.tsx`) |
| `/claims` | All claims (open + closed, status column) |
| `/claims/[id]` | The claim workspace |
| `/claims/new` | Same workspace, creation mode — Claim Info only until first save promotes to `/claims/[id]` |
| `/reports` | Standalone Reports landing page |
| `/reports/invoice` | Standalone Invoice builder — no claim binding, no persistence, download only |
| `/rules-laws/*` | Static reference (appraisal clause + diminished value, data in `src/lib/rules-laws/`) |
| `/summary-page`, `/summary-page/[id]` | Standalone summary editor (out of nav; the claim workspace's Summary tab is the primary path) |
| `/closed`, `/acv/*`, `/estimate-dispute` | Redirect to `/` (`/acv/test-autodev` is a live dev sandbox) |
| `/login` | Email/password Supabase login |

Nav (defined in `src/components/app-header.tsx`): **Dashboard | All Claims | Reports | Rules / Laws**.

### The claim workspace

`src/components/claim/ClaimWorkspace.tsx` is the entire workspace (~3,600 lines, all state at top level). Two rows of tabs:

- Row 1: **Claim Info** | **Documents**
- Row 2 (tools): **ACV Report** (has Comp Finder + Loss Search toggle inside) | **Diminished Value** | **Award** | **Closing Notes** | **Summary** | **Estimate Dispute** | **Invoice**

Internally uses a `step` state machine (steps 1–12) with `tabForStep` / `stepForTab` mapping at the top of the file. `?tab=` synced to URL via `history.replaceState`. Auto-save is 2s-debounced against the claim's `acv_history` row.

Tab components in `src/components/claim/`:
- `loss-search-tab.tsx`, `estimate-tab.tsx`, `documents-tab.tsx`, `dv-tab.tsx`
- `reports-tab.tsx` — the **Invoice tab**. Internal name kept as "reports" since more report types may land there later. Renders `src/components/invoice/invoice-fields.tsx`, which is also used by the standalone `/reports/invoice` builder — the shared component prevents drift.

### Data model (Supabase, ~390 real claims)

Schema is `supabase/schema.sql`. Migrations live in `supabase/` (previously at repo root, moved 2026-08-27). Each `migration-*.sql` has a matching `migration-*-rollback.sql` next to it. **Henry runs them manually in the Supabase SQL editor**:

| File | Adds | Status |
|---|---|---|
| `supabase/migration-claims.sql` | `status`, `estimate`, `auction_listings` columns + team-wide RLS | RUN (confirmed 2026-07-18) |
| `supabase/migration-documents.sql` | `documents` column + `claim-documents` storage bucket | RUN (confirmed 2026-07-18) |
| `supabase/migration-invoice.sql` | `invoice` column | **STATUS UNKNOWN as of 2026-08-25 — confirm with Henry before assuming Invoice-tab data will persist** |
| `supabase/seed-test-claims.sql` | 15 optional `demo-*` test claims | Not run (delete with `delete from acv_history where id like 'demo-%';`) |

Tables:
- `acv_history` — **the claim record**, shared team-wide (any authenticated user reads/writes; insert stamps own `user_id`). One row per claim. All tool state is columns on this row: `claim`, `comps`, `adjustments`, `result`, `mileage_rate`, `reports_state` (Award/Notes/Summary state + `summaryId`), `status` (`open`/`closed`), `estimate`, `auction_listings`, `documents`, `dv`, `invoice` — mostly jsonb. `mode` is vestigial (legacy `auto-acv`/`auction` rows open fine; preserve their `mode` on save).
- `estimate_history` — LEGACY, per-user, no UI anymore. Old rows kept, nothing writes to it.
- `summaries` — shared team-wide. One summary per claim via `reports_state.summaryId`.

Storage bucket `claim-documents` (private) — backs the Documents tab; authenticated-wide policies.

Write helpers:
- `src/lib/supabase/history.ts` — **update-first / insert-if-missing** (NOT upsert; upsert would reassign `user_id` on a teammate's row). Optional jsonb fields are only included when defined so a save can never null a sibling tool's data. On 42703 (missing column) it retries after dropping `documents` / `dv` / `invoice` so a save still succeeds when a migration hasn't been run.
- `src/lib/supabase/documents.ts` — storage bucket helpers.
- `src/app/summary-page/lib.ts` — summaries.

⚠️ `acv_history.user_id` FK is `ON DELETE CASCADE` — **never delete an auth user without reassigning their rows first.**

### Auth

- **Single source of truth:** `middleware.ts` → `src/lib/supabase/middleware.ts`. Non-`/login`, non-`/api/*`, non-static requests without a valid Supabase session redirect to `/login`. Auth failures don't block (fall through) by design.
- Logout: `POST /api/auth` → `supabase.auth.signOut()`.

### API routes (`src/app/api/`)

**Listings / valuation:**
- `search-comps` — **NDJSON streaming**. MarketCheck (4 pages) + Auto.dev concurrently, streams listings as each source returns. Module-level `adKeyExhausted` map skips burned Auto.dev keys on 402/429 within the same lambda. **Look here first when listings behavior is wrong.**
- `search-autodev` — Auto.dev only, single key, no failover
- `search-auction` — MarketCheck `active` + `inactive`, dealer-only, prefers `carfax_clean_title=false`; falls back to unfiltered if <3 hits
- `decode-vin` — MarketCheck primary, NHTSA `vpic` fallback. Auto-corrects common VIN typos (O→0, I→1, Q→9)
- `depreciation` — MarketCheck two-call avg-price diff (current year vs. prior year)

**PDF in/out:**
- `parse-claim` — extracts `ClaimInfo` from Modern Appraisers' assignment PDFs (label-stop regex; OCR via `lib/pdf-extractor.ts` if extracted text <50 chars). Node runtime required.
- `generate-pdf` — ACV report, fills `public/acv-template.pdf` via `lib/acv/pdf-filler.ts`
- `generate-award-pdf` — fills `public/award-template.pdf`
- `generate-notes-pdf` — fills `public/notes-template.pdf`
- `generate-dv-pdf` — fills one of 4 DV templates in `public/dv-templates/` via `lib/acv/dv-pdf-filler.ts`
- `invoices/generate-pdf` — fills one of 2 invoice templates in `public/invoice-templates/` via `lib/invoice/invoice-pdf-filler.ts`

**AI:** `compare-estimates` — Claude Sonnet 4.6 streaming, `max_tokens: 64000` with `betas: ["output-128k-2025-02-19"]`.

**Auth:** `POST /api/auth` for sign-out.

### Library code (`src/lib/`)

- `acv/types.ts` — canonical `ClaimInfo`, `MarketComp`, `SelectedComp`, `ACVAdjustments`, `ACVResult`. Round-trip anything ACV-related through these.
- `acv/calculations.ts` — vehicle classification (regex → 15 categories), age-based multiplier, `getMileageRate()`, `calculateCompValue()`, `calculateACV()`, `defaultAdjustments()`. Default deduction is `-500` (Dealer vs. Private). Formula: `avg(comp1..3) + adjustments + (avg × taxRate%)`.
- `acv/pdf-filler.ts`, `acv/award-pdf-filler.ts`, `acv/notes-pdf-filler.ts`, `acv/dv-pdf-filler.ts`, `invoice/invoice-pdf-filler.ts` — AcroForm fillers. All read templates from `public/*.pdf` via `fs.readFileSync(process.cwd() + ...)`. Node runtime only.
- `invoice/types.ts` — client-safe (no `fs` / `pdf-lib` imports) so client components can import directly. `pickInvoiceVariant(lineItemCount)` auto-picks long vs. very-long (>8 lines → very-long).
- `pdf-extractor.ts` — `unpdf` text extraction, per-page Tesseract OCR fallback (capped at 10 pages).
- `image-extractor.ts`, `estimate-parser.ts`, `parse-claim-pdf.ts` — see file docs.
- `rules-laws/*-data.ts` — static state-by-state content for the Rules / Laws pages.

### PDF templates

`public/` holds fillable AcroForms:
- `acv-template.pdf`, `award-template.pdf`, `notes-template.pdf`
- `dv-templates/dv-{nationwide|wloss}-{attorney|sedgwick}.pdf` (4 variants)
- `invoice-templates/invoice-{long|very-long}.pdf`

Field names in the fillers map 1:1 to the field names embedded in the PDFs. **If a template is re-exported from Acrobat, field names can silently change** — verify the filler before assuming the route is broken.

**Invoice templates use generic auto-numbered field names** (`1`, `2`, `33`, `Text1`...) mapped by widget position — documented in `src/lib/invoice/invoice-pdf-filler.ts`. Gotcha: **field `33` has two widgets on the page** (Subtotal AND Total) because Modern Appraisers never charges sales tax, so the template shares one field between both boxes. Field `34` (Sales Tax) must stay blank.

## UI conventions

- Every page imports `<AppHeader />` from `src/components/app-header.tsx`. No route-group layout — the header is added per page.
- shadcn primitives in `src/components/ui/`: `button`, `card`, `badge`, `progress`, `separator`, `tabs`. Add new components with `npx shadcn add <name>`.
- Lucide icons.

---

Full session history lives in `docs/SESSIONS.md`. Newest entry on top.
