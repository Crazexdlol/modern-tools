# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

**Modern Tools** is an internal Next.js 16 / React 19 application for Modern Appraisers — an independent auto-appraisal firm. Since the 2026-07-18 redesign it is **claim-centric**: `/` is a dashboard of open ACV claims (shared team-wide — every authenticated user sees every claim), `/claims` lists all claims incl. closed, and `/claims/[id]` is the claim workspace where ALL tools live as tabs (Claim Info | Documents on a top row; ACV Report w/ Comp Finder + Loss Search, Diminished Value, Award, Closing Notes, Summary, Estimate Dispute, Invoice on a Tools row). Everything a tool produces saves onto that claim's single `acv_history` row; generated/printed report PDFs auto-file into the claim's Documents tab (Supabase storage bucket `claim-documents`). The old standalone tools (`/acv/*`, `/estimate-dispute`) redirect home; Negotiations and Auto ACV were deleted for good.

Since 2026-07-20 there's also a standalone **`/reports`** area (top nav) — reports filled out and downloaded by hand, not tied to any claim (for when someone needs to admin a report manually rather than from inside a specific claim). The claim workspace's **Invoice** tab (tab id/component internally still called "reports" — `src/components/claim/reports-tab.tsx`) is the claim-bound counterpart: same fields, pre-filled from that claim's Claim Info the first time it's opened but independently editable/saved from then on, auto-filed into that claim's Documents tab. Both surfaces render the same `InvoiceFormFields` component (`src/components/invoice/invoice-fields.tsx`) so they can't drift apart, but keep separate form state — standalone starts empty, claim-bound starts pre-filled. First (and currently only) report type: **Invoice**.

## ⚠️ CRITICAL — read before touching anything

This is Henry's **live production tool that he uses for real work.** A broken or reverted deploy directly disrupts his business. Treat every action against it as production-critical. Move carefully, verify first, and when in doubt, ask.

### How this project actually deploys (NOT what you'd assume)

- **Production is deployed with `vercel --prod` from this local folder — NOT by pushing to GitHub.**
- **The GitHub repo (`Crazexdlol/modern-tools`) is STALE and is NOT the source of truth.** Its latest commit predates months of live work. The real, live codebase is the **working tree of this local folder**, much of it uncommitted. Never trust git to tell you what's live.
- **NEVER `git push` as a way to deploy or "sync."** A push triggers a git-based Vercel build from the stale repo and will **overwrite the real production build.** (This exact mistake happened 2026-07-06 — see work log.)
- There must be exactly **one** local copy of this project: `~/Desktop/modern-tools`. Do not create clones/copies — that is what caused the confusion.

### Mandatory pre-flight before ANY deploy or risky change

1. **Check what is currently live** before doing anything:
   `npx vercel inspect modern-tools-rho.vercel.app --scope henry-as-projects-88caed67`
   and `npx vercel ls modern-tools --scope henry-as-projects-88caed67`.
2. **State out loud what you're about to change and how it deploys.** Verify the deploy method (CLI, not git).
3. **Get Henry's explicit OK before deploying to production.** Do not deploy on your own initiative.
4. **Deploy the correct way:** `npx vercel --prod --scope henry-as-projects-88caed67 --yes` from this folder.
5. **Verify after:** re-run `vercel inspect` to confirm the production alias points to the new deploy, and confirm the site responds.

### If something breaks — instant rollback

Vercel deploys are immutable and kept in history. Restore a known-good build with:
`npx vercel promote <good-deploy-url> --scope henry-as-projects-88caed67 --yes`
(The last known-good July 2 build was `modern-tools-phm1rgrer-henry-as-projects-88caed67.vercel.app`.)

### Working discipline

- **Verify before asserting.** Don't state something is fixed/live/safe without checking. Read the actual state (git status, `vercel inspect`, the file) first.
- **Update the Work Log at the bottom of this file every session** — what changed, deploy status, and future plans. No exceptions.

## Common commands

```bash
npm run dev       # Next dev server (default :3000)
npm run build     # Production build
npm run start     # Run prod build
npm run lint      # ESLint (flat config, next/core-web-vitals + next/typescript)
```

No test framework is configured. There is a one-off API-coverage script:

```bash
node scripts/compare-apis.mjs   # Compares MarketCheck vs Auto.dev coverage. Requires dev server running and .env.local present.
```

## Environment

`.env.local` (required at repo root) must contain:

- `ANTHROPIC_API_KEY` — used by `/api/compare-estimates` (Sonnet) and `/api/negotiations/analyze` (Haiku)
- `MARKETCHECK_API_KEY` — primary listings/VIN-decode/depreciation source
- `AUTODEV_API_KEY`, `AUTODEV_API_KEY_2` — secondary listings source with round-robin quota fallback (see `search-comps` route)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — auth + history storage

**Paid-API note:** MarketCheck and Auto.dev are metered. The `search-comps` route fires up to 4 MarketCheck pages × ~50 rows plus an Auto.dev call per search. Be conservative when iterating on those routes; surface call counts before bulk-testing.

## Architecture

### Auth and routing

- **Single source of truth**: `middleware.ts` → `src/lib/supabase/middleware.ts`. Any non-`/login`, non-`/api/*`, non-static request without a valid Supabase session redirects to `/login`. Auth failures fall through (don't block) by design.
- **Three Supabase clients**:
  - `src/lib/supabase/client.ts` — browser (`createBrowserClient`)
  - `src/lib/supabase/server.ts` — server components / route handlers (`createServerClient` with `cookies()`)
  - `src/lib/supabase/middleware.ts` — edge middleware (handles cookie refresh)
- Logout: `POST /api/auth` → `supabase.auth.signOut()`.

### Data model (Supabase — project `ektglhdstobaipdqssjx`, ~390 real claims)

Schema in `supabase-schema.sql` (+ dated migration files at repo root, run manually by Henry in the SQL editor):

- `acv_history` — **THE claim record, shared team-wide** (select/update/delete: any authenticated user; insert stamps own `user_id`). One row per claim holds everything: `claim`, `comps`, `adjustments`, `result`, `mileage_rate`, `reports_state` (Award/Notes/Summary state + `summaryId`), `status` ('open'|'closed'), `estimate` (per-claim Estimate Dispute), `auction_listings` (Loss Search), `documents` (Documents-tab metadata), `dv` (DV-tab state), `invoice` (Reports tab state — `supabase-migration-invoice.sql`, **not yet run**, see NEXT SESSION) — all jsonb. `mode` is vestigial (legacy 'auto-acv'/'auction' rows open fine in the workspace; preserve their mode on save).
- `estimate_history` — LEGACY, per-user, no UI anymore; old rows kept, nothing writes to it.
- `summaries` — shared (team). One summary per claim via `reportsState.summaryId`.
- Storage bucket `claim-documents` (private) — the actual files behind the Documents tab; authenticated-wide policies.

Write helpers in `src/lib/supabase/history.ts` (**update-first/insert-fallback, NOT upsert** — an upsert would reassign `user_id` on a teammate's row; optional jsonb fields are only included when defined so a save can never null a sibling tool's data; 42703 retry drops documents/dv/invoice if that migration hasn't run), `src/lib/supabase/documents.ts` (storage), `src/app/summary-page/lib.ts` (summaries). ⚠️ `acv_history.user_id` FK is ON DELETE CASCADE — never delete an auth user without reassigning their rows.

### Top-level app surfaces (`src/app/`) — post-redesign (2026-07-18)

- `/` — **Dashboard**: open-claims table (`page.tsx`, uses `components/claims-table.tsx`), New Claim button, MigrateData. Nav (shared `components/app-header.tsx`): Dashboard | All Claims | Reports | Rules / Laws.
- `/claims` — **All Claims** (open + closed, status column). `/closed` redirects here.
- `/claims/[id]` — **the claim workspace** (`components/claim/ClaimWorkspace.tsx` — the former comp-finder monolith, ~3,400 lines, all state at top level). `/claims/new` = creation (Claim Info only + Create Claim button; tool tabs unlock once the row exists). Internal `step` machine: 1 Claim Info, 2-4 ACV stepper, 5 Summary / 8 Closing Notes / 9 Award (one mounted ReportsStep behind all three via its `view` prop — its claim↔award↔notes sync effects rely on staying mounted), 6 Loss Search (inside ACV tab), 7 Estimate Dispute, 10 Documents, 11 Diminished Value, 12 Invoice (tab id `'reports'` internally — see `TOOL_TABS`). Tab ↔ step mapping + `?tab=` URL sync at the top of the file. 2s-debounced auto-save persists everything (status, reportsState, estimate, auctionListings, documents metadata, dv, invoice) to the claim's `acv_history` row; localStorage draft exists ONLY for `/claims/new`. Header shows 5 equally-weighted stats (MA # · CL # · Vehicle · Client · Owner) via the local `ClaimHeaderStat` component, not a single title.
- Claim components live in `src/components/claim/`: `loss-search-tab.tsx`, `estimate-tab.tsx` (+ its own Results editor), `documents-tab.tsx`, `dv-tab.tsx`, `reports-tab.tsx` (the claim-bound Invoice tab — internal name kept as "reports" since more report types may land here later).
- Old routes `/acv`, `/acv/comp-finder`, `/acv/auction`, `/estimate-dispute` are `redirect('/')` shims. `/acv/test-autodev` (dev sandbox) still exists.
- `/rules-laws` — static reference: appraisal clause + diminished value, data in `src/lib/rules-laws/*-data.ts`.
- `/reports` — **standalone Reports** landing page (card links, one per report type). `/reports/invoice` — fill-by-hand Invoice builder, no claim binding, no persistence (download only).
- `/summary-page` and `/summary-page/[id]` — standalone summary editor, out of the nav but kept on disk; the Summary tab in the workspace is the primary path (`reportsState.summaryId` links one summary per claim).
- `/login` — email/password Supabase login.

### API routes (`src/app/api/`)

**Listings / valuation (ACV):**
- `search-comps` — **NDJSON streaming** route. Runs MarketCheck (4 pages, active or inactive) and Auto.dev concurrently and streams listings as each source returns. Uses module-level `adKeyExhausted` map to skip burned Auto.dev keys on 402/429 within the same lambda. Look here first when listings behavior is wrong.
- `search-autodev` — Auto.dev only (single key, no failover).
- `search-auction` — MarketCheck `active` + `inactive`, dealer-only, prefers `carfax_clean_title=false` for accident-history vehicles; falls back to unfiltered if <3 hits.
- `decode-vin` — MarketCheck primary, NHTSA `vpic` fallback. Auto-corrects common VIN typos (O→0, I→1, Q→9).
- `depreciation` — MarketCheck two-call avg-price diff (current year vs prior year).

**PDF in/out:**
- `parse-claim` — extracts structured `ClaimInfo` from Modern Appraisers' claim assignment PDFs using label-stop regex (`LABELS` array in the route). Falls back to OCR via `lib/pdf-extractor.ts` if the PDF has <50 chars of text. **Node runtime required.**
- `generate-pdf` — fills `public/acv-template.pdf` (AcroForm fields) via `lib/acv/pdf-filler.ts`. Sets `NeedAppearances=true` and strips pdf-lib auto-appearances so the original template fonts render in viewers.
- `generate-award-pdf` — fills `public/award-template.pdf` via `lib/acv/award-pdf-filler.ts`.
- `generate-notes-pdf` — fills `public/notes-template.pdf`.
- `generate-dv-pdf` — fills one of 4 DV report templates in `public/dv-templates/` via `lib/acv/dv-pdf-filler.ts` (field map documented there). ⚠️ `dv-nationwide-sedgwick.pdf` is corrupted pending Henry's Acrobat re-save.
- `invoices/generate-pdf` — fills one of 2 Invoice templates in `public/invoice-templates/` via `lib/invoice/invoice-pdf-filler.ts` (field map + a real gotcha documented there — field `33` has TWO widgets on the page, Subtotal AND Total, because Modern Appraisers never charges sales tax so the template shares one field between both boxes; field `34` is the separate, always-blank Sales Tax box — do not write to it).

**AI:**
- `compare-estimates` — Claude **Sonnet 4.6** streaming, `max_tokens: 64000` with `betas: ["output-128k-2025-02-19"]`. JSON-only response with the schema in the route. `maxDuration` is implicit. (Negotiations tool + its Haiku route were deleted 2026-07-18.)

**Auth:** `POST /api/auth` for sign-out.

### Library code (`src/lib/`)

- `acv/types.ts` — canonical shapes: `ClaimInfo`, `MarketComp`, `SelectedComp`, `ACVAdjustments`, `ACVResult`. Anything ACV-related should round-trip through these.
- `acv/calculations.ts` — vehicle classification (regex → 15 categories), age-based multiplier, `getMileageRate()`, `calculateCompValue()`, `calculateACV()`, `defaultAdjustments()`. Default deduction is `-500` (Dealer vs. Private). ACV formula: `avg(comp1..3) + adjustments + (avg × taxRate%)`.
- `acv/pdf-filler.ts`, `acv/award-pdf-filler.ts`, `acv/notes-pdf-filler.ts`, `invoice/invoice-pdf-filler.ts` — AcroForm fillers. **All read templates from `public/*.pdf` via `fs.readFileSync(process.cwd() + ...)`** — Node runtime only.
- `invoice/types.ts` — client-safe Invoice types/helpers (`InvoiceLineItem`, `InvoiceVariant`, `INVOICE_MAX_ROWS`, subtotal math, `pickInvoiceVariant`, `formatLineItemsForPdf`). Deliberately has no `fs`/`pdf-lib` imports so client components (the claim's Invoice tab, the standalone builder) can import it directly — see the file's own header comment.
- `pdf-extractor.ts` — `unpdf` text extraction, falls back to per-page Tesseract OCR (capped at 10 pages) if extracted text is too short.
- `image-extractor.ts` — Tesseract OCR for image uploads.
- `estimate-parser.ts` — detects estimating software (CCC / Mitchell / Audatex / Web-Est / Estimating Edge) and provides line-item normalization types; the actual diff happens server-side via Claude.
- `parse-claim-pdf.ts` — client-side wrapper around the `/api/acv/parse-claim` endpoint.
- `rules-laws/*-data.ts` — static state-by-state content for the Rules / Laws pages.

### Next.js config

`next.config.ts`:
```ts
serverExternalPackages: ["tesseract.js", "pdf-lib"]
```
Both libraries are CommonJS / native-dep heavy. Don't try to bundle them into the edge runtime. The PDF-filler routes implicitly require Node.

### UI conventions

- Shadcn (`base-nova` style, neutral base color, Lucide icons) configured in `components.json`. Add new components via `npx shadcn add <name>`. Existing primitives: `button`, `card`, `badge`, `progress`, `separator`, `tabs` under `src/components/ui/`.
- Tailwind v4 via `@tailwindcss/postcss` (no `tailwind.config.*` file — config lives in `globals.css`).
- Path alias: `@/*` → `src/*` (also aliased in `components.json` for shadcn).
- Page chrome is the shared `src/components/app-header.tsx` (nav items + active state in ONE place; also shows the signed-in email). No route-group layout — each page imports `<AppHeader />`.

### PDF templates

`public/` holds fillable AcroForm templates (`acv-template.pdf`, `award-template.pdf`, `notes-template.pdf`, `dv-templates/dv-{nationwide|wloss}-{attorney|sedgwick}.pdf`, and `invoice-templates/invoice-{long|very-long}.pdf`). The field names in `lib/acv/*-pdf-filler.ts` / `lib/invoice/invoice-pdf-filler.ts` map 1:1 to the field names embedded in those PDFs. If a template is re-exported from Acrobat, field names can silently change — verify the filler before assuming the route is broken. The invoice templates use generic auto-numbered field names (`1`, `2`, `33`, `Text1`...) instead of descriptive ones — the filler maps them by widget position, documented in that file.

## Domain context

Henry is the **insured's independent appraiser** under the standard auto-policy appraisal clause. The opposing party is the insurance company's appraiser (IA / "Opposing Appraiser"). The app treats "Us" (Modern Appraisers) and "IA" as opposing sides throughout — preserve that framing in any AI prompt or UI copy.

## Work Log

**Update this every session.** Newest entry on top. Each entry: date, what we did, what changed on disk, deploy status (what's live after), and future plans / open TODOs.

### 2026-07-20 (later still) — Claim workspace Back/Next nav bugs

**What we did (Henry: "in acv report when i click next it takes my to weird pages... it takes my to summary page, when i click back from the award it just gives me all the tools"):** two separate stale-navigation bugs in `ClaimWorkspace.tsx`, both leftovers from before the app became tab-based:
1. **ACV Report "Next: Summary" button** — the Review & Generate step (step 4, inside the ACV Report tab) had a hardcoded `onNext={() => setStep(5)}` that jumped straight to the Summary tab, a relic of the old linear wizard from before tool tabs existed. Since the reorder on an earlier 07-20 session, Summary isn't even next in tab order anymore (DV/Award/Closing Notes come between ACV Report and Summary now). Same root cause as the earlier "Next: Select Comps" button removal on Claim Info — the tool tabs already let you jump to any tool, so a forced-linear "Next" is dead weight and actively misleading. Removed the button and the `onNext` prop from `ReviewStep` entirely.
2. **Award tab's bottom "Back" button gave "all the tools"** — `ReportsStep` (the one component behind Award/Closing Notes/Summary, controlled by tab clicks via its `view` prop) has each report form's *top* "Back to Tools" button correctly hidden with `{!view && (...)}` so it doesn't fight the tab bar. Closing Notes' *bottom* Back button (next to Download) had the same guard. **Award's bottom Back button was missing it** — clicking it called `setSelectedReport(null)` while `view` stayed pinned to `'award-agreement'`, which fell through to `ReportsStep`'s internal "pick a report type" hub (Award/Closing Notes/Summary cards) — exactly the "all the tools" Henry described. Added the same `{!view && (...)}` guard so it matches its Closing Notes sibling.
- Checked for the same pattern elsewhere (`grep setStep(` across the file) — every other `setStep` call is either a direct tab click or legitimate within-tab stepper navigation (steps 2↔3↔4 inside the ACV Report tab, or the Loss Search toggle). No other instances found.
- Verified: `npx tsc --noEmit` clean, `npm run build` green. Lint unchanged (pre-existing warnings/errors only — the `editId`/`mileageRate`/`reportsState` unused-var warnings on `ReviewStep` predate this change, not introduced by it).

**On disk, deployed:** `src/components/claim/ClaimWorkspace.tsx`.

**Deploy status: LIVE.** `modern-tools-rho.vercel.app` → `modern-tools-mtqtksgek` (deployed via `vercel --prod`, alias verified, `/login` responds 200). Rollback target if needed: `modern-tools-6p8325hhm` (previous prod build, same day — Invoice tool follow-ups).

### NEXT SESSION — Henry's TODO list (start here)

1. **⚠️ RUN `supabase-migration-invoice.sql` in the Supabase SQL editor.** Adds the `invoice` jsonb column the claim workspace's new Invoice tab needs. The 42703 fallback in `saveACVHistory` means claims still save fine without it, but Invoice state on a claim silently won't persist until this runs.
2. **Download path for all documents** — still needs clarification from Henry (deferred this session).
3. **Umpire tab** — new claim-workspace tool tab for umpire rulings. (Closing Notes already has umpire notesTypes `acv-umpire`/`dv-umpire` + umpireName/umpireAmountNum in reportsState — probably related; clarify scope.) Could live inside the Invoice tab's component (`reports-tab.tsx`, internal name kept generic for this reason) as an additional report type. Deferred this session.
4. ~~Invoice tab~~ — **done 2026-07-20**, see below. Labeled "Reports" in the claim workspace at first; renamed to "Invoice" later the same day per Henry (the standalone nav item stays "Reports").
5. **DV tab redesign** — Henry: "it looks messy." Tighten the layout (currently 6 stacked cards; consider two columns / collapsible rubrics). Deferred this session.
6. ~~Claim page header polish~~ — **done 2026-07-20**, see below.
7. **Arrows bug** — "arrows next to the tab/claims on the right side": still unresolved, no visible cause found in the tab-row or claims-table JSX. **Need a screenshot from Henry** to actually diagnose this — don't guess-fix again.
8. **Carry-over:** repaired `dv-nationwide-sedgwick.pdf` from Henry (Acrobat re-save) → drop into `public/dv-templates/` → redeploy; Estimate Dispute results could also auto-file into Documents (only reports do today); consider reconciling git with reality (needs Henry's go-ahead).

### 2026-07-20 (later same day) — Reports area + Invoice tool

**What we did (Henry: "add a reports spot for claims and also a report spot in the Nav bar," starting with invoices):** built two intentionally-separate Reports surfaces sharing one PDF-filling backend:
- **Standalone `/reports`** (new top-nav item) — a landing page (`src/app/reports/page.tsx`) linking to report builders; `/reports/invoice` is a fill-everything-by-hand Invoice builder, no claim binding, no persistence — download only. This is the "someone needs to admin a report manually" case.
- **Claim workspace Reports tab** (new `TOOL_TABS` entry, step 12, `src/components/claim/reports-tab.tsx`) — Client/Owner/Insurance/Vehicle auto-fill from that claim's Claim Info (same pattern as the DV tab), so only Date/Invoice #/Template/Line Items need entering. Persists per-claim as `acv_history.invoice` jsonb via the normal auto-save; generated PDFs auto-file into that claim's Documents tab (new `ClaimDocument` source `'invoice'`).
- **Two invoice templates**, copied from Henry's `Modern Invoice LONG.pdf` / `Modern Invoice VERY LONG.pdf` into `public/invoice-templates/invoice-{long|very-long}.pdf`: **Long** has the full Owner/Insurance/Vehicle block + 8 line-item rows; **Very Long** drops that block for 14 line-item rows. The UI's variant picker (`src/components/invoice/invoice-fields.tsx`) blocks switching to Long if it would silently drop rows past its 8-row cap.
- **New shared filler** `src/lib/invoice/invoice-pdf-filler.ts` + `src/lib/invoice/types.ts` (kept fs/pdf-lib-free so client components can import it directly — see that file's header comment) + `src/app/api/invoices/generate-pdf/route.ts`. Both templates use generic auto-numbered AcroForm field names (not descriptive), mapped by widget position — documented in the filler.
- **Real bug caught in testing, not shipped:** field `33` in both templates has **two widgets** — one at the Subtotal box, one at the Total box — because Modern Appraisers never charges sales tax so Henry's own template shares one field between both display boxes. Field `34` is the separate, genuinely-blank Sales Tax box. First implementation wrote the invoice total into field `34`, which would have printed a bogus "Sales Tax: $X" line on every real invoice. Caught by generating real test PDFs against the live API and reading them back before considering this done — fixed by only ever writing field `33` (auto-populates both Subtotal and Total) and leaving `34` untouched. Also switched the DA font from a fixed 10pt to 9pt after the VIN field (only ~101pt wide, needs to hold a 17-char VIN) visibly clipped at 10pt; tried auto-size (`0 Tf`) first but it made line-item text render inconsistently larger than header fields, so went with a uniform smaller fixed size instead.
- **New migration** `supabase-migration-invoice.sql` (adds `acv_history.invoice` jsonb) — **NOT yet run**, see NEXT SESSION #1. `saveACVHistory`'s existing 42703 fallback covers this gracefully in the meantime (claims still save, just without invoice data, same as it did for documents/dv before that migration ran).
- Verified: `npx tsc --noEmit` clean, `npm run lint` zero new warnings/errors, `npm run build` green, and both invoice templates hand-tested end-to-end against the running dev server (generated real PDFs via the live API, read them back to confirm every field, iterated twice on the bugs above before shipping).

**On disk:** `src/lib/invoice/*`, `src/components/invoice/*`, `src/components/claim/reports-tab.tsx`, `src/app/reports/*`, `src/app/api/invoices/generate-pdf/route.ts`, `public/invoice-templates/*.pdf`, `supabase-migration-invoice.sql`, plus small edits to `ClaimWorkspace.tsx`, `app-header.tsx`, `src/lib/supabase/history.ts`, `src/lib/supabase/documents.ts`, `documents-tab.tsx`.

**Follow-up same session, per Henry:**
- **Dropped the manual template picker entirely.** Henry: "i dont want the option to select 2 different reports... based on the total amount of lines... it will choose the report." `pickInvoiceVariant(lineItemCount)` in `types.ts` now does this automatically (>8 lines → Very Long, else Long) everywhere the template mattered — no more `variant` field in either `InvoiceReportState` or the standalone form data. `InvoiceLineItemsEditor` caps at 14 (the larger template's limit) and shows a small "Using the X template" note; the Owner/Insurance/Vehicle block just shows/hides itself based on line count.
- **Currency formatting on the page:** line-item Total is now a `$`-prefixed input that reformats to `0.00` on blur (`InvoiceMoneyInput` in `invoice-fields.tsx`); the Subtotal/Total summary card shows `$` too.
- **Claim-bound Reports tab now shows the Client/Owner/Insurance/Vehicle fields on the page, editable.** Henry: "i would like that information thats in the report to be on the page. So if i want to change anything, I can." Previously these were invisibly pulled from Claim Info only at PDF-generation time. Now `InvoiceReportState` carries the same full field set as the standalone form (unified as `InvoiceFormData` in `types.ts`); `defaultInvoiceReportState(claim)` seeds it from Claim Info the first time the tab opens for a claim, then it's independently editable and saved with the claim from then on — editing it does not write back to Claim Info. Both the claim-bound tab and the standalone builder now render the same `InvoiceFormFields` component so they can't drift apart.
- Verified: `tsc --noEmit` clean, lint clean, `npm run build` green, re-tested PDF generation against the live API.

**Second follow-up, per Henry:**
- **`$` now actually prints on the PDF too.** Henry clarified the first pass (UI-only currency formatting, plain numbers on the printed page) was wrong — he wants `$450.00` on the printed invoice itself. Added `formatLineItemsForPdf()` / `formatInvoiceMoneyWithSign()` in `types.ts`: line items and Subtotal/Total are `$`-formatted right before the PDF request goes out (blank/unused rows stay blank, not `$0.00`). Verified against the live API — Subtotal/Total/all three line items print with `$` and fit the boxes fine at the existing 9pt.
- **Invoice # auto-fills from the claim's MA # (Modern #)** in the claim-bound Reports tab — `defaultInvoiceReportState(claim)` now seeds `invoiceNumber: claim.maNumber` instead of blank. Still editable. (Standalone builder has no claim to pull from, unchanged.)
- **Removed the "Pre-filled from Claim Info..." helper line** from the Reports tab per Henry's ask.
- **Claim workspace header redesigned again** — replaced the single big title + small subtitle (from earlier today's TODO #6) with 5 equally-weighted stats across the top: **MA # · CL # · Vehicle · Client · Owner** (new `ClaimHeaderStat` component in `ClaimWorkspace.tsx`, right above `ClaimWorkspaceInner`). `/claims/new` still shows a plain "New Claim" h1 since there's no claim data yet to show as stats.
- Verified: `tsc --noEmit` clean, lint clean, `npm run build` green.

**Third follow-up, per Henry:** renamed the claim workspace's tab label from "Reports" to "Invoice" (the standalone `/reports` nav item is unaffected — still "Reports"). Tab id and component (`reports-tab.tsx`, `ReportsTab`) kept their internal name since more report types may land in there later; only the visible label changed (`TOOL_TABS` entry + the `<h2>` inside the tab). Verified: `tsc --noEmit` clean, lint clean, `npm run build` green.

**Deploy status: LIVE.** `modern-tools-rho.vercel.app` → `modern-tools-6p8325hhm` (includes all three follow-up rounds above, alias verified). Prior builds same day, newest first: `modern-tools-9m5r4nps1`, `modern-tools-q3vwhx0a5`, `modern-tools-r0131lk7q` (initial Reports/Invoice build), `modern-tools-nt4d8iu91` (before Reports existed at all — rollback target if the whole feature needs to come out).

### 2026-07-20 — Workspace UX cleanup + bug pass

**What we did (Henry: "let's debug the entire website," plus specific asks):**
- **Removed the redundant "Next: Select Comps" button** on the Claim Info tab (step 1). The tool tabs already let you jump straight to any tool, so this forced-linear button was dead weight — Claim Info now just has "Create Claim" for `/claims/new`, nothing for an existing claim.
- **Reordered the tool tabs** (Henry's spec) to **ACV Report → Diminished Value → Award → Closing Notes → Summary → Estimate Dispute** (`TOOL_TABS` in `ClaimWorkspace.tsx`). Pure display-order change — `tabForStep`/`stepForTab` don't depend on array order, so no deep-link or state logic changed.
- **Claim header polish (TODO #5):** the big page title now shows the claim's **MA # → Insurance Claim # → insured name → vehicle** (first one present), with a subtitle line underneath showing the vehicle + insured name (whichever isn't already the title). Previously it only ever showed year/make/model.
- **Header + tabs made bigger/bolder** per Henry's request: claim title `text-2xl font-bold` → `text-3xl font-extrabold`; both tab rows `text-sm` → `text-base font-bold` (`font-semibold`/`font-medium` before).
- **Dropped the "Tools" label** next to the tools row (Henry didn't like how it read) and **added vertical divider bars between every tab button** in both rows (claim-info row and tools row) instead of the small `gap-1`.
- **Bug pass:** ran `tsc --noEmit`, `npm run lint`, and a full `npm run build` — all clean/green except pre-existing warnings (the huge line-28 warning count in the build output is from a vendored minified file, not our code) and two pre-existing lint errors we didn't introduce. Fixed one of them as a quick, low-risk win: `src/app/summary-page/[id]/page.tsx` was calling `setBackHref` synchronously inside a `useEffect` on mount (a real `react-hooks/set-state-in-effect` error) — switched `backHref` to a lazy `useState(() => ...)` initializer reading `?from=` directly, so there's no extra render and the lint error is gone. Left the two `as any` casts in `notes-pdf-filler.ts` alone — they're deliberate escapes into pdf-lib's underspecified internal AcroForm/DR-resource dict types, not bugs.
- **Arrows bug (TODO #6):** looked for a cause in `ClaimWorkspace.tsx`'s tab rows and `claims-table.tsx` — found no chevron/arrow icon rendered near either the tab rows or the right side of claim table rows. Can't diagnose blind; **needs a screenshot from Henry** next session.
- **Explicitly deferred by Henry this session:** download path (#1), umpire tab (#2), invoice tab (#3), DV tab redesign (#4).

**On disk, deployed:** `src/components/claim/ClaimWorkspace.tsx`, `src/app/summary-page/[id]/page.tsx`. `npx tsc --noEmit` clean, `npm run build` green.

**Deploy status: LIVE.** `modern-tools-rho.vercel.app` → `modern-tools-nt4d8iu91` (deployed 11:29 AM 07-20 via `vercel --prod`, alias verified, `/login` responds 200). Rollback target if needed: `modern-tools-kshryus4a` (previous prod build, 07-18).

### 2026-07-18 — Claim-centric restructure (Phases 0–1 of 3)

**The big redesign (Henry's spec, confirmed):** the app is being rebuilt around claims. `/` becomes a dashboard of all OPEN ACV claims (shared team-wide); claims get `open`/`closed` status with a Closed Claims archive; clicking a claim opens a workspace with everything as tabs (Claim Info | ACV Report | Summary | Closing Notes | Award | Estimate Dispute | Loss Search); Auto ACV dropped; Negotiations deleted for good; Estimate Dispute becomes per-claim (saved on the claim, no separate history); everything shared across all users. Full plan: `~/.claude/plans/reflective-honking-eclipse.md`.

**Phase 0 (on disk, NOT yet run):** `supabase-migration-claims.sql` at repo root — adds `status`/`estimate`/`auction_listings` columns to `acv_history` + swaps per-user RLS for team-wide policies (mirrors `summaries`). Also appended to `supabase-schema.sql`. **Henry must run this in the Supabase SQL editor BEFORE Phase 1 deploys or full local testing** (auction saves write `auction_listings` and will 42703 without it).

**Phase 1 (code complete, NOT deployed):**
- New `src/components/app-header.tsx` — single shared header (usePathname active state); replaced the hand-duplicated header in all 11 remaining page files. Nav: Estimate Dispute | ACV | Rules / Laws.
- **Negotiations deleted**: `src/app/negotiations/`, `src/app/api/negotiations/`, dashboard tile, all nav links. (The word "negotiations" in comp-finder closing-notes prose is legal letter text — untouched, not a leftover.)
- `src/lib/supabase/history.ts`: `ACVHistoryEntry` gains `status`/`estimate`; new `fetchACVEntry(id)` + `setClaimStatus(id, status)`; `saveACVHistory` switched from blind upsert to **update-first / insert-if-missing** (upsert would stamp the saver's user_id onto a teammate's shared row) with optional fields included only when defined (a save that omits a tool's data can never null it); `auction_listings` now actually persists (Loss Search listings round-trip for the first time).
- Verified: `npm run build` green (after clearing stale `.next`), `npx tsc --noEmit` clean, changed files lint-clean (remaining lint errors are pre-existing).

**Phases 2 + 3 (code complete, NOT deployed — Henry asked to build everything, review once, then deploy):**
- **Claim workspace** `src/components/claim/ClaimWorkspace.tsx` — the comp-finder monolith relocated (copy, not rewrite) and reworked: loads by id via `fetchACVEntry` (sessionStorage handoff deleted); tabs **Claim Info | ACV Report | Summary | Closing Notes | Award | Estimate Dispute | Loss Search** over the original internal `step` machine (1=info, 2-4=ACV stepper, 5/8/9=report views, 6=loss, 7=estimate); `?tab=` synced to URL via history.replaceState; Open/Closed status pill (`setClaimStatus`); auto-save extended with status/auctionListings/estimate + preserves legacy `mode`; `/claims/new` promotes to `/claims/{id}` after first save (promotedIdRef guards against refetch clobber); localStorage draft only for unsaved new claims, never hydrated for existing ids.
- **ReportsStep stayed intact** with a new optional `view` prop — one mounted instance behind the Summary/Notes/Award tabs, so its claim↔award↔notes sync effects behave exactly as before (no hoisting needed); hub + back buttons hidden under tab control; Summary tab auto-runs `openSummaryPage` (OA re-sync preserved).
- **New routes**: `/claims/[id]` (thin wrapper), `/` = Open Claims dashboard (shared `ClaimsTable`, New Claim button, MigrateData kept), `/closed` = archive. `/acv`, `/acv/comp-finder`, `/acv/auction`, `/estimate-dispute` → `redirect('/')`; `/acv/auto-acv` + `/estimate-dispute/history/*` **deleted**. `/summary-page` + `/acv/test-autodev` untouched. Delete on the dashboard now asks for confirmation (claims are shared now).
- **Loss Search** → `src/components/claim/loss-search-tab.tsx` (claim info comes from the workspace; listings persist via `auction_listings`).
- **Estimate Dispute** → `src/components/claim/estimate-tab.tsx` (FileUploadZone + full Results editor extracted from the old page; upload → `/api/compare-estimates` → saved as `acv_history.estimate` `{savedAt, fileNameA/B, softwareA/B, grandTotalA/B, totalDifference, result}`; NO writes to `estimate_history` anymore).
- Nav final: **Open Claims | Closed Claims | Rules / Laws**.
- Verified: clean `npm run build`, `npx tsc --noEmit`, changed files lint-clean (one inherited set-state-in-effect suppressed with comment); route smoke test — new pages 200, old routes 307→/, `/negotiations` 404.

**Late-session additions (all deployed):**
- Phase 0 SQL confirmed run on project `ektglhdstobaipdqssjx` (prod env pull verified same project): all 4 team-wide policies present, `status` column live, **390 claims intact**. The blank localhost dashboard was almost certainly an unauthenticated localhost browser session (login cookies are per-domain), NOT missing data.
- Hardening before deploy: `fetchACVHistory` returns null on error and both dashboards show a red error banner instead of silently rendering empty; AppHeader now shows the signed-in email.
- Per Henry mid-deploy: nav renamed to **Dashboard** (`/`, open claims only) + **All Claims** (`/claims` — every claim with an Open/Closed status column; `/closed` → redirects there) + Rules / Laws.
- `supabase-seed-test-claims.sql` at repo root: optional 15 'demo-*' test claims (never run; wipe with `delete from acv_history where id like 'demo-%'`).

**Evening session 2 — DV tool, Documents tab, tab restructure (deployed `modern-tools-kshryus4a` 6:02 PM, alias verified):**
- **Two-row tabs**: Claim Info | Documents on top; Tools row below (ACV Report | Diminished Value | Summary | Closing Notes | Award | Estimate Dispute). **Loss Search is now an option INSIDE the ACV tab** (Comp Finder / Loss Search pill toggle), step 6 under the 'acv' tab id.
- **Diminished Value tab** (`src/components/claim/dv-tab.tsx` + `src/lib/acv/dv-pdf-filler.ts` + `/api/acv/generate-dv-pdf`): 4 report variants = (Nationwide | wLoss) × (Attorney/consumer | Sedgwick/insurance), templates in `public/dv-templates/` (fillable AcroForms copied from Henry's Desktop). Damage-severity + mileage rubrics shown in the UI as guided pickers (mileage auto-selects from claim mileage, override allowed); KBB/JDP high+low inputs, adjustments, prior-loss % (15-100). Field map documented in the filler (incl. per-template generic Text1/2/4/5 in the wLoss Additional Adjustments row). Verified: 3 variants generate correct PDFs (values read back). ⚠️ `dv-nationwide-sedgwick.pdf` is CORRUPTED (invalid xref) — Henry must re-save the original in Acrobat (File > Save As) and replace `public/dv-templates/dv-nationwide-sedgwick.pdf`; until then that one variant errors with a friendly message. DV state saved per-claim in `acv_history.dv`.
- **Documents tab** (`documents-tab.tsx`, `src/lib/supabase/documents.ts`): every generated PDF is auto-filed on download/print — ACV report, Award, Closing Notes, DV report, and the Summary (captured to PDF via html2canvas+jspdf, new deps, before window.print). Manual drag-drop uploads too. Files live in new private storage bucket `claim-documents`; metadata in `acv_history.documents` jsonb.
- **SQL — `supabase-migration-documents.sql` RUN AND VERIFIED by Henry** (bucket `claim-documents` confirmed via select). Both 07-18 migrations are done; the 42703 fallback in `saveACVHistory` remains as a safety net. Earlier in the session Henry also confirmed migration #1 (`supabase-migration-claims.sql`): 4 team-wide policies present, 390 claims intact, all status='open'.
- ReviewStep's Download PDF now re-saves via the workspace save (was a direct saveToHistory that hardcoded mode and dropped extras).

**Deploy status: LIVE.** `modern-tools-rho.vercel.app` → `modern-tools-kshryus4a` (6:02 PM 07-18, alias verified). Previous: `modern-tools-6c858wpvt` (5:32 PM 07-18). Same-evening deploy chain, newest first: `6c858wpvt` (new-claim flow: /claims/new shows ONLY Claim Info + Create Claim button — tool tabs unlock after the claim exists), `m9ajo0p7n` (minimal dashboard subtitles: "N claims"), `k915t4cl5` (Dashboard/All Claims nav), `hjq1tbug2` (the full redesign). **Rollback target if the redesign must be reverted wholesale: `modern-tools-k8cfqjp9m`** (last 07-17 build) via `npx vercel promote <url> --scope henry-as-projects-88caed67 --yes`.

**Known follow-ups / notes:** two users editing the same claim = last-write-wins (same model as summaries); `estimate_history` old rows have no UI (kept in DB); `/summary-page` routes still exist but are out of the nav; consider deleting `scripts/compare-apis.mjs`-era estimate helpers (`saveEstimateHistory` etc. in history.ts now have no callers — left in place deliberately).

### 2026-07-17

**What we did:** Bug-fix session for five ACV issues Henry reported. All root-caused and fixed on disk; build + tsc green.

1. **New ACV pre-filled with old claim/comps** — `startNew` in `src/app/acv/page.tsx` still cleared only the old *sessionStorage* draft keys after the 07-06 move to *localStorage*. Now clears both stores.
2. **$NaN on 3rd comp mileage adjustment** — `handleMileageRateChange` spread `prev[i]` (undefined when a claim was saved with <3 comps), leaving `yearAdj: undefined` → NaN. Guarded there, padded compAdjs to 3 on edit-load, and added NaN-coercion guards in `calculateCompValue` / `calculateACV` (`src/lib/acv/calculations.ts`) plus the AdjustmentsForm display math.
3. **Opposing Appraiser not saving** — three causes fixed in comp-finder: (a) removed the effect that reset all reportsState whenever `claim.maNumber` changed (typing the MA # after filling OA wiped it); (b) `saveACVHistory` (`src/lib/supabase/history.ts`) no longer deletes-then-reinserts the row, which dropped `reports_state` on every save that omitted it; (c) ReportsStep setters converted to functional updates so its two mount-time sync effects stop clobbering each other's slices.
4. **Different vehicle's comps showing on an opened claim** — two causes: edit-load only replaced listings when the entry had comps, so an entry with `comps: []` kept the stale draft's listings; and `handleVinDecoded` (comp-finder + auto-acv) saved `comps: []`, wiping a claim's saved comps on VIN re-decode. Edit-load now always replaces listings/selections/compAdjs and clears compMapRef; VIN-decode saves now pass the current comps/result.
5. **Closing Notes / Award / Summary lost on leave/refresh** — Download PDF now passes `reportsState` to the history save (before it re-saved without it, and combined with #3b that wiped it); `hasUnsavedChanges` now tracks reportsState + mileageRate; added a **2s-debounced auto-save to Supabase** in comp-finder (creates the entry once the claim has an MA# or insured name, saves on any tracked change; startOver cancels pending saves). The Summary link (`summaryId`) lives in reportsState, so persisting it also fixes summaries "not saving".
   Also fixed audit finding #1 from 07-06: the localStorage draft now stores only selected + manual comps, not the full listings array (quota-blowout → silent draft loss).

**On disk:** `src/app/acv/page.tsx`, `src/app/acv/comp-finder/page.tsx`, `src/app/acv/auto-acv/page.tsx`, `src/lib/supabase/history.ts`, `src/lib/acv/calculations.ts`. `npx tsc --noEmit` clean, `npm run build` green.

**Deploy status:** LIVE. Deployed via `npx vercel --prod` at 3:30 PM — deploy `dpl_Hkc7K1qwpspbJQqvkV2fqzL5TBzY` (`modern-tools-9d4dkb786`). Verified: `modern-tools-rho.vercel.app` alias points to it, site responds 200. Previous known-good build if rollback needed: `dpl_DCr4HdzavqmXxrEad4YRFSXdSyhu` (`modern-tools-28rdbt6vi-henry-as-projects-88caed67.vercel.app`).

**Open TODOs:** auction tool still has no draft persistence (07-06 TODO); already-corrupted DB rows (comps wiped by old VIN-decode bug) can't be restored by code — Henry may need to re-pick comps on those claims; consider reconciling git with reality (needs Henry's go-ahead).

**Later same session — Comp Finder subject-spec matching:** comps now default to matching the subject vehicle's **trim, engine, drivetrain, and fuel type** (transmission toggle exists but defaults off — listing data too noisy). Implemented client-side on the fetched listings, NOT via API params: `searchComps` no longer sends trim/engine/drivetrain/transmission to `search-comps`, it fetches the full year/make/model set once and filters in the browser, so the new green **"Match" toggle chips** above the results (e.g. `Trim: XLE`, `Engine: 2.5L I4`) flip instantly with **zero extra MarketCheck/Auto.dev calls**. Smart normalization: "2.5L I4" ≡ "4-Cyl, 2.5 Liter", AWD ≡ 4WD/4x4, CVT ≡ Automatic, "XLE" matches "XLE Premium" but not "SE"; comps missing a spec are treated as non-matching. Manual comps are always exempt. Added Engine/Drivetrain/Transmission inputs to the Search Parameters panel so decode results are visible/correctable. Amber notice + chip row stay visible when filters exclude everything. `matchSubject` toggles persist in the localStorage draft and reset on Start Over. Matching helpers validated with a 33-case test script (all pass). tsc + build green. (The `search-comps` route still accepts the spec params — auto-acv continues to use them.) **Deployed 5:41 PM** — `dpl_CBVeAqa6ESGmxspeYscVNb2WSLif` (`modern-tools-k8cfqjp9m`), alias verified, site 200. Rollback target if needed: `dpl_Hkc7K1qwpspbJQqvkV2fqzL5TBzY` (bug-fix build from earlier today).

### 2026-07-06

**What we did:**
- Cleaned up local-folder confusion. There had been multiple copies of the project (`~/Desktop/modern-tools`, `~/modern-tools`, a temp copy, and a mistaken fresh clone `~/Desktop/modern-tools-live`). **Deleted all but `~/Desktop/modern-tools`** — now the single source of truth.
- **Incident (my mistake):** I wrongly treated the GitHub repo as the source of truth, made a trivial "Apps→App" edit in a fresh git clone, and `git push`ed it. That triggered a git-based Vercel deploy from the stale repo, which **overwrote the real July 2 production build** and temporarily removed the 07/02 work from the live site. Root cause: I did not verify how this project deploys or what was actually live before acting.
- **Recovery:** Promoted the July 2 production build back to live: `vercel promote modern-tools-phm1rgrer-... --scope henry-as-projects-88caed67 --yes`. Confirmed production restored. No code was lost (it lived in local working tree + Vercel deploy history the whole time).
- Redid the "Apps → App" dashboard heading change **correctly**: edited the real live folder (`src/app/page.tsx`) and deployed via `vercel --prod` (deploy `dpl_9hNSuQ26mMZV5TDm1Yd7XHRgHNfV`, live 12:40 PM). This build contains all the real 07/02 work + the heading change.
- Added the "⚠️ CRITICAL" deploy/safety section above and this Work Log to prevent a repeat.
- Reverted the heading back to **"Apps"** in the local tree (the "App" change was only a deploy-pipeline test). ⚠️ This revert is on disk but **NOT deployed** — live still shows "App".
- **Feature — Summary Page opposing-appraiser re-sync:** `openSummaryPage` in `src/app/acv/comp-finder/page.tsx` now re-pulls the Opposing Appraiser name/company from Claim Info every time the Summary Page opens (previously only on first creation). Non-destructive: only overwrites when Claim Info has a value. Built ✓.
- **Feature — durable auto-save (localStorage):** comp-finder and auto-acv drafts moved from `sessionStorage` → `localStorage`, so an in-progress claim survives closing the tab/browser (not just refresh). Also stopped auto-acv from wiping its draft on fresh (non-edit) load. Kept a one-time sessionStorage fallback read. Built ✓.
- **Debug/audit pass** (tsc strict = clean, build = green, ACV math verified correct). Found: (1) 🟠 the localStorage draft stores the *entire fetched `listings` array* → can exceed the ~5MB quota and silently fail to save (undermines "never lose work"); fix = persist only selected comps. (2) 🟠 Opposing-appraiser edits made in the **Closing Notes tab** don't sync back to Award/Summary (Step 1 and Award do sync). Minor: dead code (`setLineItemStatus`), unused imports, lint noise from a vendored minified file.

**Live after this session:** deploy `dpl_DCr4HdzavqmXxrEad4YRFSXdSyhu` (3:11 PM), built from the full local working tree via `vercel --prod`. Live now includes: heading reverted to "Apps", the Summary opposing-appraiser re-sync, and the localStorage auto-save (comp-finder + auto-acv). All prior 07/02 work still present.

**Prior context (07/02 session, per Henry):** changed the summary page location, added more info into the ACV claim details, fixed the award and closing notes. That work is live and is present in the local working tree (still uncommitted to git).

**Deploy workflow lesson (this session):** don't over-gate deploys. After finishing a change, deploy it (with a quick OK) rather than stacking multiple changes locally — undeployed work piled up because each "deploy now?" got skipped as Henry moved to the next task.

**Open TODOs / future plans (next session — start here):**
- **"For everything" — extend auto-save to the auction tool** (`src/app/acv/auction/page.tsx`), which has NO draft persistence at all. Henry asked for persistence across all ACV tools; comp-finder + auto-acv are done, auction is not.
- **Fix audit finding #1:** persist only the selected comps (not the full `listings` array) so the auto-save can't blow the localStorage quota.
- **Fix audit finding #2:** make the Closing Notes opposing-appraiser field sync back to Award/Summary.
- Decide whether to reconcile git with reality (commit the live working-tree state so git stops being misleading). Needs Henry's go-ahead.
- Uncommitted/untracked work still in the tree: auto.dev comp-search integration (`acv/test-autodev`, `api/acv/search-autodev`), summary-page additions, rules-laws updates. Review and decide what stays.
