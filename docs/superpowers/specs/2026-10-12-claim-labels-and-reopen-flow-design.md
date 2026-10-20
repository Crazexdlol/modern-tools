# Design: Claim labels (Supplement / Revision / Specialty) + reopen-with-reassignment flow

**Date:** 2026-10-12
**Status:** Approved — proceeding to implementation

## Motivation

Henry wants three descriptive labels on claims that are neither phases (`status_phase`, which is a workflow state) nor claim-types (which control tool-tab visibility):

1. **Supplement** — a counter. Every time a closed claim is reopened "as a supplement," the count increments (`Supp 1`, `Supp 2`, …).
2. **Revision** — a one-time flag. A claim is either a revision or not; reopening a second time as a revision doesn't flip anything.
3. **Specialty** — a one-time flag that identifies a claim as a specialty assignment.

Related housekeeping on the same workspace toolbar:

- Today a closed claim shows three loose buttons: `Mark Completed/Cancelled`, `Reopen`, `Reassign`. Collapse these into a single **Actions ▾** dropdown that mirrors the active-claim **Advance ▾** pattern.
- Remove the standalone **Reassign** button on closed claims. The reopen flow becomes the only path to reassignment, and reopening now requires picking an appraiser as part of the dialog.

## Data model

New columns on `acv_history`:

```sql
alter table acv_history add column supplement_count integer not null default 0;
alter table acv_history add column is_revision     boolean not null default false;
alter table acv_history add column is_specialty    boolean not null default false;
```

Rollback: `alter table acv_history drop column supplement_count, drop column is_revision, drop column is_specialty;`

Migration files: `supabase/migration-claim-labels.sql` + `supabase/migration-claim-labels-rollback.sql`.

The save helper in `src/lib/supabase/history.ts` already drops optional jsonb fields on 42703 and retries. Extend that fallback to also drop `supplement_count`, `is_revision`, and `is_specialty` so pre-migration production keeps saving.

## Pill rendering

Pills share the existing status-pill styling (`text-xs font-semibold px-2 py-0.5 rounded-full border`) so they align with the `Open` / `Submitted` / `Cancelled` chip and don't change row heights in the common case.

| Pill | Condition | Classes |
|---|---|---|
| `Supp N` (N = `supplement_count`) | `supplement_count >= 1` | `text-amber-800 bg-amber-100 border-amber-300` |
| `Revision` | `is_revision` | `text-black bg-yellow-400 border-yellow-500` (darker yellow, visibly deeper than Supp) |
| `Specialty` | `is_specialty` | `text-indigo-800 bg-indigo-100 border-indigo-300` |

Ordering is fixed left-to-right: **status → Supp → Revision → Specialty**. Multiple can coexist on one claim.

A single shared component `src/components/claim/ClaimLabelPills.tsx` renders the three pills from `{ supplementCount, isRevision, isSpecialty }` so every surface (dashboard table, workspace toolbar, claim search, dashboard tiles) uses the same markup.

### Surfaces that get pills

- **`src/components/claims-table.tsx`** — inside the Status column `<td>`, after the existing Open/Submitted/Cancelled pill. Pills share the column cell so they share the row height. In the rare "all three set" edge case, pills wrap to a second line and bump the row by ~18px.
- **`src/components/claim/ClaimWorkspace.tsx`** — inline next to the MA# / claim# header where the status-phase pill already lives. The toolbar already wraps on narrow widths; it just wraps earlier when pills are present.
- **`src/components/claim-search-button.tsx`** — the search dropdown rows that currently show the status pill.
- **`src/app/dashboard-client.tsx`** — any dashboard tile that renders status alongside identity.

## Reopen API change

`POST /api/claims/[id]/reopen` — currently takes no body and just flips status. New contract:

**Request body:**
```ts
{
  as: 'supplement' | 'revision',
  assignTo: string | null  // user id, or null for Unassigned
}
```

**Server behavior (`src/app/api/claims/[id]/reopen/route.ts`):**

1. Admin + claim-is-closed guards unchanged.
2. Validate `as` is one of the two literals; 400 otherwise.
3. Validate `assignTo` — if non-null, must be an active appraiser visible in the caller's active company and whose claim-type coverage includes this claim's types (reuse `userHandlesClaimTypes` from the existing reassign path). 400 otherwise.
4. Build patch:
   - Common: `status: 'open'`, `submitted_at: null`, `submitted_by: null`, `closed_at: null`, `assigned_to: assignTo`.
   - If `as === 'supplement'`: `supplement_count: <current + 1>`. Read the current value in the fetchClaim call; increment server-side (no race-safe RMW needed given admin-single-click origin).
   - If `as === 'revision'`: `is_revision: true` (idempotent — repeat reopens as revision don't flip anything else, but still re-run the common patch so status/assignment updates land).
   - If `status_phase === 'completed'`: also clear `status_phase` + `status_phase_set_at` (same as today).
5. On 42703 for `supplement_count` / `is_revision` (pre-migration), retry without those fields — reopen still succeeds, labels just aren't recorded until the migration runs.
6. Call `recordStageTransition(service, id, stage, assignTo)` — reuses existing cycle-time ledger logic but with the new assignee.
7. Return `{ ok: true, supplementCount, isRevision, assignedTo }` so the client can update the workspace without a full refetch.

## Reopen UI flow (`ClaimWorkspace.tsx`)

Current closed-claim toolbar block (lines ~4617–4639: `Mark Completed/Cancelled` + `Reopen` + the standalone `Reassign` dropdown at 4640–4691) is replaced with a single **Actions ▾** dropdown modeled on the active-claim **Advance ▾** dropdown (lines ~4512–4615).

Dropdown structure (two-view: main + appraiser submenu, same pattern as the existing `finalizeView: 'main' | 'phases'` state machine):

**Main view:**
```
┌─────────────────────────────┐
│ Reopen as Supplement      ▶ │   → switches to appraiser view with as='supplement'
│ Reopen as Revision        ▶ │   → switches to appraiser view with as='revision'
├─────────────────────────────┤
│ Mark Completed              │   (label flips based on effectiveCloseReason)
│ Delete Claim                │
└─────────────────────────────┘
```

**Appraiser submenu view:**
```
┌─────────────────────────────┐
│ ← Reopen as Supplement      │   (header is clickable; returns to main)
├─────────────────────────────┤
│ — Unassigned —              │
├─────────────────────────────┤
│ Henry Hamou                 │
│ Appraiser Two               │
│ …                           │
└─────────────────────────────┘
```

Appraiser list reuses the filter from the existing reassign dropdown (visible by `isPickerVisible`, active, in workspace, handles claim types) so it stays consistent.

On pick: close the dropdown, open a `ConfirmDialog` with the message *"Reopen as Supplement {N+1} and assign to **{name}**?"* (or "Reopen as Revision and assign to **{name}**?"), confirm button `Reopen`. On confirm, hit the API with the chosen `{as, assignTo}`. On success, apply the returned `supplementCount` / `isRevision` / `assignedTo` to local state so the pills + assignment update without a refetch.

State additions on the component:
- `const [actionsOpen, setActionsOpen] = useState(false)` + `actionsRef` (mirror `finalizeOpen` / `finalizeRef`)
- `const [actionsView, setActionsView] = useState<'main' | 'appraiser'>('main')`
- `const [pendingReopenKind, setPendingReopenKind] = useState<'supplement' | 'revision' | null>(null)` — set when user picks a reopen type, read when the appraiser submenu commits.
- Extend `PendingWorkflow` with the new `{as, assignTo}` payload or add a separate `pendingReopen` dialog state; the existing `handleReopen` function is removed in favor of this submenu-driven flow.

The non-closed reassign dropdown (lines 4640–4691, gated on `isAdmin || (profile?.canReassignClaims && isAssignee)`) is unchanged. The `isClosed` arm of that gate is removed so the standalone Reassign button no longer renders for closed claims.

## Bulk reopen on the dashboard (`claims-table.tsx`)

Today the dashboard bulk-action bar always shows **Reassign to: [select] Confirm** regardless of selection status, plus a conditional **Reopen** button when any selected claim is closed. Reassign is a no-op on closed claims and this has caused confusion.

Changes:

1. **Hide the Reassign dropdown + Confirm button when every selected claim is closed.** Keep it visible for all-open or mixed selections (it still applies to the open ones; closed ones are already skipped server-side).
   - New memo `allSelectedClosed` alongside the existing `selectionHasClosed`.
   - Gate the Reassign block in the toolbar on `!allSelectedClosed`.
2. **Upgrade the bulk Reopen flow** to match the single-claim flow (supplement/revision + reassignment). Replace the plain `ConfirmDialog` with a small purpose-built modal with:
   - Radio pair: `( ) Reopen as Supplement` / `( ) Reopen as Revision` — default Supplement
   - Appraiser select (same filtered list used by Reassign), `— Unassigned —` option at the top
   - Confirm button `Reopen N claims`
3. On confirm, call `POST /api/claims/[id]/reopen` with `{ as, assignTo }` for each selected id in parallel (same shape as the single-claim call). The existing skip-on-"not closed" logic in `runBulkReopen` still applies — mixed selections cleanly skip the already-open ones.
4. Status pills (`Supp N` / `Revision`) show up in the Status column rows on next page refresh (the existing `window.location.reload()` is kept).

Non-change: the Delete, Close, and Actions ▾ buttons are unaffected. The QC-tab Send Back variant is unaffected.

## Specialty toggle (Claim Info tab)

Added as a single chip in a new "Labels" row sitting directly under the Claim Types chip row in Claim Info (same visual language — toggleable chip with the Specialty pill color when active, muted/outlined when inactive). Autosaves through the existing 2s debounce.

Any user who can edit the claim can toggle it (consistent with claimTypes). Admins and the assigned appraiser get the toggle; the read-only lockout rules in `ClaimWorkspace` apply unchanged.

## Save path

`src/lib/supabase/history.ts`:
- `rowToEntry` / `ACVHistoryEntry` get `supplementCount: number`, `isRevision: boolean`, `isSpecialty: boolean` (defaults 0 / false / false for missing columns).
- `colsFull` adds the three columns.
- The write helper's 42703 retry list extends to include the three new fields alongside the existing documents/dv/invoice fallbacks.

`supplement_count` and `is_revision` are **not written from the autosave path** — they only mutate through the reopen API (so the UI doesn't accidentally regress a count). `is_specialty` is autosave-writable since it's a user toggle.

## Edge cases

- **Reopen a claim that's already been reopened:** `supplement_count` keeps incrementing (2 → 3). `is_revision` is idempotent (stays `true`).
- **Reopen then re-close:** labels persist across close/reopen cycles. They describe the claim's history, not its current state.
- **Specialty toggled on a closed claim:** closed claims are read-only for appraisers but editable for admins (per existing `readOnly` rule). Admins can toggle Specialty on closed claims; appraisers can't.
- **All three pills set on a narrow dashboard row:** pills wrap to a second line in the Status column, bumping row height ~18px. Acceptable per Henry.
- **Pre-migration state:** reopen API returns success without touching the new columns; the pill component defaults to zero/false and renders nothing. Save path tolerates missing columns via the existing retry.
- **Delete-claim path from the new dropdown:** reuses the existing `deleteConfirmOpen` dialog unchanged.

## Testing checklist

- `npx tsc --noEmit` + `npm run build` clean.
- Manual: on dev, open a closed claim as admin, pick Reopen as Supplement → appraiser X → confirm. Verify: claim goes to Open Claims with assignee X, `Supp 1` amber pill appears next to Open on the dashboard row and in the workspace toolbar, status column still fits one row.
- Repeat reopen → confirms `Supp 2`.
- Fresh closed claim, Reopen as Revision → confirms Revision pill (darker yellow) appears; a second Revision reopen doesn't duplicate the pill.
- Toggle Specialty on an open claim's Claim Info tab, refresh — pill persists.
- Confirm there is **no Reassign button** on any closed claim.
- Confirm the active-claim Reassign button is unchanged.
- Confirm `Mark Completed` / `Mark Cancelled` and `Delete Claim` still work from inside the new dropdown.

## Files to touch

- `supabase/migration-claim-labels.sql` (new)
- `supabase/migration-claim-labels-rollback.sql` (new)
- `src/lib/supabase/history.ts` — add fields to entry type, select list, retry fallback
- `src/app/api/claims/[id]/reopen/route.ts` — accept `{as, assignTo}`, apply labels, validate assignee
- `src/components/claim/ClaimLabelPills.tsx` (new) — shared pill renderer
- `src/components/claim/ClaimWorkspace.tsx` — replace closed-claim toolbar buttons with Actions ▾ dropdown, remove `isClosed` from standalone Reassign gate, remove `handleReopen`, add submenu + reopen-with-assignment confirm dialog, add Specialty chip to Claim Info
- `src/components/claims-table.tsx` — mount `<ClaimLabelPills />` inside Status column cell; hide Reassign dropdown when all selected are closed; upgrade bulk Reopen to a supplement/revision + assignee modal
- `src/components/claim-search-button.tsx` — mount pills next to the status chip
- `src/app/dashboard-client.tsx` — mount pills on tiles that show status
