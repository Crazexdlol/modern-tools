# Rough Numbers Workflow — Design Spec

**Date:** 2026-10-13
**Author:** Henry (brainstorm) + Claude
**Status:** Spec — pending user review before plan.

## Problem

Some clients (e.g., attorney referrals) want **rough ACV numbers** before committing to a full appraisal engagement. The report appraiser does the ACV, drops the rough numbers in Messages, and the claim gets sent to the client for a go / no-go. Then:

- **No-go:** claim is canceled.
- **Go, no negotiation:** admin uploads the final report, bills, delivers.
- **Go, negotiation:** admin reassigns to an appraiser to negotiate with the IA; often **months** after the rough number went out.

Today, when the report appraiser hits Submit, the claim is dumped into the **QC** tab. QC is a cycle-time-tracked review step for claims that are actually finished — but a rough-numbers claim isn't finished. It's parked, waiting on the client. The result: QC's inbox is a mix of real review work and "already sent to client, just waiting," and QC's cycle time is polluted by claims that aren't actually under review.

Other clients (e.g., Sedgwick) have no rough-numbers step — Submit should go straight to QC as today.

## Goals

1. Give rough-numbers claims a clean parked state that **does not sit in QC** and **does not count toward QC cycle time**.
2. Make the rough-numbers path opt-in on a **per-claim basis**, with a **per-client default** on top of a global default of "off."
3. One Submit button for appraisers. No two-option picker. The system picks the destination based on claim state.
4. Keep today's Submit → QC behavior unchanged for every claim that doesn't opt in.
5. The `handlingAppraiser` field on a claim is informational metadata and should NOT drive routing in the new flow. Rename it to `negotiatingAppraiser` for clarity.

## Non-Goals

- No changes to the existing `/complete-report` route or its data model. It stays functional for callers who still use it (same-sprint, immediate same-day handoff flow). Rough-numbers claims will not use it — they use plain Submit + admin reassignment.
- No separate "Awaiting Client" dashboard tab. The parked claim lives in Wendy's "Assigned to me" list, identified by its Rough Numbers status phase chip. If Henry wants a tab later, that's additive.
- No two-flavor Submit button. The claim's state drives the routing, not the user's choice at click time.
- No bulk workflow for rough-numbers (one claim at a time, as today).

## User Flow

### Setup (one-time)

1. Admin opens Admin → Settings → Site Settings (or a new "Workflow" section — see UI section).
2. Admin picks "Wendy Castro" from the **Rough Numbers inbox owner** dropdown. Any admin profile is selectable.
3. For any client that should default rough-numbers = Yes, admin edits the client in the Marketing/Clients section and flips **Default to rough numbers for new claims** on. For every other client it stays off.

### New claim creation (rough-numbers = No, today's behavior)

1. Appraiser creates a new claim. The "Needs rough numbers?" toggle is **off** (either because the client's default is off, or no client picked yet).
2. Appraiser works the claim, hits Submit.
3. Standard behavior: `submitted_at` set, `workflow_stage = 'qc'`, `assigned_to = null`, claim lands in QC. No change from today.

### New claim creation (rough-numbers = Yes)

1. Appraiser creates a new claim for a client with rough-numbers default = Yes. The "Needs rough numbers?" toggle is **on** by default. (Appraiser can flip it off if the specific claim shouldn't take the rough path, or on if the client default is no.)
2. Appraiser is assigned, does the ACV, posts rough numbers in Messages.
3. Appraiser hits Submit. System sees `needs_rough_numbers = true` AND `rough_numbers_handoff_at IS NULL`:
   - Sets `rough_numbers_handoff_at = now`
   - Applies status phase `rough_numbers` (which has `pauses_cycle_time = true`)
   - Reassigns `assigned_to = <inbox owner id>` (Wendy)
   - Does **NOT** set `submitted_at`
   - Does **NOT** advance `workflow_stage` (stays in `main`)
   - Records a stage-event transition: `main` under new assignee (Wendy). The first appraiser's Main span closes; Wendy's opens. Because the phase pauses cycle time, Wendy's span contributes zero to her cycle-time aggregate.
   - Notifies the inbox owner via existing claim-notifications pipeline ("rough-numbers claim handed off to you").
4. Claim is now parked. Wendy sees it in her "Assigned to me" list with a "Rough Numbers" phase chip.

### Client responds (Wendy acts)

**Path A — Client declines.** Wendy closes the claim via the existing close-claim flow. No special handling needed.

**Path B — Client approves, no negotiation needed.** Wendy clears the Rough Numbers phase and hits Submit herself. Submit sees `rough_numbers_handoff_at` is already set → falls into today's branch → `submitted_at` set, `workflow_stage = 'qc'`, `assigned_to = null`, lands in QC.

**Path C — Client approves, negotiate.** Wendy clears the Rough Numbers phase, uses the existing Reassign dropdown to pick an appraiser (any appraiser — not driven by the `negotiatingAppraiser` field on the claim). That appraiser works it, hits Submit. Same as Path B: Submit sees handoff already done → QC.

### Appraiser side after reassignment

The appraiser receives a normal assignment notification. The claim is in Main stage, assigned to them, no special UI needed. They work it like any other claim, hit Submit when done. Goes to QC.

## Data Model

### `acv_history` additions

```sql
ALTER TABLE acv_history
  ADD COLUMN needs_rough_numbers boolean NOT NULL DEFAULT false,
  ADD COLUMN rough_numbers_handoff_at timestamptz NULL;
```

- `needs_rough_numbers` — set at claim creation from the toggle. Immutable after creation (changing mid-claim doesn't make sense — if the appraiser wants to opt out, they just don't act on it; if they want to opt in late, admin can set the phase manually).
- `rough_numbers_handoff_at` — one-shot marker. NULL means the rough handoff has not happened yet. Set the first time Submit fires on a `needs_rough_numbers=true` claim. Subsequent Submits see it populated and route to QC normally.

### `clients` additions

```sql
ALTER TABLE clients
  ADD COLUMN rough_numbers_default boolean NOT NULL DEFAULT false;
```

- `rough_numbers_default` — the per-client default for the toggle. Admin flips it per-client in the client edit UI. New claims pick up this default when the client is selected on the create form. If no client is picked, the toggle defaults to the global default (false).

### `status_phase_configs` seed

Seed one row (idempotent SQL — only insert if code doesn't already exist):

```sql
INSERT INTO status_phase_configs (code, label, color, sort_order, archived, pauses_cycle_time)
VALUES ('rough_numbers', 'Rough Numbers', 'blue', 50, false, true)
ON CONFLICT (code) DO NOTHING;
```

Color and sort order are starting values — admin can edit them in the Status Phases page. The important invariant is `pauses_cycle_time = true`.

### Site settings — rough-numbers inbox owner

Added as a new field in whatever table currently holds Site Settings (either a `site_settings` row keyed on company_id, or a new column there — the plan step will pin the exact location):

```sql
-- Pseudocode; exact table/schema confirmed in the plan.
rough_numbers_inbox_owner_id uuid NULL REFERENCES profiles(id)
```

Per-company. Set via Admin → Settings UI. If unset, Submit on a rough-numbers claim throws `"Rough Numbers inbox owner is not configured. Set one in Admin → Settings before using rough numbers."` — explicit error, no fallback guess.

### Rename: `handlingAppraiser` → `negotiatingAppraiser`

The `handlingAppraiser` field lives in the jsonb `acv_history.claim` column, not a dedicated SQL column. Migration:

```sql
UPDATE acv_history
SET claim = (claim - 'handlingAppraiser')
         || jsonb_build_object('negotiatingAppraiser', claim->'handlingAppraiser')
WHERE claim ? 'handlingAppraiser';
```

Code-side rename affects:
- `ClaimInfo.handlingAppraiser` → `negotiatingAppraiser` (`src/lib/acv/types.ts`)
- Every UI label reading "Handling Appraiser" → "Negotiating Appraiser"
- `/api/claims/[id]/complete-report/route.ts` — reads `claim.negotiatingAppraiser`; error strings mention "Negotiating Appraiser"
- `src/lib/acv/claim-field-mapping.ts` — the mapping key renamed, but the **PDF label strings** on the input side stay unchanged (assignment-sheet PDFs still say "Handling Appraiser" — that's the parser's input, not our data model)
- Parsers in `src/lib/acv/parsers/*.ts` — populate `negotiatingAppraiser` on `ParsedClaim`, keep reading the same PDF label
- `ParsedClaim` type (`src/lib/acv/parsers/types.ts`) — field renamed
- `ClaimWorkspace.tsx` — the handler that applies parsed values uses the new field name
- Documentation in CLAUDE.md and SESSIONS.md — new entries use the new name; historical entries not rewritten.

## API Changes

### `POST /api/claims/[id]/submit` — add rough-numbers branch

At the top of the handler, after permission checks and before the standard submit update, add:

```ts
if (claim.needsRoughNumbers && !claim.roughNumbersHandoffAt) {
  const ownerId = await getRoughNumbersInboxOwner(companyId)
  if (!ownerId) {
    return NextResponse.json(
      { error: 'Rough Numbers inbox owner is not configured. Set one in Admin → Settings before using rough numbers.' },
      { status: 400 }
    )
  }

  const now = new Date().toISOString()
  const { error } = await service.from('acv_history').update({
    rough_numbers_handoff_at: now,
    status_phase: 'rough_numbers',
    status_phase_set_at: now,
    assigned_to: ownerId,
    assigned_at: now,
    last_status_request_at: null,
  }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Cycle-time ledger: close the appraiser's main span, open Wendy's.
  // The phase pauses cycle time, so Wendy's span contributes zero to her
  // aggregate — but we still open the span so the ledger stays consistent.
  await recordStageTransition(service, id, 'main', ownerId)

  // Notify the inbox owner. Reuse existing notification pipeline.
  await notifyRoughNumbersHandoff({ claimId: id, inboxOwnerId: ownerId, submitterId: caller!.userId })

  return NextResponse.json({ ok: true, roughNumbersHandoff: true })
}

// else: today's behavior (submitted_at, workflow_stage='qc', assigned_to=null, etc.)
```

The `else` branch is the current submit code unchanged.

### `POST /api/claims` (claim creation) — accept the flag

The new-claim payload accepts `needsRoughNumbers?: boolean`. If omitted, the default from the picked client's `rough_numbers_default` is used (if a client is picked), else `false`.

### Client UPSERT routes — accept `roughNumbersDefault`

The client-edit API accepts and persists the new flag.

### `/complete-report` — no functional change

The route is unchanged. It reads `claim.negotiatingAppraiser` (renamed field) instead of `handlingAppraiser`. Error strings updated. Behavior otherwise identical.

### Notifications

Add one new notification type: **"Rough-numbers claim handed off to you."** Reuses the existing claim-notifications pipeline (same email template structure as "assigned to you"). Sent only to the inbox owner.

## UI Changes

### New-claim form

- Add a "Needs rough numbers?" toggle (shadcn Switch, matching existing form patterns) in the Claim Info step.
- Default value: `pickedClient?.roughNumbersDefault ?? false`. Updates when the appraiser changes the picked client.
- Label + helper text: `"Needs rough numbers? — When on, the first submit hands this claim to the Rough Numbers inbox (currently Wendy Castro) and pauses cycle time until it's reassigned."`

### Claim workspace

- When `needsRoughNumbers = true`, show a small blue "Rough Numbers" pill in the claim header near the status phase chip. (The phase chip will also appear once the handoff happens — the pill shows the claim's **mode**, the chip shows the current **phase**.)

### Admin Settings → Workflow (or Site Settings)

- Add a "Rough Numbers inbox owner" dropdown. Options: every profile with role=admin. Default: unselected until the admin picks one. Save behavior matches existing site-settings save.

### Clients (Marketing section)

- In the client edit UI, add a "Default to rough numbers for new claims" toggle. Persists `rough_numbers_default`. Help text: `"When on, new claims for this client will have the Needs rough numbers toggle on by default. Can still be flipped per-claim."`

### Dashboard (Wendy's view)

- No new tab. Wendy sees rough-numbers claims in her existing "Assigned to me" list.
- The claims-table row renders the "Rough Numbers" status phase chip so Wendy can scan which assigned claims are rough-numbers.
- Optional (plan step decision): a count badge on the dashboard header: "Rough Numbers: N" filtering `status_phase = 'rough_numbers'`. Not strictly needed — the phase chip already distinguishes them.

### Rename sweep

Find-and-replace user-visible "Handling Appraiser" → "Negotiating Appraiser" across the UI. Code identifiers (variables, props, type fields) rename to match. Approximate scope from grep: ~15–25 files. One-pass, no feature-flagging.

## Cycle-Time Behavior

- **Report appraiser's Main span:** opened at assignment, closed at Submit #1. Cycle time credited to them cleanly as "time spent doing the report."
- **Wendy's Main span (parked):** opened at Submit #1 (handoff). The `rough_numbers` phase has `pauses_cycle_time=true`, so this span contributes zero to Wendy's cycle-time aggregate until the phase is lifted.
- **Negotiating appraiser's Main span (if any):** opened at reassignment (phase lifted, new assignee). Cycle time counts normally.
- **QC span:** opened at Submit #2 (whoever hits it). Same as today.

Net effect: cycle times for Main stage reflect **active work time only**, not the "sitting on client's desk" months. QC cycle time is untainted.

## Edge Cases

1. **Appraiser is also the inbox owner.** Edge case: Wendy herself does the initial ACV on a rough-numbers claim. First Submit would reassign the claim to Wendy (already assigned to Wendy, so no-op) and apply the phase. Fine behavior — no error, no weirdness.

2. **Rough-numbers inbox owner changes mid-claim.** Admin changes the setting while a parked claim is still with Wendy. The parked claim stays with Wendy (we don't re-route in-flight claims). New rough-numbers claims from that point go to the new owner.

3. **Claim creator forgets to toggle on for a client that normally defaults off.** Appraiser works it, submits → goes to QC as a non-rough claim. Nothing broken, just the wrong path. Mitigation: the toggle is prominent on the create form, and the client default is auto-applied. Appraisers only need to **override** the default, not pick fresh each time.

4. **Admin flips rough-numbers from off to on after the claim is submitted.** Blocked — `needs_rough_numbers` is set at creation and not editable after. If the admin genuinely wants to park a submitted claim as "awaiting client," they can manually apply the Rough Numbers phase and reassign to Wendy via existing tools. That's a one-off escape hatch, not a formal path.

5. **Rough-numbers claim gets sent back from QC (second submit path).** Standard send-back behavior applies. The claim re-enters Main with the sending-back QC reviewer's chosen assignee. Nothing rough-numbers-specific here — the handoff has already happened; this is a normal post-QC flow.

6. **Two rough-numbers claims for the same client, inbox owner is on vacation.** Both claims pile up in Wendy's inbox. There's no auto-reassign-after-N-days. If this becomes a problem, add it later; not scoped here.

## Testing

Manual QA script after implementation:

1. Create a non-rough claim (toggle off). Submit → lands in QC. Confirm QC cycle time starts.
2. Create a rough claim (toggle on). Submit → does NOT appear in QC. Confirm it appears in Wendy's assigned list with the Rough Numbers phase chip. Confirm `rough_numbers_handoff_at` is set, `submitted_at` is null, `workflow_stage` is still `main`.
3. From Wendy's seat, hit Submit without clearing the phase — behavior should match whatever is decided in the "Should the submit route enforce the phase is cleared?" open question below. Current proposal: Submit works regardless of phase; Wendy is expected to clear it as part of her workflow, but the system doesn't enforce.
4. From Wendy's seat, clear the phase, hit Submit yourself. Confirm it lands in QC and QC cycle time starts fresh.
5. From Wendy's seat, clear the phase, reassign to another appraiser. That appraiser hits Submit. Confirm it lands in QC.
6. Confirm cycle-time report shows zero time charged to Wendy for the parked period.
7. Confirm the Negotiating Appraiser rename is complete — no stray "Handling Appraiser" labels in the UI.

Automated tests are out of scope for this project (no test harness configured per CLAUDE.md).

## Deploy Plan

- Migration SQL in `supabase/migration-rough-numbers.sql` (idempotent — guards against re-run).
- Migration-rollback SQL in `supabase/migration-rough-numbers-rollback.sql`.
- Henry runs the migration manually in Supabase SQL Editor (per CLAUDE.md).
- 42703 fallback in the submit route for pre-migration state: if the column doesn't exist, submit routes to QC regardless of the new flag — i.e., behave as if `needs_rough_numbers = false` until the column exists. Same pattern as the existing `documents` / `dv` / `invoice` jsonb columns.
- Standard pre-flight / rollback dance in `vercel inspect` → capture rollback id → deploy → verify.

## Open Questions (resolved by brainstorm)

- **Who is the inbox owner?** Configurable admin profile per company. Default Wendy Castro.
- **Does the negotiating appraiser label on the claim auto-route?** No. Metadata only.
- **One Submit button or two?** One. State drives the destination.
- **Per-client default?** Yes — new `clients.rough_numbers_default` column.
- **Report-only path (no negotiation)?** Wendy clears phase and submits herself → QC.

## Open Questions (for the plan step)

- Where does the "Rough Numbers inbox owner" setting live in the admin UI — Site Settings, a new Workflow section, or the Status Phases page?
- Should the submit route **enforce** that the Rough Numbers phase is cleared before the second submit, or just assume the admin workflow? (Current proposal: don't enforce. Plan can revisit.)
- Should there be a dashboard-level badge/count for parked rough-numbers claims, or is the "Assigned to me + phase chip" view enough?

These are UI/UX refinements that don't block the data model or routing design.
