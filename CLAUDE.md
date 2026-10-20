# CLAUDE.md

This file tells Claude Code (and every future session) how to work on **HamsPortal** (previously "Modern Tools" — renamed 2026-09-16 as part of the multi-company rollout) without breaking Henry's live production tool. Historical entries below and in `docs/SESSIONS.md` still say "Modern Tools" — that's the same platform.

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
- **Autonomous deploy is authorized** (Henry, 2026-08-25, reaffirmed 2026-10-03). No per-change approval needed for normal code/UI/feature work. Still confirm before anything with real blast radius: destroys data, changes auth, runs a migration, deletes claims, downgrades a package, changes RLS policies.
- **Autonomous env var setup is authorized** (Henry, 2026-10-03). When a feature needs new env vars, generate / set them yourself whenever possible — `vercel env add <NAME> production --scope henry-as-projects-88caed67` for Vercel, append to `.env.local` for local dev. Don't ask "want me to add these?" — just do it. The one thing you CAN'T self-serve is anything requiring a third-party account signup (Resend API key, OAuth client secret, etc.) — for those, generate what you can, flag what you need from Henry, and keep moving.
- **Autonomous `vercel --prod` is the default** (Henry, 2026-10-03). After a feature is built, type-checked, and built clean, run the deploy without asking. Pre-flight (inspect → capture rollback id → deploy → verify) still mandatory. The migration-confirmation rule above still applies: if the feature needs a DB migration, confirm Henry has run it before deploying (or that the code tolerates pre-migration state via 42703 fallback).
- **New claim-info field → update the field mapping + both parsers** (Henry, 2026-10-03). Any new field added to the `ClaimInfo` interface in `src/lib/acv/types.ts` MUST also be added to: (a) `ParsedClaim` in `src/lib/acv/parsers/types.ts` if the field is parseable from a source document, (b) every parser in `src/lib/acv/parsers/*.ts` (modern-appraisers, eagle-view, ccc), (c) the handler in `src/components/claim/ClaimWorkspace.tsx` that applies parsed values to the claim (the `handlePdfUpload` spread), and (d) `src/lib/acv/claim-field-mapping.ts` with the exact PDF labels under each parser's section. The mapping file is the central registry — if a new field is NOT in the mapping, uploaded assignment sheets will silently drop it.
- **HARD RULE: Times New Roman everywhere** (Henry, 2026-10-04; reaffirmed + extended 2026-10-18). The entire HamsPortal UI, the entire modernappraisers.com site, and every generated PDF uses `"Times New Roman", Times, serif`. The global font is pinned via `--font-sans` + explicit `html`/`body` overrides in `src/app/globals.css` on both apps; modernappraisers also uses a `*, *::before, *::after { font-family: ... !important }` sweep to defeat any Tailwind utility that would otherwise introduce a different family. Every PDF generator must use `StandardFonts.TimesRoman` (or `TimesRomanBold`/`TimesRomanItalic`) from pdf-lib. Never introduce a different font — no Geist, Inter, Helvetica, Segoe UI, system-ui, nothing. Weights and sizes can change freely; the family must stay Times New Roman. When touching any pre-existing component that explicitly sets `font-family` / `fontFamily` to something non-Times, scrub it to inherit.
- **HARD RULE: Label-and-value PDFs must draw values post-flatten, not rely on AcroForm widget positions** (Henry, 2026-10-04). On any template that has baked-in label text like `"MA#"`, `"Claim:"`, `"Client :"`, `"Date of Loss:"` followed by a form widget, DO NOT just fill the widget — the widget's rectangle is almost always wider than the value (leaves a big dead space after short values) and/or starts before the label visually ends (values collide with the label). Instead: clear + flatten the fields, then draw every value manually with `page.drawText({ x: 72 + font.widthOfTextAtSize(labelText, size) + GAP, y: baseline, ... })`. One consistent `GAP` (we use `8`) across every row keeps the whole report visually aligned. This mistake cost us multiple deploy cycles on both the LOU report (`src/lib/acv/lou-pdf-filler.ts` — see the MA# / CL# post-flatten patch at the bottom) and the Modern Appraisers cover letter (`src/lib/cover-letter/pdf.ts`).
- **HARD RULE: Consistency with the rest of the workspace is non-negotiable** (Henry, 2026-10-04). HamsPortal is a professional website for a real business. Every new tab, step, tool, or report MUST match the canonical layouts in the Award form (`ClaimWorkspace.tsx` ~2271) and the Closing Notes form (~2446). The six rules below are a checklist — mentally walk every one before each deploy that touches a tab or report view.
  1. **Title placement** — inside a `<Card><CardHeader><CardTitle className="text-black text-lg font-bold tracking-tight">Title</CardTitle></CardHeader><CardContent>…first content…</CardContent></Card>` bubble that ALSO contains the first content. NEVER a separate title Card floating above the content; NEVER a plain `<h2>` outside any card.
  2. **Back button** — top-right of the SAME CardHeader as the title. Style: `<Button variant="ghost" size="sm" className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4 mr-1" />Back to Tools</Button>` for the Award / Closing Notes / Summary flow. For anything launched from the Reports Hub, text is `← Back to Reports` with the outline-button style. Not top-left, not in a separate div, not an underlined link.
  3. **Primary action button (Print)** — always bottom-right of the content, after all form fields. If a Next button exists, Print on the left and Next on the right. Style: `<Button className="bg-blue-600 hover:bg-blue-500 text-white font-bold">{busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Printer className="w-4 h-4 mr-2" />}Print Report</Button>`. Label is ALWAYS exactly `"Print Report"` — never `"Print"`, `"Print Award"`, `"Print DV Report (Attorney)"`, `"Generate PDF"`, or any variant-qualified string. Icon is ALWAYS lucide-react `<Printer />` — never `<Download />` or `<FileText />`.
  4. **Card wrapper styling** — always exactly `className="bg-white border-gray-200 shadow-sm"`. No `border-gray-300`, no `border-blue-200`, no custom shadows.
  5. **Section dividers inside a card** — small uppercase label: `className="text-xs font-medium text-gray-500 uppercase tracking-wider"`. Not `text-sm text-gray-900`, not `text-base`, not bold. Example in use: Closing Notes "Opposing Appraiser" / "Repair Shop" / "Agreement" section headers.
  6. **Primary color is BLUE** — the report-action color is `bg-blue-600 hover:bg-blue-500`. Nothing else — no `bg-emerald-600`, no `bg-green-600`. Emerald/green is reserved strictly for destructive-but-positive actions (close claim, finalize), never for Print/Generate.

  **If a tab you touch violates ANY of these rules, scrub it.** Do not add new deviations. Do not justify an exception. Do not introduce a new style "just for this one view." The audit from 2026-10-04 found violations in nearly every tab — that mistake cost multiple sessions. The six rules above eliminate it.
- **HARD RULE: When Henry asks for a consistency fix, apply it to EVERY similar instance in the same session — do not wait to be told again** (Henry, 2026-10-04). Example: "move the Summary print button into a bubble" is NOT a request to fix only Summary — it's a request to make every tab's print button follow the same pattern. Before deploying, run a grep for the pattern you just changed (`"Printer"`, `"Generate PDF"`, `h2.*mb-4`, `bg-slate-500`, etc.) across `src/components/claim/`, `src/app/claims/`, and anywhere else the pattern could live, and fix every match. Shipping a "fixed Summary, Closing Notes still broken" deploy is a bug — Henry will send you back to do it again and you'll have burned a cycle.
- **HARD RULE: Verify quality before deploying** (Henry, 2026-10-04). Before every `vercel --prod`, mentally walk the surface area you changed and the surface area the user *asked* you to change. Open the files in your head, re-read the diffs. If you deployed and the user comes back saying "but you also need to fix X and Y and Z," you failed this rule. The standard is: the user says "fix this inconsistency," you fix every instance of the inconsistency in one pass. No "I'll do the rest later." No "I didn't realize the LOU had the same issue." No "the Estimate tab was a bigger refactor so I left it." Those are all symptoms of not verifying.
- **HARD RULE: No deferring work with "needs its own session" / "too big to do here" / "I'll leave this for later"** (Henry, 2026-10-04). If Henry asks you to do something, do the whole thing. If a part looks hard, that doesn't mean skip it — it means do it anyway. The only acceptable alternative is to ask BEFORE starting: "This task is bigger than it looks because of X, Y, Z — do you want me to do the whole thing in one go, or scope it down to A and B first?" That question is fine. "I did A and B; C through F need another session" is NOT fine. Never ship a half-done task and surface the other half as a "next steps" footnote in your message. Finish, or ask first.
- **HARD RULE: No native browser dialogs** (Henry, 2026-10-04). Never use `window.confirm`, `window.alert`, `window.prompt`, or the bare `confirm` / `alert` / `prompt` globals. They render as a Chrome-level popup with the URL at the top and "localhost says…" style framing — looks unprofessional and breaks the HamsPortal visual language. Instead, use the imperative in-site dialog service in `src/components/ui/dialog-service.ts`:
  - `await confirmDialog({ title, message, confirmLabel?, cancelLabel?, variant?: 'primary'|'danger' })` → returns `boolean`
  - `await alertDialog({ title, message, okLabel?, variant? })` → returns `void`
  - Both accept a bare string shorthand (`confirmDialog('Delete this?')`) but prefer the object form so you can set an explicit title and the right variant.
  - Use `variant: 'danger'` for anything destructive (delete, archive, cancel claim, send-back). Primary (default blue) for everything else.
  - The service is backed by `<DialogRoot />` mounted once in `src/app/layout.tsx` — never re-mount it, never add a second provider. When you add a new destructive action, swap it to `confirmDialog` straight away; don't let a native `confirm()` sneak into the codebase.
- **HARD RULE: Code must tolerate pre-migration DB state** (recurring, formalized 2026-10-15). Any route or helper that touches a new column must gracefully handle `42703` ("column does not exist") AND `PGRST204` ("not found in the schema cache") errors — Postgres raises one, PostgREST intercepts and raises the other for the same root cause. Catch both, strip the missing column from the payload, and retry so the operation still lands. Examples: `saveACVHistory` in `src/lib/supabase/history.ts`, the phase endpoint's `proceeded_to_umpire` fallback, Settlement Analytics route's retry without `proceeded_to_umpire`. The deploy-before-migration workflow depends on this: Henry runs migrations manually in Supabase SQL editor, often minutes-to-days after the matching code deploy. Pre-migration tolerance means the code can ship first with no outage. Also mirrored on read paths: `rowToEntry` defaults missing columns to safe values (false / null) so lists and detail fetches never crash on an unmigrated DB.
- **HARD RULE: Loose client/company name matching uses `normalizeCompanyKey`** (Henry, 2026-10-15). Per-client routing / grouping / lookup against free-text client or insurance company names (`claim.clientName`, `claim.insuranceCompany`) must go through `normalizeCompanyKey` from `src/lib/company-match.ts` — not raw `.toLowerCase().trim()`. The key normalization lowercases, strips punctuation, drops noise words (`inc`, `llc`, `co`, `corp`, `insurance`, `the`...), AND collapses whitespace, so `"Claim Solution"`, `"CLAIMSOLUTION"`, and `"ClaimSolution Inc."` all land on the same bucket `"claimsolution"`. Reason: per-client notification overrides were silently failing because the saved key matched one spelling but incoming claims used another. The display-tier helper is `normalizeCompanyName` (keeps whitespace); `normalizeCompanyKey` is the stricter one for exact-equality map lookups. When adding a new per-client setting, normalize the saved key AND the lookup key with `normalizeCompanyKey`, and iterate the stored map in the resolver so legacy entries saved pre-normalization still match (see `resolveAdminFromMapOrDefault` in `src/lib/email/claim-notifications.ts`).
- **HARD RULE: Workflow buttons redirect back to the dashboard tab you came from** (Henry, 2026-10-15). Any button that moves a claim OUT of its current stage (Submit for QC, Complete Report, Advance QC → Billing, Advance Billing → Payment, Mark Paid & Close, Send Back, Complete, Cancel) must `router.push(\`/?tab=${previousStage}\`)` after the API call succeeds. Capture `workflowStage` into a local const BEFORE the fetch — the stage changes after the response and the in-memory value will have moved on. The Reopen flow is a deliberate exception: keeps the user in the claim because they typically want to keep editing. See `handleAdvance`, `handleCompleteReport`, `runWorkflow` (submit + approve paths), `sendBackTo` in `ClaimWorkspace.tsx` for the canonical implementations.

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

**HamsPortal** is the platform. **Modern Appraisers** is the (initial) company using it — a second company, **Eagleview**, exists in the DB from 2026-09-16 forward but has no active users yet. Henry is the insured's independent appraiser under the standard auto-policy appraisal clause; the opposing party is the insurance company's appraiser (**IA** / "Opposing Appraiser"). Preserve the "Us vs. IA" framing in any AI prompt or UI copy.

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

`src/components/claim/ClaimWorkspace.tsx` is the entire workspace (~6,800 lines as of 2026-10-16, all state at top level — this file keeps growing). Two rows of tabs:

- Row 1: **Claim Info** | **Documents**
- Row 2 (tools): **ACV Report** (has Comp Finder + Loss Search toggle inside) | **Diminished Value** | **Award** | **Closing Notes** | **Summary** | **Estimate Dispute** | **Invoice**

Internally uses a `step` state machine (steps 1–12) with `tabForStep` / `stepForTab` mapping at the top of the file. `?tab=` synced to URL via `history.replaceState`. Auto-save is 2s-debounced against the claim's `acv_history` row.

Tab components in `src/components/claim/`:
- `loss-search-tab.tsx`, `estimate-tab.tsx`, `documents-tab.tsx`, `dv-tab.tsx`
- `reports-tab.tsx` — the **Invoice tab**. Internal name kept as "reports" since more report types may land there later. Renders `src/components/invoice/invoice-fields.tsx`, which is also used by the standalone `/reports/invoice` builder — the shared component prevents drift.

### Data model (Supabase, ~390 real claims)

Schema is `supabase/schema.sql`. Migrations live in `supabase/` (previously at repo root, moved 2026-08-27). Each `migration-*.sql` has a matching `migration-*-rollback.sql` next to it. **Henry runs them manually in the Supabase SQL editor** — the deploy workflow is "ship pre-migration-tolerant code first, Henry runs SQL later". Recent additions worth being aware of:

| File | Adds | Status |
|---|---|---|
| `supabase/migration-claims.sql` | `status`, `estimate`, `auction_listings` columns + team-wide RLS | RUN (confirmed 2026-07-18) |
| `supabase/migration-documents.sql` | `documents` column + `claim-documents` storage bucket | RUN (confirmed 2026-07-18) |
| `supabase/migration-invoice.sql` | `invoice` column | **STATUS UNKNOWN as of 2026-08-25 — confirm with Henry before assuming Invoice-tab data will persist** |
| `supabase/migration-tickets.sql` | `tickets` table (user-filed support tickets, RLS: users read/write own, super-admin all) | RUN |
| `supabase/migration-tickets-number.sql` | `tickets.number` short-ID column + sequence | Flagged for Henry 2026-10-15 — may still be pending |
| `supabase/migration-tickets-free-subject.sql` | Drops the fixed-enum CHECK on `tickets.subject` so subjects are free-text (120-char cap) | Flagged for Henry 2026-10-15 — may still be pending |
| `supabase/migration-activity-ticks-and-sessions.sql` | `user_activity_ticks` + `user_sessions` tables for the admin activity page's hourly chart / avg session length | Flagged for Henry 2026-10-15 — may still be pending |
| `supabase/migration-claim-proceeded-to-umpire.sql` | `acv_history.proceeded_to_umpire` + `umpire_agreement` booleans with backfill | Flagged for Henry 2026-10-15 — may still be pending |
| `supabase/seed-test-claims.sql` | 15 optional `demo-*` test claims | Not run (delete with `delete from acv_history where id like 'demo-%';`) |

(This table is a highlight list, not exhaustive. Full migration list in `supabase/`.)

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

### Cross-cutting subsystems

Mounted globally in `src/app/layout.tsx`, available everywhere:

- **`<DialogRoot />`** backs the `confirmDialog` / `alertDialog` service (`src/components/ui/dialog-service.ts`). See HARD RULE on native browser dialogs above.
- **`<ActivityHeartbeat />`** (`src/components/activity-heartbeat.tsx`) — fires `POST /api/activity/heartbeat` every 60s while the tab is visible, focused, and interacted-with in the last 5 min. The endpoint writes a per-minute dedup'd row to `user_activity_daily` + a `user_activity_ticks` row + extends/opens a `user_sessions` row. Powers the admin **Activity** settings page (`/admin/settings/activity`) with hours-per-day charts, hourly timelines, and avg session length.
- **`<HenryFloatingLauncher />`** (`src/components/henry-floating-launcher.tsx`) — bottom-right ticket icon (draggable to any corner, position persisted in localStorage) with two tabs: **Submit** (free-text subject + description) and **My tickets** (user's own history with Open/Resolved sub-tabs, status pills, admin-written resolution notes, and a "Not actually fixed — reopen" escape hatch). Admins manage all tickets at `/admin/settings/tickets`; routing endpoints live under `src/app/api/tickets/` and `src/app/api/admin/tickets/`.
- **`<RemindersPushBootstrap />`** — registers the service worker (`public/sw.js`) for push notifications. See `project_reminders_pending.md` memory re: the cron/email channel being deferred.

### Umpire tracking (claim-level, 2026-10-15)

`acv_history.proceeded_to_umpire` + `umpire_agreement` columns, maintained via `POST /api/claims/[id]/umpire` (admin OR assigned appraiser can toggle). Flipping proceeded-to-umpire ON auto-phases to `umpire` or `court_umpire`; flipping OFF clears those phases. Admin phase changes via `/api/claims/[id]/phase` keep the booleans in sync. The UI control is a small `hp-card` on the LEFT side of the claim header stats (mirror of Negotiating Appraiser on the right), gated to claim types ACV / DV / Est Dispute / Specialty. Settlement Analytics has a top-level **"Exclude umpire claims"** toggle that filters KPIs and the table on `proceededToUmpire`. UI labels "Award Amount" rename to "Umpire Ruling Award" wherever the claim has `proceededToUmpire=true` (Closing Notes Agreement section + Summary Valuations grid). PDFs are intentionally unchanged — same `agreementAmountNum` field in the DB.

### Claim-creation required-fields validator

`missingRequiredFields()` in `ClaimInfoForm` (inside `ClaimWorkspace.tsx`) gates the Create Claim button and shows a live `⚠ Missing: …` helper next to it. Current rules (Henry 2026-10-15):

- **Always required:** Owner Name, VIN (exactly 17 chars — skipped if claim types include `specialty`), Insurance Company.
- **If claim types include `acv`, `dv`, or `estimate`** AND `needsRoughNumbers` is false: Ins. Co. Offer (`reportsState.notesData.insuranceOfferNum > 0`) + Opposing Appraiser (`reportsState.notesData.appraiserName` non-empty).
- Rough-numbers claims skip the two extras — the workflow's whole point is that those numbers aren't known yet at creation.

When a new field becomes required, update the validator AND the live helper will pick it up automatically.

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
