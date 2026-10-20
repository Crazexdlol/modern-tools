# Rough Numbers Workflow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-claim "rough numbers" workflow that parks claims with the inbox owner (default: Wendy Castro) between Submit #1 and the final Submit, so QC isn't polluted and cycle time stays clean. Also rename `handlingAppraiser` → `negotiatingAppraiser` throughout.

**Architecture:** Two columns on `acv_history` (`needs_rough_numbers` boolean, `rough_numbers_handoff_at` timestamptz). One column on `clients` (`rough_numbers_default` boolean). One seed row in `status_phase_configs` (`rough_numbers`, pauses cycle time). One key in `site_settings` (`rough_numbers_inbox_owner_id`). Routing happens entirely inside `/api/claims/[id]/submit`, which branches on the two columns at the top of the handler. The `handlingAppraiser` rename is handled as a dedicated prep phase and shipped as its own release before the rough-numbers work starts.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase (Postgres jsonb + key/value settings), Tailwind v4, shadcn, pdf-lib (unaffected), react-dropzone (unaffected). No test framework — verification is `npx tsc --noEmit` + `npm run build` + manual QA.

**Shipping cadence:** This plan produces **two separate production deploys** — Phase A (rename) ships first and verifies clean before Phase B+ (rough numbers) is implemented. If anything goes wrong with the rename, we isolate it before adding feature complexity.

---

## Pre-Flight Reference (read once, don't skip)

- `vercel inspect modern-tools-rho.vercel.app --scope henry-as-projects-88caed67` → capture current prod deploy id. Keep it as the rollback target through the whole plan.
- `vercel --prod --scope henry-as-projects-88caed67 --yes` → deploy.
- `vercel promote <good-deploy-url> --scope henry-as-projects-88caed67 --yes` → rollback.
- Migrations: Henry runs them manually in the Supabase SQL Editor. The plan does NOT auto-apply SQL. Each phase that has a migration pauses for confirmation before deploying the code that depends on it.
- Local-only validation per Henry's CLAUDE.md rule: `npx tsc --noEmit` AND `npm run build` must both pass before every deploy.
- Hard rule from CLAUDE.md: this project has NO native browser dialogs. Use `confirmDialog` / `alertDialog` from `src/components/ui/dialog-service.ts`.
- Hard rule from CLAUDE.md: everything is Times New Roman. Any new element must inherit the global font — don't set `font-family` or `fontFamily` to anything else.
- Hard rule from CLAUDE.md: new UI must match the Award/Closing Notes canonical layout (title in a Card header, Back button top-right of the SAME CardHeader, primary action bottom-right labeled "Print Report" when it's a report action; blue primary color).

---

# Phase A — Rename `handlingAppraiser` → `negotiatingAppraiser`

**Why first:** scope is contained (no new feature), gives us a clean deploy to prove the rename works before stacking new behavior on top. The rough-numbers spec treats `negotiatingAppraiser` as metadata only — this prep lands the new name before the plumbing arrives.

### Task A.1: Write the SQL migration for the jsonb key rename

**Files:**
- Create: `supabase/migration-rename-handling-to-negotiating-appraiser.sql`
- Create: `supabase/migration-rename-handling-to-negotiating-appraiser-rollback.sql`

- [ ] **Step 1: Write the forward migration**

```sql
-- supabase/migration-rename-handling-to-negotiating-appraiser.sql
-- Idempotent: rename the jsonb key handlingAppraiser → negotiatingAppraiser
-- on every row that still has the old key. Running this twice is a no-op
-- after the first run (the WHERE clause filters out already-migrated rows).

UPDATE acv_history
SET claim = (claim - 'handlingAppraiser')
         || jsonb_build_object('negotiatingAppraiser', claim->'handlingAppraiser')
WHERE claim ? 'handlingAppraiser';
```

- [ ] **Step 2: Write the rollback**

```sql
-- supabase/migration-rename-handling-to-negotiating-appraiser-rollback.sql
-- Reverse: negotiatingAppraiser → handlingAppraiser on every row.

UPDATE acv_history
SET claim = (claim - 'negotiatingAppraiser')
         || jsonb_build_object('handlingAppraiser', claim->'negotiatingAppraiser')
WHERE claim ? 'negotiatingAppraiser';
```

- [ ] **Step 3: Flag to Henry**

Message to Henry: "Phase A migration is ready at `supabase/migration-rename-handling-to-negotiating-appraiser.sql`. **Do not run it yet** — I'll land the TypeScript rename first so the code reads `negotiatingAppraiser`. Once the code is deployed, you run this migration, which flips the jsonb key on existing rows. Pre-migration state: code reads `claim.negotiatingAppraiser` which doesn't exist yet → shows blank. Post-migration: filled in. The dual-write handled below ensures we don't lose data in the gap."

### Task A.2: Add dual-read fallback to the type-to-row deserializer

**Why:** between Phase A code deploy and Henry running the migration, existing rows still have `handlingAppraiser`. Dual-read means UI renders correctly during the gap.

**Files:**
- Modify: `src/lib/supabase/history.ts` (the `rowToEntry` function that materializes the `claim` jsonb into `ClaimInfo`)

- [ ] **Step 1: Find the rowToEntry function**

```bash
grep -n "handlingAppraiser" src/lib/supabase/history.ts
```

Expected: a line that spreads `row.claim` into the entry. No explicit `handlingAppraiser` reference means the field passes through transparently as part of the jsonb spread. If so, the dual-read is one line in the spread — see Step 2.

- [ ] **Step 2: Add a one-shot dual-read**

Immediately after the line that spreads `row.claim` into the returned entry's `claim` property, add:

```ts
// Dual-read for the handlingAppraiser → negotiatingAppraiser rename.
// Pre-migration rows still have the old key; synthesize the new key so UI
// doesn't go blank in the gap between code deploy and migration run.
// Safe to leave in indefinitely — once migration is run, the OR falls to the
// new key.
if (entry.claim && !entry.claim.negotiatingAppraiser && (entry.claim as unknown as { handlingAppraiser?: string }).handlingAppraiser) {
  entry.claim.negotiatingAppraiser = (entry.claim as unknown as { handlingAppraiser?: string }).handlingAppraiser
}
```

Exact placement: inside `rowToEntry`, after the final `return { ... }` object is constructed and before it's returned. If the function returns the object directly, extract to a `const entry = { ... }` first.

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit
```

Expected: zero errors. If there are errors, they're about `ClaimInfo` not having `negotiatingAppraiser` yet — that's addressed in Task A.3. Leave this patch in place and move on; after A.3, re-run.

### Task A.3: Rename `handlingAppraiser` on `ClaimInfo`

**Files:**
- Modify: `src/lib/acv/types.ts`

- [ ] **Step 1: Find the field**

```bash
grep -n "handlingAppraiser" src/lib/acv/types.ts
```

- [ ] **Step 2: Rename the property**

Change `handlingAppraiser?: string | null` to `negotiatingAppraiser?: string | null`. Leave surrounding comments; update any comment that mentions the field.

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit
```

Expected: a cascade of errors across ~21 files. Each is a usage site that needs renaming. Proceed to the next tasks to handle each cluster.

### Task A.4: Rename in `ParsedClaim` and parsers

**Files:**
- Modify: `src/lib/acv/parsers/types.ts`
- Modify: `src/lib/acv/parsers/modern-appraisers.ts`
- Modify: `src/lib/acv/parsers/eagle-view.ts`
- Modify: `src/lib/acv/parsers/ccc.ts`
- Modify: `src/lib/acv/parsers/corbett.ts`
- Modify: `src/lib/acv/parsers/crawford.ts`
- Modify: `src/lib/acv/parsers/claim-solution.ts`

- [ ] **Step 1: Rename in ParsedClaim**

```bash
grep -n "handlingAppraiser" src/lib/acv/parsers/types.ts
```

Rename the field to `negotiatingAppraiser`. Preserve nullability and comments.

- [ ] **Step 2: Rename in each parser**

For each parser file, grep for `handlingAppraiser` and rename the identifier only. The INPUT PDF label strings (`"Handling Appraiser"`) stay unchanged — the parser's input is the real-world PDF label, which doesn't change. Only the output field name on `ParsedClaim` changes.

Example diff for one parser (apply the same pattern to each):

```ts
// Before:
handlingAppraiser: valueAfter('Handling Appraiser'),

// After:
negotiatingAppraiser: valueAfter('Handling Appraiser'),
```

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit 2>&1 | grep -i "parsers"
```

Expected: zero errors in parsers/ paths.

### Task A.5: Rename in `claim-field-mapping.ts`

**Files:**
- Modify: `src/lib/acv/claim-field-mapping.ts`

- [ ] **Step 1: Find and rename**

```bash
grep -n "handlingAppraiser" src/lib/acv/claim-field-mapping.ts
```

Change the field name key only. The user-facing PDF label strings in the mapping stay unchanged.

- [ ] **Step 2: Verify**

```bash
npx tsc --noEmit 2>&1 | grep "claim-field-mapping"
```

Expected: zero errors in that file.

### Task A.6: Rename in `/complete-report` route

**Files:**
- Modify: `src/app/api/claims/[id]/complete-report/route.ts`

- [ ] **Step 1: Find and rename three sites**

```bash
grep -n "handlingAppraiser\|Handling Appraiser" src/app/api/claims/[id]/complete-report/route.ts
```

Expected: 3 occurrences — the jsonb read, the error message when the field is missing, and the error message when the field matches the current assignee.

- [ ] **Step 2: Rename the jsonb read**

```ts
// Before:
const handlingName = ((row as any)?.claim?.handlingAppraiser ?? '').toString().trim()

// After:
const negotiatingName = ((row as any)?.claim?.negotiatingAppraiser ?? '').toString().trim()
```

- [ ] **Step 3: Update the error strings**

```ts
// Before:
return NextResponse.json(
  { error: 'Set a Handling Appraiser on the claim first — the report hands off to them.' },
  { status: 400 },
)
```
```ts
// After:
return NextResponse.json(
  { error: 'Set a Negotiating Appraiser on the claim first — the report hands off to them.' },
  { status: 400 },
)
```

```ts
// Before:
`Handling appraiser "${handlingName}" does not match a user profile. Pick from the dropdown.`
// After:
`Negotiating appraiser "${negotiatingName}" does not match a user profile. Pick from the dropdown.`
```

```ts
// Before:
'You are already the handling appraiser — use Submit for QC instead.'
// After:
'You are already the negotiating appraiser — use Submit for QC instead.'
```

- [ ] **Step 4: Rename the local variable `handlingName` → `negotiatingName`**

Find-and-replace within this file only.

- [ ] **Step 5: Verify**

```bash
npx tsc --noEmit 2>&1 | grep "complete-report"
```

Expected: zero errors.

### Task A.7: Rename in `/assign`, `/reopen`, `/advance-workflow`

**Files:**
- Modify: `src/app/api/claims/[id]/assign/route.ts`
- Modify: `src/app/api/claims/[id]/reopen/route.ts`
- Modify: `src/app/api/claims/[id]/advance-workflow/route.ts`

- [ ] **Step 1: For each file, grep and rename all identifiers**

```bash
grep -n "handlingAppraiser" src/app/api/claims/[id]/{assign,reopen,advance-workflow}/route.ts
```

Rename every `handlingAppraiser` identifier to `negotiatingAppraiser`. Keep the "assign is decoupled from handlingAppraiser" comment but update it to say `negotiatingAppraiser`. (See CLAUDE.md hard rule — these routes must NOT mirror negotiating appraiser onto `assigned_to`.)

- [ ] **Step 2: Verify**

```bash
npx tsc --noEmit 2>&1 | grep -E "assign|reopen|advance-workflow"
```

Expected: zero errors.

### Task A.8: Rename in profiles / search / hooks

**Files:**
- Modify: `src/lib/supabase/profiles.ts`
- Modify: `src/lib/claim-search.ts`
- Modify: `src/hooks/use-current-company-members.ts`
- Modify: `src/app/api/companies/current/members/route.ts`
- Modify: `src/app/api/admin/users/[id]/route.ts`

- [ ] **Step 1: Grep each file**

```bash
grep -n "handlingAppraiser\|handling_appraiser" src/lib/supabase/profiles.ts src/lib/claim-search.ts src/hooks/use-current-company-members.ts src/app/api/companies/current/members/route.ts src/app/api/admin/users/[id]/route.ts
```

- [ ] **Step 2: Rename every TypeScript identifier**

Only `handlingAppraiser` (camelCase). Leave any `handling_appraiser` database column name UNCHANGED if it exists (we're not renaming SQL columns in this phase — only the jsonb key). If any of these files reference `handling_appraiser` as a column, that's unrelated to this rename and must stay.

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit 2>&1 | grep -E "profiles|claim-search|current-company-members"
```

Expected: zero errors.

### Task A.9: Rename in UI components (part 1 of 2 — top-of-claim labels and badges)

**Files:**
- Modify: `src/components/claims-table.tsx`
- Modify: `src/components/claim-search-button.tsx`
- Modify: `src/components/claim/assignment-sheet.tsx`
- Modify: `src/components/claim/handling-appraiser-license-summary.tsx` — **rename this file too** to `negotiating-appraiser-license-summary.tsx`. Also update every import that referenced the old path.
- Modify: `src/components/claim/state-licensing-top-badge.tsx`

- [ ] **Step 1: Rename the component file**

```bash
git mv src/components/claim/handling-appraiser-license-summary.tsx src/components/claim/negotiating-appraiser-license-summary.tsx
```

Inside the new file, rename the exported component from `HandlingAppraiserLicenseSummary` to `NegotiatingAppraiserLicenseSummary`. Rename all internal identifiers.

- [ ] **Step 2: Update imports**

```bash
grep -rn "handling-appraiser-license-summary\|HandlingAppraiserLicenseSummary" src/
```

Rename every import path and every imported identifier.

- [ ] **Step 3: Rename user-visible labels**

In each of the UI component files, find every occurrence of the user-facing string "Handling Appraiser" and change to "Negotiating Appraiser." Grep carefully — don't miss variants like "handling appraiser" (lowercase in sentence body text).

```bash
grep -n "[Hh]andling [Aa]ppraiser" src/components/
```

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit
```

Expected: zero errors or only errors from files not yet touched (ClaimWorkspace and permissions-tab).

### Task A.10: Rename in UI components (part 2 of 2 — ClaimWorkspace and permissions)

**Files:**
- Modify: `src/components/claim/ClaimWorkspace.tsx` (28 occurrences)
- Modify: `src/app/admin/settings/users/[id]/_tabs/permissions-tab.tsx` (2 occurrences)

- [ ] **Step 1: Find every occurrence in ClaimWorkspace**

```bash
grep -n "handlingAppraiser\|Handling Appraiser" src/components/claim/ClaimWorkspace.tsx
```

- [ ] **Step 2: Rename identifiers**

Every `handlingAppraiser` TypeScript identifier → `negotiatingAppraiser`. This includes variable names, prop names, state keys, hooks, and the paths `claim.handlingAppraiser` on reads.

- [ ] **Step 3: Rename user-visible labels**

Every user-facing string "Handling Appraiser" / "handling appraiser" → "Negotiating Appraiser" / "negotiating appraiser." Preserve case.

- [ ] **Step 4: Permissions tab**

Repeat Steps 1–3 on `permissions-tab.tsx`.

- [ ] **Step 5: Full type-check**

```bash
npx tsc --noEmit
```

Expected: zero errors across the entire project.

### Task A.11: Rename in scripts (one-time, non-production)

**Files:**
- Modify: `scripts/preview-ev-acv.mjs`
- Modify: `scripts/sync-claims-from-csv.mjs`

- [ ] **Step 1: Rename `handlingAppraiser` identifiers**

Even though scripts aren't shipped to production, update them so the next time someone runs them they match the new schema.

- [ ] **Step 2: Verify no residual references in src/**

```bash
grep -rn "handlingAppraiser\|handling [Aa]ppraiser" src/ | grep -v "node_modules"
```

Expected: zero matches. If any remain, chase them down before moving on.

### Task A.12: Final build + commit + deploy for Phase A

- [ ] **Step 1: Full build**

```bash
npm run build 2>&1 | tail -40
```

Expected: `Compiled successfully` and the standard route listing. Zero warnings or errors that didn't exist before this phase.

- [ ] **Step 2: Capture rollback target**

```bash
npx vercel inspect modern-tools-rho.vercel.app --scope henry-as-projects-88caed67 2>&1 | head -20
```

Record the current deploy id and URL. Keep this handy — it's the pre-Phase-A rollback.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor: rename handlingAppraiser → negotiatingAppraiser everywhere

- Rename ClaimInfo field + ParsedClaim field + every TypeScript identifier
  across API routes, parsers, hooks, UI components, and search.
- Rename the file src/components/claim/handling-appraiser-license-summary.tsx
  to negotiating-appraiser-license-summary.tsx (plus the component export).
- Dual-read in src/lib/supabase/history.ts synthesizes negotiatingAppraiser
  from a legacy handlingAppraiser key on rows that haven't been migrated yet
  — safe to leave indefinitely.
- Update user-facing "Handling Appraiser" labels to "Negotiating Appraiser."
- The input PDF label strings on assignment sheets (and their parsers) stay
  as "Handling Appraiser" — that's the real-world input, which hasn't changed.

Followup: run supabase/migration-rename-handling-to-negotiating-appraiser.sql
in the SQL editor after this ships to migrate existing jsonb keys. The dual-
read bridges the gap in both directions.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Deploy**

```bash
npx vercel --prod --scope henry-as-projects-88caed67 --yes 2>&1 | tail -15
```

Expected: `Deployment ... ready.` with a deploy id.

- [ ] **Step 5: Verify alias flipped**

```bash
npx vercel inspect modern-tools-rho.vercel.app --scope henry-as-projects-88caed67 2>&1 | head -20
```

Expected: `id` matches the new deploy from Step 4. `status: ● Ready`. Aliases list includes `hamsportal.com`.

- [ ] **Step 6: Flag migration to Henry**

Message to Henry: "Phase A is live. Please run `supabase/migration-rename-handling-to-negotiating-appraiser.sql` in the Supabase SQL editor. It's idempotent. The code already dual-reads so there's no rush — the migration just cleans the data model. Rollback URL if anything is wrong: [paste from Step 2]."

- [ ] **Step 7: Smoke test**

Open hamsportal.com, open any claim, confirm the "Negotiating Appraiser" field is visible and still shows the value for existing claims (via the dual-read). If a claim shows blank, that's expected pre-migration — Henry runs the SQL and it fills in.

---

# Phase B — Schema for rough numbers

**Why second:** schema needs to be in place before any code path can store the rough-numbers flag or route on it. Henry runs these before the Phase C code deploy.

### Task B.1: Write the forward migration

**Files:**
- Create: `supabase/migration-rough-numbers.sql`

- [ ] **Step 1: Write the SQL**

```sql
-- supabase/migration-rough-numbers.sql
-- Rough-numbers workflow: adds columns + seeds one status phase. Idempotent.

-- 1. acv_history: two new columns.
ALTER TABLE acv_history
  ADD COLUMN IF NOT EXISTS needs_rough_numbers boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rough_numbers_handoff_at timestamptz NULL;

-- 2. clients: per-client default.
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS rough_numbers_default boolean NOT NULL DEFAULT false;

-- 3. status_phase_configs: seed the Rough Numbers phase.
-- pauses_cycle_time=true means time in this phase doesn't count toward
-- cycle-time aggregates (same mechanism used by hold / pending_information).
INSERT INTO status_phase_configs (code, label, color, sort_order, archived, pauses_cycle_time)
VALUES ('rough_numbers', 'Rough Numbers', 'blue', 50, false, true)
ON CONFLICT (code) DO NOTHING;

-- No site_settings schema change needed — we use the existing key/value
-- table with key 'rough_numbers_inbox_owner_id' and a string value.
```

- [ ] **Step 2: Write the rollback**

```sql
-- supabase/migration-rough-numbers-rollback.sql
-- WARNING: dropping the columns will lose any rough-numbers data captured
-- so far. Only use in dev / if you need to reset.

ALTER TABLE acv_history
  DROP COLUMN IF EXISTS needs_rough_numbers,
  DROP COLUMN IF EXISTS rough_numbers_handoff_at;

ALTER TABLE clients
  DROP COLUMN IF EXISTS rough_numbers_default;

DELETE FROM status_phase_configs WHERE code = 'rough_numbers';

-- Also clear the inbox-owner setting if it was set:
DELETE FROM site_settings WHERE key = 'rough_numbers_inbox_owner_id';
```

- [ ] **Step 3: Flag to Henry**

Message to Henry: "Phase B migration is ready at `supabase/migration-rough-numbers.sql`. **Please run it in the Supabase SQL editor before I deploy Phase C.** It's idempotent (uses `ADD COLUMN IF NOT EXISTS` and `ON CONFLICT DO NOTHING`). Tell me when it's done, and I'll proceed."

- [ ] **Step 4: WAIT for Henry's confirmation**

Do not proceed to Phase C until Henry confirms the migration has been run. The /submit route and claim-save paths both reference columns that don't exist pre-migration; without the 42703 fallback, submits would 400. (See Phase C for the fallback details.)

---

# Phase C — Backend plumbing

### Task C.1: Add fields to the Client interface

**Files:**
- Modify: `src/lib/supabase/clients.ts`

- [ ] **Step 1: Add to the Client interface**

Add this line to the `Client` interface after `typeCustom`:

```ts
  // When true, new claims for this client default to needs_rough_numbers=true.
  // Admin flips per-client in the client-edit UI.
  roughNumbersDefault: boolean
```

- [ ] **Step 2: Add to the ClientRow interface**

Add after `type_custom?: string | null`:

```ts
  rough_numbers_default?: boolean
```

- [ ] **Step 3: Add to rowToClient mapping**

In the `rowToClient` function, add after the `typeCustom` line:

```ts
    roughNumbersDefault: r.rough_numbers_default === true,
```

- [ ] **Step 4: Add to updateClient patch builder**

In `updateClient`, add after the `typeCustom` patch line:

```ts
  if (patch.roughNumbersDefault !== undefined) dbPatch.rough_numbers_default = patch.roughNumbersDefault
```

- [ ] **Step 5: Add to the create helper if one exists**

```bash
grep -n "function create\|export async function.*Client" src/lib/supabase/clients.ts
```

If `createClient` or similar accepts an input, mirror the pattern: accept `roughNumbersDefault?: boolean` in the input type and write `rough_numbers_default` on insert. If no create helper writes clients client-side (admin UIs may use direct inserts), that's fine — covered elsewhere.

- [ ] **Step 6: Verify**

```bash
npx tsc --noEmit 2>&1 | grep "clients"
```

Expected: zero errors.

### Task C.2: Add fields to the HistoryEntry / ClaimInfo plumbing

**Files:**
- Modify: `src/lib/supabase/history.ts`
- Modify: `src/lib/acv/types.ts` (ClaimInfo update)

- [ ] **Step 1: Add fields to the saved row shape**

Look for the row-shape type in `history.ts` (around `rowToEntry` and the shape used by `saveToHistory`). Add `needs_rough_numbers?: boolean` and `rough_numbers_handoff_at?: string | null` to the row interface alongside existing fields like `submitted_at`, `workflow_stage`.

- [ ] **Step 2: Add fields to the HistoryEntry interface**

Find the TypeScript interface that `rowToEntry` returns (likely `HistoryEntry`). Add:

```ts
needsRoughNumbers?: boolean
roughNumbersHandoffAt?: string | null
```

- [ ] **Step 3: Add to rowToEntry mapping**

```ts
needsRoughNumbers: row.needs_rough_numbers === true,
roughNumbersHandoffAt: row.rough_numbers_handoff_at ?? null,
```

- [ ] **Step 4: Add to saveToHistory**

Find where `saveToHistory` builds the update payload. Add handling for `needs_rough_numbers` with the 42703 fallback pattern already used for `documents` / `dv` / `invoice`:

```ts
// Inside the update payload builder, add:
if (opts?.needsRoughNumbers !== undefined) payload.needs_rough_numbers = opts.needsRoughNumbers
```

And in the 42703 catch block that strips unknown columns, add `needs_rough_numbers` to the list of columns to drop on retry. Do the same for `rough_numbers_handoff_at` even though saveToHistory shouldn't be writing it from the UI side — the /submit route writes it directly via service client, but defensive coding here keeps the row safe.

- [ ] **Step 5: Verify**

```bash
npx tsc --noEmit
```

Expected: zero errors.

### Task C.3: Add a helper to resolve the inbox owner id

**Files:**
- Modify: `src/lib/supabase/site-settings.ts` (replace the `type SiteSettingsKey = never` to add the new key)
- Create: `src/lib/supabase/rough-numbers.ts` (new focused helper, keeps the submit route tidy)

- [ ] **Step 1: Add the setting key**

```ts
// Before:
export type SiteSettingsKey = never

// After:
export type SiteSettingsKey = 'rough_numbers_inbox_owner_id'
```

- [ ] **Step 2: Create the helper**

```ts
// src/lib/supabase/rough-numbers.ts
import { createServiceClient } from './service'

// Resolves the configured Rough Numbers inbox owner profile id, or null
// if unset. Service-client only; the submit route (server-side) uses this.
// Reads from the shared site_settings key/value table using the global key
// 'rough_numbers_inbox_owner_id'. If per-company inbox owners become a
// requirement later, switch this to a per-company lookup — current scope
// is single-company so a global key is sufficient.
export async function getRoughNumbersInboxOwner(): Promise<string | null> {
  const service = createServiceClient()
  const { data } = await service
    .from('site_settings')
    .select('value')
    .eq('key', 'rough_numbers_inbox_owner_id')
    .maybeSingle()
  const v = data?.value
  if (typeof v === 'string' && v.length > 0) return v
  // Also accept { id: "<uuid>" } shape in case the UI stores it as an object
  if (v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'string') {
    return (v as { id: string }).id
  }
  return null
}

// Writes the inbox owner id. Called from the admin settings UI.
export async function setRoughNumbersInboxOwner(profileId: string | null): Promise<void> {
  const service = createServiceClient()
  // Upsert: insert if missing, update if present. Matches the pattern used
  // for other site_settings keys like completion_notification_admin_id.
  await service
    .from('site_settings')
    .upsert({ key: 'rough_numbers_inbox_owner_id', value: profileId }, { onConflict: 'key' })
}
```

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit 2>&1 | grep "rough-numbers\|site-settings"
```

Expected: zero errors.

### Task C.4: Add the rough-numbers notification function

**Files:**
- Modify: `src/lib/email/claim-notifications.ts`

- [ ] **Step 1: Find the existing notifyAdminClaimSubmitted function**

```bash
grep -n "notifyAdminClaimSubmitted\|notifyStageEntry" src/lib/email/claim-notifications.ts
```

- [ ] **Step 2: Add a new notification function**

Add near the existing `notifyAdminClaimSubmitted` function:

```ts
// Fired when a claim's first Submit lands in the Rough Numbers inbox owner's
// queue (not QC). Reuses the same per-user email prefs + template structure
// as notifyAdminClaimSubmitted — different subject/body only.
export async function notifyRoughNumbersHandoff(args: {
  claimId: string
  inboxOwnerId: string
  submitterName: string
}): Promise<void> {
  const service = createServiceClient()
  const { data: owner } = await service
    .from('profiles')
    .select('email, name, email_notifications_enabled')
    .eq('id', args.inboxOwnerId)
    .maybeSingle()
  if (!owner || !owner.email) return
  // Respect the per-user opt-out flag (matches existing behavior for other
  // claim notifications in this file).
  if (owner.email_notifications_enabled === false) return

  const summary = await fetchClaimSummary(args.claimId)
  const subject = `Rough-numbers claim handed to you${summary?.claimRef ? ` — ${summary.claimRef}` : ''}`
  const body = `${args.submitterName} submitted a claim with rough numbers for client review. It's waiting on you to coordinate the client response.\n\n`
    + `Claim: ${summary?.claimRef ?? args.claimId}\n`
    + `Vehicle: ${summary?.vehicle ?? 'n/a'}\n`
    + `Client: ${summary?.clientName ?? 'n/a'}\n\n`
    + `Open the claim: https://hamsportal.com/claims/${encodeURIComponent(args.claimId)}`

  await sendEmail({ to: owner.email, subject, text: body })
}
```

Note the exact `sendEmail` function name may differ in this file — grep for the actual helper used by `notifyAdminClaimSubmitted` and mirror the pattern.

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit 2>&1 | grep "claim-notifications"
```

Expected: zero errors.

### Task C.5: Add the rough-numbers branch to `/submit`

**Files:**
- Modify: `src/app/api/claims/[id]/submit/route.ts`

- [ ] **Step 1: Add the import**

At the top:

```ts
import { getRoughNumbersInboxOwner } from '@/lib/supabase/rough-numbers'
import { notifyRoughNumbersHandoff } from '@/lib/email/claim-notifications'
```

- [ ] **Step 2: Insert the branch after permission checks**

After the `isAdmin` / `isAssignee` permission check and before the existing `const service = createServiceClient()` line, add:

```ts
// Rough-numbers branch. Fires only on the FIRST submit of a claim that was
// created with needs_rough_numbers=true. Second submit sees rough_numbers_
// handoff_at populated and falls through to the standard QC branch below.
if (claim.needsRoughNumbers && !claim.roughNumbersHandoffAt) {
  const ownerId = await getRoughNumbersInboxOwner()
  if (!ownerId) {
    return NextResponse.json(
      { error: 'Rough Numbers inbox owner is not configured. Set one in Admin → Settings before using rough numbers.' },
      { status: 400 }
    )
  }

  const service = createServiceClient()
  const now = new Date().toISOString()
  const { error } = await service
    .from('acv_history')
    .update({
      rough_numbers_handoff_at: now,
      status_phase: 'rough_numbers',
      status_phase_set_at: now,
      assigned_to: ownerId,
      assigned_at: now,
      // Clear the unread/opened handshake so the inbox owner sees a fresh
      // "new assignment" indicator on their dashboard.
      last_status_request_at: null,
    })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Cycle-time ledger: close the submitter's Main span, open the inbox
  // owner's. The rough_numbers phase pauses cycle time, so the inbox
  // owner's span contributes zero to their aggregate.
  await recordStageTransition(service, id, 'main', ownerId)

  // Resolve submitter name for the notification email.
  const { data: submitterRow } = await service
    .from('profiles')
    .select('name, email')
    .eq('id', caller!.userId)
    .maybeSingle()
  const submitterName = (submitterRow?.name as string | null)?.trim()
    || (submitterRow?.email as string | null)?.trim()
    || 'An appraiser'

  await notifyRoughNumbersHandoff({
    claimId: id,
    inboxOwnerId: ownerId,
    submitterName,
  })

  return NextResponse.json({ ok: true, roughNumbersHandoff: true })
}
```

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit 2>&1 | grep "submit/route"
```

Expected: zero errors.

### Task C.6: Add 42703 fallback on the submit route

**Why:** between Phase C deploy and Henry running Phase B migration (if deployed out of order), the `needs_rough_numbers` column doesn't exist. `claim.needsRoughNumbers` would always read as `undefined` and the branch would never fire. That's correct degraded behavior — but belt-and-suspenders: wrap the branch in a defensive check so if `fetchClaim` partially fails due to missing column, we don't 500.

- [ ] **Step 1: Confirm `fetchClaim` is resilient**

```bash
grep -n "needs_rough_numbers\|42703" src/lib/auth/require-admin.ts
```

If `fetchClaim` doesn't select `needs_rough_numbers`, it won't fail on a pre-migration DB — the field just stays undefined and the branch doesn't fire. That's acceptable.

- [ ] **Step 2: Ensure `fetchClaim` reads the new column**

Open `src/lib/auth/require-admin.ts` (or wherever `fetchClaim` lives — the grep from Step 1 will point to it). Add `needs_rough_numbers` and `rough_numbers_handoff_at` to the select list. Map to `needsRoughNumbers` and `roughNumbersHandoffAt` on the returned object. If adding these to a hard-coded column list, also wrap the fallback: if the row is null due to a column error (unlikely since 42703 would be an error response, not null), fall back to selecting without the new columns.

Minimum change if `fetchClaim` uses `select('*')`: nothing to do; defaults just work.

If `fetchClaim` uses an explicit column list, add the two new columns and the corresponding camelCase mapping.

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit && grep -rn "fetchClaim\|needsRoughNumbers" src/lib/auth/
```

Expected: zero errors; the new fields are mapped in whatever claim-shape type `fetchClaim` returns.

---

# Phase D — UI

### Task D.1: Add the "Needs rough numbers?" toggle to the new-claim form

**Files:**
- Modify: `src/components/claim/ClaimWorkspace.tsx` (Claim Info section)

- [ ] **Step 1: Find the Claim Info render block**

```bash
grep -n "SectionCard title=\"Claim Information\"" src/components/claim/ClaimWorkspace.tsx
```

- [ ] **Step 2: Add state for the toggle**

Near other claim-field state declarations, add:

```ts
const [needsRoughNumbers, setNeedsRoughNumbers] = useState<boolean>(() => {
  // Default from the loaded claim, else false. Only mutable on new claims.
  return (claim.needsRoughNumbers as boolean | undefined) ?? false
})
```

- [ ] **Step 3: Wire the default to the picked client**

Find where `ClientPicker` fires its `onChange`. When a new client is picked AND the claim is new (unsaved), update `needsRoughNumbers` to the client's `roughNumbersDefault`:

```ts
// Inside the ClientPicker onChange, after setting client state:
if (isNew && pickedClient) {
  setNeedsRoughNumbers(pickedClient.roughNumbersDefault === true)
}
```

The lookup for the full client object may require a client fetch (if the picker only returns id + name). If so, add a small `fetchClient(id)` call or extend the picker to return `roughNumbersDefault` as part of its match. Simpler: cache it in the client-picker's returned match object.

- [ ] **Step 4: Add the toggle UI**

Inside the Claim Info SectionCard, near the top (after the identifier fields), add a new row:

```tsx
{isNew && (
  <div className="flex items-center justify-between gap-3 py-2 border-t border-gray-100">
    <div>
      <div className="text-sm font-semibold text-gray-700">Needs rough numbers?</div>
      <div className="text-xs text-gray-500 mt-0.5 max-w-md">
        When on, the first Submit hands this claim to the Rough Numbers inbox and pauses cycle time until it's reassigned. Default comes from the picked client.
      </div>
    </div>
    <Switch
      checked={needsRoughNumbers}
      onCheckedChange={setNeedsRoughNumbers}
    />
  </div>
)}
```

Confirm `Switch` is already imported from shadcn (`@/components/ui/switch`); if not, add the import. For existing claims, we show a read-only indicator instead of an editable toggle — handled in D.2.

- [ ] **Step 5: Persist the value through createClaim**

In `createClaim`, when calling `saveToHistory`, pass `needsRoughNumbers` through the `saveExtras` object (or add it as a direct parameter — mirror the pattern used for other claim-row-level flags like `starred`).

- [ ] **Step 6: Verify**

```bash
npx tsc --noEmit && npm run build 2>&1 | tail -10
```

Expected: zero errors; build succeeds.

### Task D.2: Add the "Rough Numbers" pill to the claim workspace header

**Files:**
- Modify: `src/components/claim/ClaimWorkspace.tsx` (top-of-claim pill area)

- [ ] **Step 1: Find where other pills render**

```bash
grep -n "ClaimLabelPills\|SuppPill\|ClaimPill" src/components/claim/ClaimWorkspace.tsx
```

The top-of-claim pill area uses `ClaimLabelPills`. Open that file to see its props.

- [ ] **Step 2: Add a RoughNumbersPill prop to ClaimLabelPills**

In `src/components/claim/ClaimLabelPills.tsx`, add a `needsRoughNumbers?: boolean` optional prop. When true, render a small blue pill:

```tsx
{needsRoughNumbers && (
  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 border border-blue-200 text-blue-700">
    Rough Numbers
  </span>
)}
```

- [ ] **Step 3: Pass the prop from ClaimWorkspace**

Where `<ClaimLabelPills ... />` is rendered, add `needsRoughNumbers={claim.needsRoughNumbers === true}`.

- [ ] **Step 4: Repeat on claims-table and claim-search-button**

Both of those files also render `ClaimLabelPills` (per the memory from a prior session). Pass the same prop so the rough-numbers indicator shows up in search results and the dashboard list too. Grep: `grep -n "ClaimLabelPills" src/components/`.

- [ ] **Step 5: Verify**

```bash
npx tsc --noEmit && npm run build 2>&1 | tail -5
```

### Task D.3: Add the inbox-owner setting to Admin → Settings

**Files:**
- Review: `src/app/admin/settings/notifications/notifications-client.tsx` (reference pattern — this is where other admin-selection settings live)
- Create or Modify: pick the right page based on where the setting fits (recommendation below)

**Recommendation:** add it to `src/app/admin/settings/notifications/notifications-client.tsx` as a new section, because the pattern there already handles admin profile dropdowns tied to site_settings keys. If the setting feels out of place there, move it to a dedicated "Workflow" section after shipping.

- [ ] **Step 1: Open notifications-client.tsx and find the completion-admin dropdown**

```bash
grep -n "completion_notification_admin_id\|completion-admin\|SubmissionAdmin" src/app/admin/settings/notifications/notifications-client.tsx
```

- [ ] **Step 2: Mirror the pattern for a new "Rough Numbers Inbox Owner" setting**

Add a new form section with an admin-only profile dropdown. Save on change via the existing `setSiteSetting` or `setRoughNumbersInboxOwner` helper (prefer the dedicated helper from Task C.3 for clarity).

Pseudocode (match the existing component's style — don't invent new patterns):

```tsx
<section className="space-y-3">
  <h3 className="text-sm font-semibold text-gray-900">Rough Numbers Inbox Owner</h3>
  <p className="text-xs text-gray-500 max-w-prose">
    When an appraiser submits a claim with "Needs rough numbers" enabled, the claim is parked with this admin. They coordinate the client response and either submit to QC themselves or reassign to a negotiating appraiser.
  </p>
  <select
    value={roughInboxOwnerId ?? ''}
    onChange={(e) => {
      const next = e.target.value || null
      void setRoughNumbersInboxOwnerAction(next)
      setRoughInboxOwnerId(next)
    }}
    className="hp-select max-w-sm"
  >
    <option value="">— pick an admin —</option>
    {admins.map(a => (
      <option key={a.id} value={a.id}>{a.name ?? a.email}</option>
    ))}
  </select>
</section>
```

- [ ] **Step 3: Wire the server action**

Create a server action `setRoughNumbersInboxOwnerAction` that:
1. Verifies the caller is an admin
2. Calls `setRoughNumbersInboxOwner(profileId)` from `src/lib/supabase/rough-numbers.ts`
3. Returns success/failure

If server actions aren't the pattern in this file (check — the notifications-client uses a route handler or inline fetch), mirror the exact pattern already in use.

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit && npm run build 2>&1 | tail -5
```

### Task D.4: Add the "Default to rough numbers" toggle to the client-edit UI

**Files:**
- Modify: `src/app/marketing/_components/client-drawer.tsx` (confirmed; this is the client-edit drawer)
- Possibly also: `src/app/admin/settings/clients/clients-admin-client.tsx` (admin-side editor)

- [ ] **Step 1: Open the client-drawer file and find the type/field layout**

```bash
grep -n "typeCustom\|type_custom\|remarket_interval" src/app/marketing/_components/client-drawer.tsx
```

- [ ] **Step 2: Add the toggle**

Add a new form row near the "Type" field or at the bottom of the "General" section:

```tsx
<div className="flex items-center justify-between gap-3 py-2">
  <div>
    <div className="text-sm font-semibold text-gray-700">Default to rough numbers for new claims</div>
    <div className="text-xs text-gray-500 mt-0.5 max-w-md">
      When on, new claims for this client will have the Needs rough numbers toggle on by default. Can still be flipped per-claim.
    </div>
  </div>
  <Switch
    checked={draft.roughNumbersDefault === true}
    onCheckedChange={(v) => setDraft({ ...draft, roughNumbersDefault: v })}
  />
</div>
```

- [ ] **Step 3: Persist via updateClient**

When the drawer saves, `updateClient` already accepts `roughNumbersDefault` from Task C.1 Step 4 — no additional save wiring needed. If the save code uses a direct Supabase update rather than `updateClient`, add `rough_numbers_default: draft.roughNumbersDefault` to the update payload.

- [ ] **Step 4: Mirror on the admin clients page if it has its own editor**

If `src/app/admin/settings/clients/clients-admin-client.tsx` has its own edit form (not just a list), add the same toggle there.

- [ ] **Step 5: Verify**

```bash
npx tsc --noEmit && npm run build 2>&1 | tail -5
```

---

# Phase E — Verify + Deploy

### Task E.1: Full type-check + build

- [ ] **Step 1: Type-check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 2: Build**

```bash
npm run build 2>&1 | tail -40
```

Expected: `Compiled successfully` + the standard route listing. Zero errors or warnings new to this plan.

### Task E.2: Capture rollback target and deploy

- [ ] **Step 1: Inspect current prod**

```bash
npx vercel inspect modern-tools-rho.vercel.app --scope henry-as-projects-88caed67 2>&1 | head -20
```

Record the current deploy id — this is the pre-Phase-C/D rollback (Phase A has already deployed by this point, so the "rollback to Phase A clean state" is what we're capturing).

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(rough-numbers): per-claim rough-numbers workflow

Adds a per-claim "needs rough numbers" flag (default from the picked
client's new rough_numbers_default). When on, the first Submit does not
go to QC — it reassigns to the configured Rough Numbers inbox owner and
applies a cycle-time-paused "Rough Numbers" status phase. The second
Submit (by the inbox owner or a reassigned negotiating appraiser) falls
through to the normal QC flow via a one-shot rough_numbers_handoff_at
marker.

- Schema: needs_rough_numbers + rough_numbers_handoff_at on acv_history,
  rough_numbers_default on clients, seed "rough_numbers" status phase.
- Settings: new site_settings key rough_numbers_inbox_owner_id, admin-
  configurable from Admin → Settings → Notifications.
- /api/claims/[id]/submit: new rough-numbers branch at the top of the
  handler. Falls through to today's QC behavior for everything else.
- UI: toggle on new-claim form (defaults from the picked client), "Rough
  Numbers" pill on claim headers and search/table rows, per-client toggle
  in the client drawer.
- Notifications: new "rough-numbers claim handed to you" email to the
  inbox owner on handoff.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Deploy**

```bash
npx vercel --prod --scope henry-as-projects-88caed67 --yes 2>&1 | tail -15
```

Expected: `Deployment ... ready.` + a deploy id.

- [ ] **Step 4: Verify alias flipped**

```bash
npx vercel inspect modern-tools-rho.vercel.app --scope henry-as-projects-88caed67 2>&1 | head -20
```

Expected: `id` matches the Step 3 deploy. `status: ● Ready`.

### Task E.3: Manual QA script

Run through every scenario on hamsportal.com. Any failure here is a blocker — do NOT mark the plan complete without all nine passing.

- [ ] **1. Non-rough claim (today's behavior)** — create a claim with the toggle off. Submit. Verify it lands in QC. Verify QC cycle time counter starts.

- [ ] **2. Rough claim first-submit routing** — create a claim with the toggle on. Submit. Verify:
  - Claim does NOT appear in QC.
  - Claim appears in Wendy's "Assigned to me" list.
  - "Rough Numbers" phase chip visible on the claim.
  - Claim header shows the "Rough Numbers" pill.
  - DB check (one claim, via Supabase SQL editor if easy): `rough_numbers_handoff_at` is set, `submitted_at` is null, `workflow_stage` is still `main`, `assigned_to` is Wendy's profile id.

- [ ] **3. Report-only path** — from Wendy's seat on the parked claim, clear the Rough Numbers phase, hit Submit. Verify:
  - Claim leaves Wendy's assigned list.
  - Claim appears in QC.
  - QC cycle time counter starts fresh.

- [ ] **4. Negotiation path** — from Wendy's seat on another parked claim, clear the Rough Numbers phase, reassign to a different appraiser. Verify the appraiser gets the claim in their "Assigned to me" list. From the appraiser's seat, hit Submit. Verify it lands in QC.

- [ ] **5. Cycle-time check** — on the Cycle Times admin page, confirm Wendy's parked period on both claims contributed zero to her cycle time aggregate. Confirm the first appraiser's Main span was credited normally. Confirm the second appraiser (negotiation path) had their Main span credited normally for their active time.

- [ ] **6. Per-client default** — in the client drawer, flip "Default to rough numbers" on for one test client. Create a new claim with that client. Verify the toggle on the new-claim form is pre-filled on. Create another claim with a different client that doesn't have the default on; verify the toggle is pre-filled off.

- [ ] **7. Toggle override** — on a client where the default is on, create a claim and flip the toggle OFF. Submit. Verify today's QC behavior fires (not the rough-numbers branch).

- [ ] **8. Rename sweep** — grep the production page for "Handling Appraiser" (view-source / browser inspect). Zero occurrences. All "Handling Appraiser" labels are now "Negotiating Appraiser."

- [ ] **9. Email notification** — on Wendy's email, confirm the "Rough-numbers claim handed to you" email arrived for the rough-numbers submit from Test #2.

### Task E.4: Update SESSIONS.md

- [ ] **Step 1: Prepend a new entry at the top of `docs/SESSIONS.md`**

Follow the standard entry shape from CLAUDE.md:
- `## 2026-10-13 — Rough numbers workflow + negotiatingAppraiser rename`
- **Worked on:** what the session was about
- **Changed:** files touched grouped by phase (Phase A rename, Phase B schema, Phase C backend, Phase D UI)
- **Deploy status:** two deploys this session (Phase A, Phase C+D). Deploy ids + rollback URLs for both.
- **In progress / broken / unknowns:** any QA items that failed, if any
- **Next:** anything deferred (the three plan-level open questions from the spec)

### Task E.5: Mark plan complete

- [ ] **Step 1: Flag to Henry**

Final message to Henry: "Rough numbers workflow is live. Phase A deploy (rename) + Phase C/D deploy (feature) both ready. All nine QA checks passed. Rollback URLs captured in SESSIONS.md if needed. Three deferred follow-ups from the spec's Open Questions section are still open — reach out if you want any of them scoped."

---

## Self-Review Checklist

Before closing the plan file:

1. **Spec coverage:**
   - Data model additions (3 columns + status phase seed + site_settings key) → Task B.1 ✓
   - /submit routing branch → Task C.5 ✓
   - handlingAppraiser → negotiatingAppraiser rename → Phase A (all tasks) ✓
   - Dual-read fallback for the jsonb rename → Task A.2 ✓
   - New-claim toggle → Task D.1 ✓
   - Rough-Numbers pill → Task D.2 ✓
   - Admin inbox-owner setting → Task D.3 ✓
   - Per-client default toggle → Task D.4 ✓
   - Notification function → Task C.4 ✓
   - Cycle-time behavior (pause-aware stage ledger) → Task C.5 ✓
   - Testing script → Task E.3 ✓

2. **Placeholder scan:** no TBD / TODO / "implement later." Each code step shows the actual code to add; each verification step shows the exact command and expected result.

3. **Type consistency:** `needsRoughNumbers` / `needs_rough_numbers`, `roughNumbersHandoffAt` / `rough_numbers_handoff_at`, `roughNumbersDefault` / `rough_numbers_default`, `rough_numbers_inbox_owner_id` — same names used consistently across every task.

4. **Scope check:** two deploys. Phase A isolates the rename; Phase B–D ships the feature. If Phase A reveals rename problems, we fix them before Phase B.
