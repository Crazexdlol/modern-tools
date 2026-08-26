# Estimate Review — Design Spec

**Date:** 2026-08-25
**Status:** Approved for implementation planning
**Companion doc:** implementation plan will be written to `docs/superpowers/plans/` after this spec is approved

## 1. Elevator pitch

A new AI-driven tool inside the claim workspace's **Estimate Dispute** tab that reads an uploaded auto-body estimate against the MOTOR / CCC P-Pages rulebook and flags line items the opposing appraiser (IA) "over-wrote" — padded operations that violate the guide's rules. For each flagged line, the tool cites the rule, shows the $ impact, and suggests a corrected value. It does **not** compute a proposed grand total (that's the human's call).

## 2. In scope / out of scope

### In scope — the four categories of "over-writing" flagged
1. **'Not Included' operations charged as extras** — e.g. billing separately for a procedure the rulebook says is included in a base R&R time (head lamp aim, clear coat application, etc.)
2. **Overlap operations not deducted** — e.g. billing full R&R quarter panel + R&R roof without the "deduct 4.0 hrs" overlap the rulebook specifies
3. **Excess labor hours vs. rulebook times** — the rulebook publishes labor times per operation; flag when IA materially exceeds them
4. **Duplicate charges / double-billing** — same operation billed under two names, or a part billed separately when it's part of an assembly already billed

### Out of scope for v1
- Suggesting a "proposed grand total" (Henry explicitly ruled this out — see §3)
- Judgment-call disputes not grounded in P-Pages text (e.g. "Replace vs. Repair" opinion questions)
- Non-P-Pages padding patterns (excessive paint-materials percentages, sublet fake amounts) — could add later
- Editing / annotating the AI's output (v1 is read-only; edits deferred)
- Cross-review analysis ("IA has done X on 5 claims") — a future add-on
- Non-CCC/MOTOR rulebooks (Mitchell, Audatex have different guides — v1 uses only the P-Pages Henry provided)

## 3. Output shape (per flag)

Each flagged line renders as one row in a compact table. Fields per flag:

```ts
interface Flag {
  lineDescription: string          // "Front Bumper Cover — Replace"
  panelOrArea: string              // "Front End"
  category: 'not_included' | 'overlap' | 'excess_labor' | 'duplicate'
  severity: 'low' | 'medium' | 'high'
  iaBilled: {
    laborHours?: number
    laborRate?: number
    partPrice?: number
    total: number                  // dollars
  }
  suggested: {
    action: 'reduce' | 'remove'
    laborHours?: number
    laborRate?: number
    partPrice?: number
    total: number                  // 0 if action === 'remove'
  }
  ruleReference: string            // e.g. "P-Pages Ch. 11-18" or "G2 Guide"
  ruleQuote: string                // verbatim excerpt from the rulebook
  impact: number                   // negative dollars (reduction)
}
```

Review-level metadata:
```ts
interface EstimateReview {
  id: string                       // uuid, generated client-side
  reviewNumber: number             // "#1", "#2" — sequential per claim
  savedAt: string                  // ISO
  fileName: string                 // original uploaded filename
  software: string                 // detected via lib/estimate-parser.ts
  grandTotalBilled: number         // parsed from the estimate
  photoCount: number               // 0–10
  flags: Flag[]
  documentId?: string              // Documents-tab entry id, set after auto-file
}
```

**No auto-computed grand total.** The rendered review shows: total flagged $ (sum of |impacts|) and item count. Not a "proposed grand total = IA total + flagged". That's a human decision.

## 4. UI structure

### 4.1 Nested sub-tabs (underline style)

Inside the existing Estimate Dispute tab, add an underline-tab row:
```
[ Compare Two Estimates ] [ Estimate Review ]
────────────────────────
```

The active tab gets a 2px blue underline, inactive is dim gray. Matches the GitHub secondary-nav pattern. Lighter visual weight than the main tab row, signaling sub-navigation rather than a hard tool switch.

Sub-tab state is managed inside `estimate-tab.tsx` as plain component state. No URL sync in v1 (keeps the URL scheme unchanged). Default sub-tab is deterministic: **Compare Two Estimates** if the claim has a Compare result but no reviews (preserves existing behavior); **Estimate Review** if the claim has reviews but no Compare result; **Compare** otherwise (fresh claims). No cross-session remember — a page refresh returns to the deterministic default.

### 4.2 Estimate Review view layout

**Upload panel** — visible if no reviews exist yet, OR when user clicks "Review another estimate":
- Drop zone for 1+ estimate PDFs / images (react-dropzone, same `accept` as Compare)
- Drop zone for 0–10 reference photos (same accept types)
- File chips below each zone with a small × to remove
- "Run Review" primary button (disabled until at least one estimate is present)
- Loading state: spinner + "Reviewing... can take a minute" text (identical UX to Compare)

**Saved review cards** (newest on top, most recent expanded by default):
```
┌── Review #2 · IA_Revised.pdf ──────────────── [Print] [▾] ─┐
│  CCC ONE · Aug 25, 2026 · 4:12 PM                          │
│  Total flagged: -$487.50 · 4 items                         │
│  ────────────────────────────────────────────────────────  │
│  [flag table — layout A]                                   │
└────────────────────────────────────────────────────────────┘
┌── Review #1 · IA_Original.pdf ──────────────── [Print] [▸] ─┐
│  (collapsed — click ▸ to expand)                            │
└─────────────────────────────────────────────────────────────┘
```

Each card has:
- Header: `#N · filename`, software badge, timestamp
- Summary strip: total flagged $, item count
- The flags table (chosen output layout A — compact table)
- Actions: Print, collapse/expand toggle
- A "Review another estimate" button lives ABOVE the newest card so it's always accessible

### 4.3 Flag table (chosen output layout A)

Columns: **Line · IA Billed · Rule · Suggested · Impact**

Category badge (color-coded: `not_included` red, `overlap` blue, `excess_labor` amber, `duplicate` purple) rendered under the line description. Severity is not visually emphasized — impact $ carries the weight. Rows are ordered by descending |impact| by default.

If a rule quote is long, the cell truncates with ellipsis and a hover-tooltip / small "expand row" button. Print CSS unfolds everything.

## 5. API + AI pipeline

### 5.1 New route: `POST /api/acv/review-estimate`

Runtime: **Node** (uses `pdf-lib`, `unpdf`, `tesseract.js` via existing helpers).

**Input** (multipart form):
- `estimates`: 1+ files (`application/pdf` or `image/*`)
- `photos`: 0–10 files, same types

**Processing (per estimate, in parallel — up to 3 concurrent via a small semaphore):**
1. Extract text via `lib/pdf-extractor.ts` (existing helper — handles PDF text + Tesseract OCR fallback)
2. Detect software via `lib/estimate-parser.ts::detectSoftware()` (existing)
3. Encode each photo as a base64 image block for Anthropic's vision API
4. Call **`claude-sonnet-4-6`** with a single message that includes:
   - **System block A** — task instructions + JSON schema (small, uncached)
   - **System block B** — the full P-Pages text with `cache_control: { type: 'ephemeral' }` (large, cached for 5 min)
   - **User message** — image blocks (photos) + estimate text + "Review this estimate against the P-Pages and return flags as JSON"
5. Streaming call (same pattern as `/api/compare-estimates`), collect final message, parse JSON
6. Return `{ reviews: EstimateReview[] }` — one per input file

**Output shape:**
```ts
{ reviews: EstimateReview[] }   // one per estimate uploaded; error entries have { fileName, error: string, flags: [] }
```

Errors on individual estimates don't fail the whole batch — the client renders successful reviews and shows an error banner for failed ones.

### 5.2 Rulebook injection

P-Pages content is stored as **`src/lib/estimate-review/p-pages.txt`** — plain text (no encoding tricks, no JSON structure). Extracted once via a one-shot script (`scripts/extract-p-pages.mjs`) from the source PDF Henry provided (`C:\Users\Owner\Desktop\CCC Estimate Guide - P Pages.pdf`), then committed.

Why this shape, not JSON or RAG:
- Static text = deterministic, no runtime PDF parsing overhead per review
- The whole doc (~132k chars / ~35k tokens) fits comfortably in Sonnet's context
- Prompt caching means we pay ~10¢ once per 5-minute window, then near-free
- Fine-grained JSON structure would either be wrong (rulebook has irregular sections) or brittle (rewrites break the schema)
- RAG index is overkill for a doc that fits in context

**Copyright note:** the P-Pages source is proprietary to MOTOR / CCC. The extracted text is committed to this private repo for internal use only. Do not distribute or expose in a public-facing surface.

### 5.3 Prompt sketch

**System block A (uncached, ~500 tokens):**
> You are an expert auto body damage appraiser reviewing an insurance company appraiser's ("IA's") estimate for over-writing per the MOTOR / CCC P-Pages guide. Return JSON only, matching this schema: `{ flags: Flag[] }` where Flag is `{ lineDescription, panelOrArea, category: 'not_included'|'overlap'|'excess_labor'|'duplicate', severity: 'low'|'medium'|'high', iaBilled: {...}, suggested: {...}, ruleReference, ruleQuote, impact }`. Only flag items backed by the rulebook. Do NOT flag judgment calls (Replace-vs-Repair, part quality) that aren't rulebook-defined. Cite the rulebook section/page for every flag.

**System block B (cached, ~35k tokens):** the entire P-Pages text.

**User message:** image blocks (photos) + estimate text + "Review this estimate. Return JSON only."

## 6. Data model + persistence

Extend `ClaimEstimate` in `src/components/claim/estimate-tab.tsx`:

```ts
export interface ClaimEstimate {
  // ── existing Compare fields (unchanged) ──
  savedAt: string
  fileNameA: string
  fileNameB: string
  softwareA: string
  softwareB: string
  grandTotalA: number
  grandTotalB: number
  totalDifference: number
  result: ComparisonResult
  // ── NEW ──
  reviews?: EstimateReview[]     // undefined until first review is run
}
```

Stored on **`acv_history.estimate` jsonb** (existing column, no migration needed). Empty/undefined for existing claims; `saveACVHistory`'s update-first / insert-if-missing behavior handles the addition cleanly.

Auto-save is triggered on change via the workspace's existing 2s-debounced save (same as every other tab).

## 7. PDF generation + Documents auto-file

On review completion (per estimate):
1. Client renders a hidden `<div>` with print-styled review card at target resolution
2. `html2canvas` captures it → `jspdf` produces a PDF blob (same pattern as `src/lib/summary-pdf.ts`)
3. Upload blob to `claim-documents` storage bucket via `src/lib/supabase/documents.ts::uploadClaimDocument()` (existing)
4. Append entry to `acv_history.documents` with:
   - `source: 'estimate-review'` (new value)
   - `label: 'Review #N — <filename>.pdf'`
   - `documentId` back-linked to `EstimateReview.documentId`

The existing `@media print` CSS block in `estimate-tab.tsx` is **duplicated** into the Estimate Review card component (not extracted into a shared file) — it's ~25 lines, and keeping it colocated with each printable component is lower risk than a shared module that would drift as either side changes.

## 8. File-level implementation plan

### 8.1 New files

| File | Purpose |
|---|---|
| `src/app/api/acv/review-estimate/route.ts` | The API route |
| `src/lib/estimate-review/p-pages.txt` | Extracted rulebook text, committed |
| `src/lib/estimate-review/types.ts` | `EstimateReview`, `Flag`, category / severity enums, JSON schema constant |
| `src/lib/estimate-review/prompt.ts` | System + user prompt builders, JSON parsing |
| `src/lib/estimate-review/pdf.ts` | Render + capture helper for the auto-file PDF |
| `src/components/claim/estimate-review-tab.tsx` | The sub-tab view (upload panel + card list) |
| `scripts/extract-p-pages.mjs` | One-shot script to convert the PDF → `p-pages.txt` (run manually when P-Pages update) |

### 8.2 Modified files

| File | Change |
|---|---|
| `src/components/claim/estimate-tab.tsx` | Extract existing view into `<CompareEstimates />` inner component. Add underline sub-tab bar that switches between `<CompareEstimates />` and `<EstimateReviewTab />`. Extend `ClaimEstimate` interface with `reviews?`. |
| `src/lib/supabase/documents.ts` | Add `'estimate-review'` to `DocumentSource` union |
| `src/components/claim/documents-tab.tsx` | Add display label for `'estimate-review'` source |
| `src/components/claim/ClaimWorkspace.tsx` | No changes expected — the Estimate Dispute tab already loads `<EstimateTab />` which handles its own internal state. Verify no state hoisting needed for sub-tab persistence. |

### 8.3 Explicitly untouched

- `acv_history` schema (no migration)
- Compare Two Estimates functionality (only its container moves; code doesn't change)
- All other tabs, routes, DB tables, RLS policies
- `middleware.ts`, auth flow, `next.config.ts`
- The existing `/api/compare-estimates` route

## 9. Verification plan

Before claiming done, per the standing "verify before completion" rule:
- `npx tsc --noEmit` — must pass
- `npm run lint` — must not introduce new warnings/errors
- `npm run build` — must be green
- Live smoke test against dev server:
  - Upload one estimate → review generates → renders in table → auto-files to Documents
  - Upload multiple estimates → each produces its own review card
  - Upload with 3 reference photos → review references photos in at least one flag
  - Refresh the page → reviews persist
  - Print → PDF matches on-screen table
- Deploy: `vercel --prod --scope henry-as-projects-88caed67 --yes` — verify alias flip

## 10. Cost & performance notes

- **Per review cost:** first review of a 5-min window ≈ **$0.10** (35k input tokens on Sonnet 4.6 uncached at ~$3/MT). Subsequent reviews in the same window ≈ **$0.01** (cached input). Output tokens are small (~1k for a typical flag list).
- **Photos:** each ~1,600 tokens. 10 photos ≈ 16k extra input. Add ~5¢ per review if photos are included.
- **Latency:** dominated by streaming completion of ~1–3k output tokens. Expect **20–60s per estimate**, similar to Compare. Batch of 3 uploaded together runs in parallel — total wall time still ~30–60s.
- **P-Pages size:** if it grows past ~100k tokens, we distill into a JSON rulebook. Not needed at current size.

## 11. Risks & open questions

- **P-Pages copyright.** Text is proprietary to MOTOR / CCC. Repo must stay private. Not exposed via any public route. If Modern Tools ever goes multi-tenant or open-source, this needs revisiting.
- **Rulebook completeness.** The 40-page P-Pages covers labor times, refinishing, moldings, etc. but doesn't cover every possible dispute (e.g. paint materials rate ceilings). v1 flags only P-Pages-grounded items; anything else is out of scope by design.
- **AI false positives.** The AI may occasionally flag legitimate line items. Users are expected to review each flag before disputing; the tool is a "second-appraiser" checklist, not a judgment engine. Explicit UI language should reinforce this.
- **Two users editing the same claim.** Existing model = last-write-wins (same as summaries). Reviews are additive (append to array) so concurrent runs risk a lost review. Acceptable for v1 given team size; document as known limitation.
- **Print PDF quality.** `html2canvas` produces raster PDFs (readable, not selectable text). Same tradeoff as the Summary page. If Henry wants selectable text in the PDF, we'd switch to a `pdf-lib`-based renderer, which is a larger effort. Deferring.

## 12. Alternatives considered (and rejected)

- **Multi-step pipeline** (extract → structure JSON → apply rules → generate output): more control but 4× the API calls, higher latency, more failure points. Rejected — single-call is simpler and the rulebook fits in context.
- **RAG index over the P-Pages**: relevant chunks-only would cut token cost, but retrieval quality on a small, structured guide (40 pages) is unreliable and we lose "the AI can see the whole rulebook" — a real quality benefit. Rejected.
- **New `acv_history.estimate_reviews` column**: cleaner separation but requires a migration, which risks the same "not yet run" gotcha as the invoice migration. Rejected — jsonb blob on the existing `estimate` column is safer.
- **Segmented card buttons for sub-tabs**: heavier visual weight; would clash with the main tab row visually. Rejected in favor of underline tabs (Henry's pick).
- **Card list output** (option B) / **grouped-by-category output** (option C): B is easier to read per flag but scroll-heavy at 10+ flags; C is best for pattern arguments but nests deeper. Rejected in favor of compact table for scannability (Henry's pick).
- **Auto-computed proposed grand total**: high risk of being weaponized against Henry in disputes (opposing appraiser argues about a specific number). Rejected — per-item impact only.

## 13. Sequencing (for the plan phase)

Rough order of work (writing-plans skill will produce detailed steps):
1. Extract P-Pages → commit `p-pages.txt`
2. Define types + JSON schema in `src/lib/estimate-review/types.ts`
3. Build prompt module + API route
4. Extract existing Compare into inner component; scaffold sub-tab bar
5. Build Estimate Review tab UI (upload panel + card list + flag table)
6. Wire persistence (extend `ClaimEstimate`, auto-save)
7. PDF generation + Documents auto-file
8. Verify (tsc, lint, build, live smoke test)
9. Deploy
