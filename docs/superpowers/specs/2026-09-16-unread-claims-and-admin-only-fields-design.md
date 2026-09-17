# Design: Gray-out unread claims + admin-only Handling Appraiser & Client

**Date:** 2026-09-16
**Status:** Approved — proceeding to implementation

## Motivation

Henry asked for three related tweaks on the appraiser experience:

1. When an admin (re)assigns a claim to an appraiser, the appraiser's dashboard should show that row in gray until they open it. Once opened, the gray disappears on next page refresh.
2. Appraisers can currently pick anyone from the Handling Appraiser dropdown. They should not see other appraisers' names — the field should be effectively read-only for them.
3. Same for the Client field — appraisers should not be able to change which client a claim is tied to.

Today the Handling Appraiser select sits in the always-editable top zone of the workspace (above the `<fieldset disabled={locked}>` boundary), so even when a submitted claim's editing is locked, appraisers can change the handling appraiser. This is the hole to close.

## Feature 1: Gray-out unread claims on the appraiser dashboard

### Data model

New migration `supabase/migration-user-claim-views.sql` — table `public.user_claim_views`:

- `user_id uuid` — FK `auth.users(id)`, cascade delete
- `claim_id text` — FK `acv_history(id)`, cascade delete
- `opened_at timestamptz not null default now()`
- Composite primary key `(user_id, claim_id)`

RLS: `select`, `insert`, `update` where `user_id = auth.uid()`. No admin bypass — admins see the same rows anyone else would for their own opens; nobody has cross-user visibility.

### Detection rule

A claim is unread for the current appraiser iff:

```
assigned_to = auth.uid()
AND (no user_claim_views row exists OR assigned_at > opened_at)
```

`assigned_at` already exists on `acv_history` (added by the status-requests migration) and gets bumped by `src/app/api/claims/[id]/assign/route.ts` (line 91) on every reassignment. So a single rule handles both cases: freshly-created claims (no view row exists) and reassignments (assigned_at pushed forward past opened_at).

### Flow

- New `POST /api/claims/[id]/mark-viewed` — upserts `(auth.uid(), claim_id, now())` on `user_claim_views`. Called from `ClaimWorkspace` `useEffect` on mount, gated on `claim.id` existing (i.e., not `/claims/new`) AND `!isAdmin` (admins never see gray, so no point tracking their views). Fire-and-forget; failure is silent (a missed mark is cosmetic only).
- `fetchACVHistory` in `src/lib/supabase/history.ts` gets a second parallel query to pull the current user's `user_claim_views` rows (filtered client-side by `user_id = auth.uid()` via RLS). Rows are merged into each `ACVHistoryEntry` as `openedAt?: string | null`. Also expose `assignedAt?: string | null` on the entry — currently unused but the underlying column is already selected in `colsFull`; just needs mapping in `rowToEntry`.
- `ClaimsTable` computes `isUnread = entry.assignedTo === currentUserId && (!entry.openedAt || (entry.assignedAt && entry.assignedAt > entry.openedAt))`. Applied as `bg-gray-100 hover:bg-gray-200` on the `<tr>`. Only affects appraisers viewing their own assignments — admins/super-admins see no gray highlight (they don't have an assignment-based ownership model here).

## Features 2 & 3: Handling Appraiser and Client read-only for appraisers

### Client-side (`ClaimWorkspace.tsx`)

- **Handling Appraiser select** (currently lines 489–516): when `!isAdmin`, render as a disabled input showing `claim.handlingAppraiser || '—'`. Admins keep the full `<select>` dropdown. This field currently sits in the always-editable top zone above `<fieldset disabled={locked}>`, so today an appraiser can change it even when the rest of the claim is locked — this closes the hole.
- **Client field** (currently lines 568–577): when `!isAdmin`, render `claim.clientName || '—'` inside a disabled input. Admins keep `<ClientPicker>`.

### Server-side guard (`supabase/migration-admin-only-claim-fields.sql`)

Extend the existing `acv_history_appraiser_guard` trigger to also reject:

- `new.client_id is distinct from old.client_id`
- `new.claim->>'handlingAppraiser' is distinct from old.claim->>'handlingAppraiser'`
- `new.claim->>'clientName' is distinct from old.claim->>'clientName'`

Admins and the service role continue to bypass via the existing early returns at the top of the function. This is the security layer — the UI restriction is convenience; the trigger is enforcement.

## Files touched

**New:**
- `supabase/migration-user-claim-views.sql` + `-rollback.sql`
- `supabase/migration-admin-only-claim-fields.sql` + `-rollback.sql`
- `src/app/api/claims/[id]/mark-viewed/route.ts`

**Modified:**
- `src/lib/supabase/history.ts` — extend `fetchACVHistory` + `ACVHistoryEntry` with `openedAt` + `assignedAt`
- `src/components/claims-table.tsx` — unread row styling
- `src/components/claim/ClaimWorkspace.tsx` — mark-viewed effect + admin-gate the two fields

## Rollback strategy

Two independent migrations, two independent rollbacks. Client code tolerates either migration not being run:

- If `user_claim_views` doesn't exist yet, `fetchACVHistory` catches 42P01 and returns claims without `openedAt`; nothing renders gray. `mark-viewed` returns 500, client ignores silently.
- If the admin-only trigger extensions haven't run, appraisers can still bypass via direct API (the UI already restricts). No data corruption possible — the fields are just less protected until the trigger migration runs.

## What I'm intentionally NOT building (YAGNI)

- No "mark as unread" toggle. Once opened, opened.
- No bulk "mark all read" action.
- No unread counter in the header/nav. Row shading suffices per the ask.
- No cross-feature admin panel. Existing admin-only routing already handles the visibility split.
- No backfill of `user_claim_views` for existing claims. Everything pre-migration will show as unread on first dashboard load, which is fine — a single click clears it.

## Verification

- `npx tsc --noEmit` clean
- `npm run build` clean
- Post-deploy smoke test (Henry): assign a claim to an appraiser account → dashboard shows it gray → open the claim → refresh dashboard → gray gone. Log in as appraiser → Handling Appraiser field is a disabled input, not a dropdown → Client field same → check developer network tab that a direct PATCH attempting to change either is rejected 42501-style by the trigger.
