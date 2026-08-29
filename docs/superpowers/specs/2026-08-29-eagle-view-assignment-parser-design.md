# Eagle View assignment PDF parser — design

**Date:** 2026-08-29
**Owner:** Henry
**Status:** Approved (verbal), ready for implementation plan

## Goal

Extend the "upload PDF to auto-fill Claim Info" flow so it recognises and parses **Eagle View Enterprises** assignment PDFs in addition to the existing Modern Appraisers assignment format. Two live samples:

- `C:\Users\Owner\Desktop\4A2608CJ01D0002 Assignments.pdf` — Sedgwick, Party = Claimant, Insured section blank, notes trivial
- `C:\Users\Owner\Desktop\003197519000000819001 Assignment.pdf` — USAA Sedgwick CAT, Party = Insured, Owner+Insured populated, notes contain damage description

Both PDFs share one layout: sections `Appraiser Details`, `Admin Data`, `Vehicle`, `Vehicle Location`, `Claimant`, `Insured`, `Owner`, `Notes`. That layout is distinct from Modern Appraisers' (`Insurance Information`, `Owner Information`, `Location Information`, `Vehicle Information`, `Appraisal Information`, `Damage`) so a separate parser branch is warranted.

## Design decisions (already locked with Henry)

| Question | Decision |
|---|---|
| MA# when the PDF doesn't contain one | Leave `maNumber = ''`, fill manually |
| Adjuster fields when PDF has no adjuster | `Client` → `insuranceCompany`; `adjuster` + `adjusterPhone` + `adjusterEmail` blank |
| Insured vs Claimant when PDF has both | Add a full Claimant contact block to `ClaimInfo` — populate whichever section(s) the PDF fills |
| Notes section content | Post as an auto-message on first save (`sender_name = 'Modern Tools (Auto)'`, empty recipients, `is_auto_request = true`), always post if any notes text |
| Format detection | Header-based signature phrase (`Eagle View Enterprises` OR `Admin Data` + `Appraiser Details` section headers) |
| Other formats to support in same change | None — just Modern Appraisers + Eagle View |

## Architecture

Refactor: extract parsers out of the two entry points into a small shared module. Currently `src/lib/parse-claim-pdf.ts` (client-side, actually called) and `src/app/api/acv/parse-claim/route.ts` (server-side, apparently orphaned but real) contain near-identical `parseClaimText` logic. Adding a second format to both would double the drift risk.

New folder `src/lib/acv/parsers/`:

| File | Responsibility |
|---|---|
| `types.ts` | `ParsedClaim` interface (existing fields + new: `claimantName`, `claimantPhone`, `claimantEmail`, `claimantAddress`, `notes`, `format`) |
| `detect.ts` | `detectFormat(text) → 'modern-appraisers' \| 'eagle-view'` |
| `modern-appraisers.ts` | Existing `parseClaimText` extracted verbatim, returns `{ ..., notes: '', format: 'modern-appraisers' }` |
| `eagle-view.ts` | New parser for Eagle View format |
| `index.ts` | `parseClaim(text: string): ParsedClaim` — dispatch |

Both existing entry points become thin:
- `src/lib/parse-claim-pdf.ts` — extract text via browser `pdfjs-dist` (+ OCR fallback via `tesseract.js`) → call `parsers.parseClaim(text)`
- `src/app/api/acv/parse-claim/route.ts` — auth → extract text via server `@/lib/pdf-extractor` → call `parsers.parseClaim(text)`

The orphaned server route is kept (not deleted) — CLAUDE.md rule "never revert/delete out-of-scope work". It becomes symmetric with the client entry via the shared parser.

## Data model: `ClaimInfo` additions

File `src/lib/acv/types.ts`. Existing fields unchanged. Add four optional fields:

```ts
// Optional Claimant contact block. Populated when the assignment PDF captures
// a separate claimant party from the insured (Eagle View format only for now).
// Existing claims fall through with these undefined — non-breaking.
claimantName?: string
claimantPhone?: string
claimantEmail?: string
claimantAddress?: string
```

No schema migration required — `acv_history.claim` is jsonb, extra keys are free.

Downstream consumers (ACV/DV/Award/Notes PDF fillers, dashboard table, exports, imports, messages queue, invoice) keep reading `insuredName` / `owner*` as they do today. New fields only surface in the Claim Info form. `clientType` remains the "who we represent" flag driving report contexts.

## Eagle View field mapping

Section headers (bare, no trailing colon) act as anchors for section extraction: `Appraiser Details`, `Admin Data`, `Vehicle`, `Vehicle Location`, `Claimant`, `Insured`, `Owner`, `Notes`.

Value labels within sections: `Claim #`, `Policy Number`, `Client`, `ClientPhone`, `File Number`, `Assignment Type`, `Date of Loss`, `Loss Category`, `Loss Code`, `Party`, `Deductible`, `Vehicle Year`, `Vehicle Make`, `Vehicle Model`, `VIN`, `Total Loss Indicator`, `Color`, `Drivable`, `Mileage`, `Plate#`, `Company Name`, `Contact Name`, `First Name`, `Last Name`, `Address`, `City, State Zip`, `Email`, `Phone Numbers`.

Mapping table:

| Eagle View source | → ClaimInfo field |
|---|---|
| (nothing) | `maNumber = ''` |
| `Admin Data > Claim #` | `claimNumber` |
| `Admin Data > Client` | `insuranceCompany` |
| `Admin Data > Party` (Insured/Claimant) | `clientType` |
| `Admin Data > Date of Loss` (parse `MM/DD/YYYY HH:MM AM`, keep date only, ISO `YYYY-MM-DD`) | `dateOfLoss` |
| (nothing) | `dateReceived = ''` |
| (nothing) | `adjuster = ''`, `adjusterPhone = ''`, `adjusterEmail = ''` |
| `Vehicle > Vehicle Year` (int) | `year` |
| `Vehicle > Vehicle Make` | `make` |
| `Vehicle > Vehicle Model` | `model` |
| `Vehicle > VIN` | `vin` |
| `Vehicle > Mileage` (int, strip commas) | `mileage` |
| `Insured > First Name` + `Last Name` (joined, trimmed) | `insuredName` |
| `Insured > Address` + `City, State Zip` (joined) | `ownerAddress` |
| `Insured > Phone Numbers` (first Mobile/Home/Work available) | `ownerPhone` |
| `Insured > Email` | `ownerEmail` |
| Zip extracted from `Insured > City, State Zip` (five-digit match) | `zip` (falls back to Claimant address zip if Insured empty, then Vehicle Location) |
| `Claimant > First Name` + `Last Name` | `claimantName` (new) |
| `Claimant > Address` + `City, State Zip` | `claimantAddress` (new) |
| `Claimant > Phone Numbers` (first available) | `claimantPhone` (new) |
| `Claimant > Email` | `claimantEmail` (new) |
| `Notes` section body — all text between the `Notes` header and end-of-document (trimmed of leading/trailing whitespace, collapse runs of 3+ blank lines to 2) | `notes` (fed to the auto-message flow) |

**"Insured section blank" definition:** joined `First Name` + `Last Name` is empty after trim AND `Address` is empty AND `Email` is empty AND `Phone Numbers` yields nothing. If any of those has content, treat as populated.

**Edge case — Sample 1 (Party=Claimant, Insured blank):** `insuredName`/`ownerPhone`/`ownerEmail`/`ownerAddress` all end up empty; `claimantName`/`claimantAddress` populate. `zip` falls back to claimant address.

**Edge case — Sample 2 (Party=Insured, Owner populated with same data):** `insuredName`/`owner*` populate from `Insured` section. `Owner` section content ignored (redundant to Insured). Claimant fields left empty.

**Value extraction:** reuse the existing "label followed by value, stop at next known label / section header / newline" regex approach, tuned to Eagle View's label list.

## UI — Claim Info form

File `src/components/claim/ClaimWorkspace.tsx`, function `ClaimInfoForm`.

Below the existing Owner block (Owner Phone / Owner Email / Owner Address at approximately lines 508-518), add a **"Claimant Contact"** subsection with four inputs styled identically:

- Claimant Name
- Claimant Address
- Claimant Phone
- Claimant Email

Always rendered (not hidden when Party=Insured — appraisers may want to type into them regardless). Empty = no noise. Locked/unlocked by the same `readOnly` gate as the rest of the form.

No other UI changes: workspace header stays as-is, no PDF template edits, no export/import changes.

## Auto-message flow

Trigger: the parsed claim's `notes` field is non-empty on a **new-claim first save** (transition from `/claims/new` to `/claims/[id]`).

1. `parseClaim()` returns `notes: string` (empty for Modern Appraisers format; content for Eagle View when Notes section had text).
2. Client (PDF upload handler in `ClaimInfoForm`) writes `notes` into a `pendingAutoNoteRef.current` alongside the parsed claim info.
3. On first save, immediately after the claim id is assigned, client fires `POST /api/claims/[id]/auto-message` with `{ body: notes, senderName: 'Modern Tools (Auto)' }`.
4. New route file: `src/app/api/claims/[id]/auto-message/route.ts`. Auth-gated via `requireClaimAccess`. Uses `SUPABASE_SERVICE_ROLE_KEY` service-role client to insert:
   ```
   sender_id: null
   sender_name: 'Modern Tools (Auto)'
   recipient_ids: []
   recipient_names: []
   body: notes
   is_auto_request: true
   ```
5. If insert fails, log server-side, return 200 — never block claim creation on a nice-to-have.
6. Once posted, client clears `pendingAutoNoteRef.current` so a subsequent save doesn't repost.
7. If a user uploads a second PDF (re-parses) before saving, the second parse **overwrites** `pendingAutoNoteRef.current` (latest wins).
8. If a user uploads a PDF on an already-saved claim (existing `/claims/[id]`, not `/claims/new`), the auto-message posts immediately after the parse — the "first-save" gate is really a "have-a-claim-id" gate.

**Safety checks to verify during implementation:**
- Postgres accepts empty `uuid[]` for `recipient_ids` (schema `not null`, but `{}` is a valid non-null value).
- `src/components/claim/messages-tab.tsx` renders a message with empty `recipientNames` cleanly (no "To: undefined" leak). If it doesn't, add a guard.
- Queue query in `src/app/api/messages/queue/route.ts` filters `recipient_ids @> [uid]` — empty array won't appear in any unread badge, which is the intended behaviour.

## Format detection

`detectFormat(text)` returns `'eagle-view'` if either:
- Text contains the literal `Eagle View Enterprises`, OR
- Text contains both bare-header section names `Admin Data` AND `Appraiser Details`

Otherwise returns `'modern-appraisers'` (default — everything unknown falls to the existing parser, preserving today's behaviour).

## Testing / verification

Manual verification of both samples:

- `4A2608CJ01D0002 Assignments.pdf` (Sedgwick, Party=Claimant)
  - Expect: `maNumber=''`, `claimNumber='4A2608CJ01D0002'`, `insuranceCompany='Sedgwick Claims Management Servic'`, `clientType='Claimant'`, `dateOfLoss='2026-06-02'`, `year=2026`, `make='Chevrolet'`, `model='Suburban'`, `vin='1GNS6EKD7TR271794'`, `insuredName=''`, `owner*=''`, `claimantName='Ashley Rodriguez'`, `claimantAddress='367 Roseville Avenue, Newark, NJ 07107'`, `zip='07107'`
  - Auto-message body: "Please see received subrogation demand. Thank you"

- `003197519000000819001 Assignment.pdf` (USAA, Party=Insured)
  - Expect: `maNumber=''`, `claimNumber='003197519000000819001'`, `insuranceCompany='USAA Sedgwick CAT'`, `clientType='Insured'`, `dateOfLoss='2026-08-16'`, `year=2025`, `make='Ford'`, `model='Maverick'`, `vin='3FTTW8BA5SRA26130'`, `insuredName='LT Peter Paris'`, `ownerAddress='9735 N ATOSSA RD, Kingman, AZ 86401'`, `ownerPhone='(765)413-6602'`, `ownerEmail='dparis@orbitelcom.com'`, `zip='86401'`, `claimant*=''`
  - Auto-message body: full "Instructions to Estimator..." block including "Hail damage to car body and cracked front windshield"

Regression: upload one existing Modern Appraisers assignment PDF (from any older claim) — every field should match the exact behaviour before the refactor (extracted parser is verbatim).

Build gates before deploy:
- `npx tsc --noEmit` clean
- `npm run build` clean
- Deploy per CLAUDE.md pre-flight: capture current deploy URL for rollback, `npx vercel --prod --scope henry-as-projects-88caed67 --yes`, then re-run `vercel inspect` and confirm alias flipped.

## Files touched (estimated)

**New:**
- `src/lib/acv/parsers/types.ts`
- `src/lib/acv/parsers/detect.ts`
- `src/lib/acv/parsers/modern-appraisers.ts`
- `src/lib/acv/parsers/eagle-view.ts`
- `src/lib/acv/parsers/index.ts`
- `src/app/api/claims/[id]/auto-message/route.ts`

**Modified:**
- `src/lib/acv/types.ts` — 4 new optional fields on `ClaimInfo`
- `src/lib/parse-claim-pdf.ts` — trimmed to text-extract + `parseClaim(text)` dispatch
- `src/app/api/acv/parse-claim/route.ts` — trimmed to text-extract + `parseClaim(text)` dispatch
- `src/components/claim/ClaimWorkspace.tsx` — Claimant Contact form section + `pendingAutoNoteRef` + first-save auto-message call

## Out of scope

- Additional vendor formats beyond Modern Appraisers and Eagle View
- Deleting the orphaned server-side parse-claim route (preserved per CLAUDE.md rule)
- Any workspace-header / report-PDF changes to display the Claimant block
- Any schema migration (all new data lives in jsonb `claim` column)
- Backfill of `claimantName`/`claimantAddress`/etc. for pre-existing claims
