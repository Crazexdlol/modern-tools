# Per-client rate card — design

**Date:** 2026-10-26
**Status:** Design approved; implementation plan pending
**Scope:** v1 adds the data model + admin editing UI only. No invoice-side consumption.

## Problem

HamsPortal's invoice tab is 100% manual — line items (quantity / description / total) are typed from scratch every time, with nothing pulled from the client's negotiated rates. Henry has different pricing with every client (ACV at $250 for one, $300 for another; some clients add $150 for RTA, others $400; Carfax/window-sticker surcharges applied inconsistently). Today those rates live in his head.

We need a per-client rate card so each client's negotiated prices are stored once and visible when billing. v1 persists and edits the rates; a future session will wire them into the invoice workflow.

## Goals

- Each client has an editable rate card for assignment types + add-ons + time.
- Rates can be left blank; blank means "no rate set" (consumer will treat as "don't suggest").
- Editing happens inside the existing clients admin modal, not a new page.
- Zero changes to invoice generation, PDF filling, or any downstream consumer in v1.
- Deploy-before-migration is safe (per CLAUDE.md HARD RULE).

## Non-goals (v1)

- Invoice auto-population from the rate card.
- "Apply client rate card" button in the Invoice tab.
- Suggestion panel in the Invoice tab.
- System-wide default rate card (Henry's call: prices vary too much across clients to default).
- Per-contact rate overrides.
- Historical rate versioning (rate changes overwrite in place).
- Appraiser-cost side of the ledger — `fee_catalog` / `appraiser_fees` are unrelated and untouched.

## Data model

### New column

```sql
alter table public.clients
  add column rate_card jsonb null;
```

Nullable, no default, no backfill. Pre-migration tolerance: `rowToClient` defaults a missing column to `null`; `updateClient` catches 42703 and retries without the key.

### Shape

```ts
interface ClientRateCard {
  primary: {
    acv:      { bare: number | null; withRta: number | null }
    dv:       { bare: number | null; withRta: number | null }
    estimate: { bare: number | null; withRta: number | null }
    storage:  { bare: number | null; withRta: number | null }
  }
  addOns: {
    desk: number | null
    lou: number | null
    full: number | null
    salvage: number | null
    specialty: number | null
    other: number | null
    umpire: number | null
    carfax: number | null
    windowSticker: number | null
    rush: number | null
    cancellation: number | null
  }
  time: {
    hourly: number | null
    mileage: number | null
  }
}
```

- All amounts are decimal dollars (e.g. `0.70` for mileage, `250` for ACV).
- `null` everywhere means "no rate set." Consumers must distinguish `null` from `0`.
- No RTA-standalone slot — RTA only modifies the four primary types (per Henry's billing model).
- `storage` is a primary (its own `bare` + `withRta`), not an add-on.
- Umpire is a plain per-client add-on; it carries no gating logic.

### Normalization helper

A `defaultRateCard()` helper returns an all-null shell with every key present. Readers run every row through this to tolerate missing keys on legacy rows and future schema additions.

## Admin UI

### Current state

`src/app/admin/settings/clients/clients-admin-client.tsx` — the modal (`ClientDetailPanel`) is one flat form: edit fields → contacts list → save. No tabs.

### Change

Introduce a two-tab layout inside `ClientDetailPanel`:

```
┌────────────────────────────────────────────┐
│ Sedgwick                              [X]  │
│ TPA · Archived                             │
├────────────────────────────────────────────┤
│ [ Details ]  [ Rates ]                     │
├────────────────────────────────────────────┤
│  (tab body)                                │
└────────────────────────────────────────────┘
```

- **Details tab** — exact current content (edit form + Save Changes + Archive button + Contacts section). No visual drift.
- **Rates tab** — new; see below.

Tab state is local to the modal (no URL sync, no persistence).

### Rates tab body

Three stacked sections, each a card-styled table consistent with the HARD-RULE styling (`bg-white border-gray-200 shadow-sm`, uppercase-xs section labels, blue primary action):

#### Section 1 — Primary assignment rates

Table, 3 columns (Type / Bare / With RTA), 4 rows:

| Type         | Bare    | With RTA |
|--------------|---------|----------|
| ACV          | $______ | $______  |
| DV           | $______ | $______  |
| Est Dispute  | $______ | $______  |
| Storage      | $______ | $______  |

Each cell is a decimal input (`type="number" step="0.01"`). Blank = null.

#### Section 2 — Add-on rates

Table, 2 columns (Service / Flat rate), 11 rows in this order:

Desk · LOU · FULL · Salvage · Specialty · Other · Umpire · Carfax · Window Sticker · Rush · Cancellation.

Decimal input per row. Blank = null.

#### Section 3 — Time rates

Table, 2 columns (Rate / Amount), 2 rows:

| Rate     | Amount        |
|----------|---------------|
| Hourly   | $______ /hr   |
| Mileage  | $______ /mile |

Decimal input. Blank = null.

### Save model

- Each tab holds its own dirty state and its own **Save Changes** button at the bottom-right of that tab's body.
- Rates tab's Save button only saves `rateCard`; Details tab's Save button only saves the Details fields (unchanged from today).
- Switching tabs while the current tab has unsaved changes shows `confirmDialog({ title: 'Discard unsaved changes?', ... })` (per the no-native-dialog HARD RULE).
- Values are coerced from string to `number | null` at save time; empty string → null.
- Submit path reuses `updateClient()` from `src/lib/supabase/clients.ts`, extended to carry a `rateCard` field on `ClientUpdate`.

## Code changes

### `src/lib/supabase/clients.ts`

- Add `rateCard: ClientRateCard | null` to the `Client` interface.
- Add `rate_card: ClientRateCardRow | null` to `ClientRow` (typed as `unknown` or a mirror interface).
- `rowToClient` reads `r.rate_card` through `normalizeRateCard()` → always returns a complete shell with `null` leaves on missing keys.
- `updateClient` maps `patch.rateCard` → `dbPatch.rate_card`, and adds `'rate_card'` to the 42703 strip-and-retry list.
- Export `defaultRateCard()` and `normalizeRateCard()` for the UI.

New file `src/lib/supabase/rate-card.ts` keeps the shape definitions, defaults, and normalization in isolation so `clients.ts` doesn't balloon:

```ts
export interface ClientRateCard { … }
export function defaultRateCard(): ClientRateCard { … }
export function normalizeRateCard(raw: unknown): ClientRateCard { … }
```

### `src/app/admin/settings/clients/clients-admin-client.tsx`

- Factor the current `ClientDetailPanel` body (header + edit form + contacts) into a `ClientDetailsTab` sub-component.
- Add a `ClientRatesTab` sub-component that renders the three sections, holds local state, computes dirty, and calls `updateClient({ rateCard })`.
- Add a tab strip inside `ClientDetailPanel` that switches between the two.
- Keep the close button + archived-badge header above the tab strip (one modal header, not per-tab).

### `supabase/migration-client-rate-card.sql`

```sql
-- Adds a nullable jsonb column for per-client billing rates.
-- Pre-migration safe: readers default missing column to null.
alter table public.clients
  add column if not exists rate_card jsonb null;

comment on column public.clients.rate_card is
  'Per-client billing rates (primary assignment types, add-ons, time). '
  'Null leaves mean "no rate set"; consumers must distinguish null from 0.';
```

### `supabase/migration-client-rate-card-rollback.sql`

```sql
alter table public.clients drop column if exists rate_card;
```

## Deploy sequence

Standard HamsPortal flow:

1. Build and ship the code (code tolerates missing column via 42703 fallback).
2. Henry runs the migration in Supabase SQL editor when he's ready.
3. From that point forward, saves on the Rates tab land in `rate_card`.

No pre-migration state can brick admin UI: `rowToClient` defaults the column to null; `updateClient` strips `rate_card` from the payload if the column isn't there. Admin can keep editing every other client field in the meantime.

## Verification

- `npx tsc --noEmit` clean.
- `npm run build` clean.
- Open an existing client in the admin modal: Details tab renders identically to today.
- Switch to Rates tab: all 20 inputs render blank for a fresh client.
- Enter values in a mix of fields; Save; close + reopen the modal; confirm every value round-trips.
- Clear a previously-set value, Save; confirm it round-trips as `null` (not `0`, not `""`).
- With migration NOT yet applied: deploy the code, open the admin modal, confirm Details tab still works; confirm the Rates tab renders but saving a rate shows a graceful "needs migration" state (or silently falls back — TBD in the implementation plan). Then run the migration and confirm Rates saves start persisting with no code redeploy.
- Save a rate on client A; open client B; confirm client B's rates are independent (no bleed).

## Open questions deferred to implementation

- Exact pre-migration UX when the user tries to save on the Rates tab (silent-strip vs. inline warning). Implementation plan picks one.
- Whether to disable the Rates tab for archived clients (default: allow editing, consistent with Details tab behavior).
