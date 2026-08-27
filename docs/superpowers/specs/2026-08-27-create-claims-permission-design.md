# Per-appraiser create-claims permission + Access page cleanup

**Date:** 2026-08-27
**Status:** Design approved, ready for implementation plan

## Context

Today, whether an appraiser can create a new claim is governed by a single
site-wide boolean, `site_settings.allow_regular_create_claims`. When ON, every
appraiser sees the "New Claim" button and can create + fill in a new claim.
When OFF, no appraiser can create anything.

Henry wants finer control: some appraisers should be allowed to create claims,
others should not. He also wants the Access settings page to scale to hundreds
of users without rendering an unwieldy table of everyone.

There is no bug in the current code — the "cross-wiring" Henry reported
(flipping `can_reassign_claims` letting an appraiser fill claim info during
creation) is actually the current design: any appraiser can create + edit new
claim info when the global setting is ON, and `can_reassign_claims` is a
red herring. This spec eliminates that surprise by putting create-claims
behind an explicit per-user grant.

## Non-goals

- No changes to the Automation settings page (`auto_status_requests_override`),
  even though it will hit the same scaling wall. Deferred; ~30 min of follow-up.
- No changes to `can_reassign_claims` or `can_edit_claim_info` behavior.
- No "grandfather actives" migration — default is off for everyone, per
  Henry's explicit choice.
- No bulk-enable UI. Admin flips users on one at a time.
- No new report / "who has permission X" view. Add later if needed.

## Design

### 1. Permission model: master + grant

Two independent boolean controls:

- **Master (site-wide):** `site_settings.allow_regular_create_claims`
  - Already exists. Semantics unchanged: when OFF, no appraiser can create
    regardless of per-user grant. Admins always can.
- **Grant (per-user):** `profiles.can_create_claims` — NEW column, boolean,
  default `false`
  - When the master is ON, this per-user boolean is the actual gate.

Effective rule for a non-admin request to create a claim:

```
create_allowed = allow_regular_create_claims AND profile.can_create_claims
```

Admins bypass both — they can always create.

### 2. Data model change

New migration file: `supabase/migration-can-create-claims.sql`

```sql
-- Adds the per-user grant column.
alter table public.profiles
  add column if not exists can_create_claims boolean not null default false;

-- Replace the acv_history INSERT policy to require the per-user grant
-- for non-admins (on top of the existing master gate).
drop policy if exists acv_insert on public.acv_history;

create policy acv_insert on public.acv_history for insert
  with check (
    (public.is_admin() and user_id = auth.uid())
    or (
      not public.is_admin()
      and coalesce(
        (select (value #>> '{}')::boolean from public.site_settings
         where key = 'allow_regular_create_claims'),
        true
      )
      and exists (
        select 1 from public.profiles
        where id = auth.uid() and can_create_claims = true
      )
      and user_id = auth.uid()
      and (assigned_to is null or assigned_to = auth.uid())
    )
  );
```

Rollback file: `supabase/migration-can-create-claims-rollback.sql` — restores
the previous INSERT policy (from `supabase/migration-roles.sql:131-140`) and
drops the column.

### 3. Enforcement points

Three layers. Each is necessary; the client-side gates are UX, the RLS is
security-of-record.

| Layer | File | Change |
|---|---|---|
| **RLS** (server-of-record) | `supabase/migration-can-create-claims.sql` | INSERT policy checks `can_create_claims = true` for non-admin path (see above). |
| **Client UI — dashboard button** | `src/app/page.tsx:44` | Change `canCreate = isAdmin \|\| allowCreate` to `isAdmin \|\| (allowCreate && profile?.canCreateClaims)`. Button hidden when off. |
| **Client UI — direct URL** | `src/components/claim/ClaimWorkspace.tsx` (new-claim path detection) | On mount, if `isNew && !canCreate`, silently `router.replace('/')`. Prevents someone typing `/claims/new` into the address bar and hitting a partially-broken form. No toast — no toast library installed today, and the redirect is self-explanatory. If we want visible feedback later, we add sonner then. |

Types updates:

- `src/lib/supabase/profiles.ts` — add `canCreateClaims: boolean` to `Profile`
  interface + `can_create_claims` to `ProfileRow` + map in `rowToProfile`.

API updates:

- `src/app/api/admin/users/[id]/route.ts` — accept `canCreateClaims` in the
  PATCH body, forward to `profiles.can_create_claims`.
- No new dedicated create route — creation still flows through the client
  `saveACVHistory` helper. RLS provides the hard gate.

### 4. Access page redesign

`src/app/admin/settings/access/access-client.tsx`, restructured:

```
Global settings
  ┌────────────────────────────────────────────────┐
  │ [ON]  Enable appraiser-created claims          │
  │       Master switch. When off, no appraiser    │
  │       can create claims regardless of below.   │
  └────────────────────────────────────────────────┘

Per-appraiser access
  ┌──────────────────────────────────────────────┐
  │ Select appraiser: [ Search by name…       ▾] │
  └──────────────────────────────────────────────┘

  ─── Bob ────────────────────────────────────────
    [ON]  Can create claims
    [OFF] Can reassign claims
    [ON]  Can edit claim info
```

**Picker:** native HTML `<input>` bound to a `<datalist>` of appraiser
`"Name (email)"` strings, or a lightweight controlled `<input>` + filtered
`<ul>` if we need custom rendering. Matches the existing insurance-company
autocomplete pattern (already used elsewhere in the app), zero new
dependencies, native keyboard nav for free, scales to hundreds of profiles.
Fetches from `fetchAllProfilesBrowser()` (already exists). Decision on
datalist vs. custom deferred to the implementation plan — both fit
the same UX contract.

**Empty state** (no appraiser selected): "Select an appraiser to view or
edit their permissions. N appraisers on this team." N derived from the
fetched profile count.

**Selected state:** three toggles (Create, Reassign, Edit Info), each saves
on click via existing `PATCH /api/admin/users/{id}`.

**Master-off dimming:** when `allow_regular_create_claims = false`, the
Create toggle is visibly dimmed with tooltip: *"Master switch is off — this
permission has no effect until Enable appraiser-created claims is on."*
The toggle is still clickable so admin can pre-configure grants before
enabling the master.

**No visible list of everyone.** The previous three per-permission
sections are deleted.

### 5. Rollout plan

Two-phase because RLS + app code must stay coherent.

1. Write migration + rollback SQL.
2. **Henry runs the migration** in the Supabase SQL editor. At this
   instant, `acv_history` INSERT starts requiring the new column. Since
   the column defaults to `false`, **all appraisers immediately lose
   the ability to create claims** — this is the safe/strict default
   Henry picked.
3. Optionally: before the app deploys, Henry can grant the permission
   to specific appraisers by direct SQL (or wait for the app deploy and
   use the new UI).
4. I deploy the app: new Access page UI, new client-side gate, new
   direct-URL redirect.
5. Verify: log in as an appraiser without the grant → no "New Claim"
   button, direct `/claims/new` redirects to `/`. Log in as an admin →
   works as always.

**Rollback path (if the deploy or migration misbehaves):**

- App-only issue: `npx vercel promote <previous-good-url> --scope
  henry-as-projects-88caed67 --yes` restores the previous deploy. Column
  and RLS stay migrated, but the app renders the previous single-global
  Access page (which will still function correctly — the new column
  isn't referenced by the old code).
- Migration-level issue: run `supabase/migration-can-create-claims-rollback.sql`
  to drop the column and restore the old INSERT policy. Then promote
  previous deploy if needed.

## Files touched

**New:**
- `supabase/migration-can-create-claims.sql`
- `supabase/migration-can-create-claims-rollback.sql`

**Modified:**
- `src/lib/supabase/profiles.ts` — add `canCreateClaims` field
- `src/app/api/admin/users/[id]/route.ts` — accept `canCreateClaims` in PATCH
- `src/app/page.tsx` — client-side gate on New Claim button
- `src/components/claim/ClaimWorkspace.tsx` — direct-URL redirect for
  non-creators
- `src/app/admin/settings/access/access-client.tsx` — full restructure
  (picker + per-user detail panel)

**Deleted:**
- None. The old Access page component is edited in place.

## Verification checklist

Before I claim done:

- [ ] `npx tsc --noEmit` passes
- [ ] `npm run build` passes
- [ ] Manual test: admin logs in → New Claim button visible, creation works
- [ ] Manual test: appraiser (grant OFF) → no New Claim button, `/claims/new`
      URL redirects to `/`
- [ ] Manual test: appraiser (grant ON, master ON) → New Claim button
      visible, creation works
- [ ] Manual test: appraiser (grant ON, master OFF) → no New Claim button,
      RLS blocks any manual insert attempt
- [ ] Manual test: admin flips a user's Create grant in the new picker UI,
      target user reloads, sees the change take effect
- [ ] Rollback SQL verified to restore prior state on a scratch DB (or
      reviewed carefully — no scratch env available)
