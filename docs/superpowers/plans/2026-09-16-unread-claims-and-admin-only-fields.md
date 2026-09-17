# Unread claims + admin-only Handling Appraiser & Client — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three appraiser-experience improvements: (a) newly-assigned/reassigned claims show gray on the appraiser's dashboard until opened; (b) the Handling Appraiser dropdown is admin-only; (c) the Client picker is admin-only.

**Architecture:** New `user_claim_views` table stores per-user open timestamps; dashboard compares each row's `assigned_at` vs. the current user's `opened_at` to derive `isUnread`. `ClaimWorkspace` fires a fire-and-forget `mark-viewed` POST on mount (appraisers only). The existing `acv_history_appraiser_guard` trigger is extended to reject appraiser writes to `client_id`, `claim->>'handlingAppraiser'`, and `claim->>'clientName'`; matching UI code hides the pickers for non-admins.

**Tech Stack:** Next.js 16, React 19, TypeScript 5, Supabase (Postgres + RLS + triggers), Tailwind v4. No test framework configured in this repo — verification is `npx tsc --noEmit` + `npm run build` + manual smoke test post-deploy.

**Spec:** `docs/superpowers/specs/2026-09-16-unread-claims-and-admin-only-fields-design.md`

---

## File map

**New files (5):**
- `supabase/migration-user-claim-views.sql`
- `supabase/migration-user-claim-views-rollback.sql`
- `supabase/migration-admin-only-claim-fields.sql`
- `supabase/migration-admin-only-claim-fields-rollback.sql`
- `src/app/api/claims/[id]/mark-viewed/route.ts`

**Modified files (3):**
- `src/lib/supabase/history.ts` — add `openedAt` + `assignedAt` to `ACVHistoryEntry`, extend `fetchACVHistory` to join user_claim_views
- `src/components/claims-table.tsx` — apply `bg-gray-100` styling to unread rows for appraisers
- `src/components/claim/ClaimWorkspace.tsx` — mark-viewed effect + swap Handling Appraiser select + Client picker to read-only when `!isAdmin`

---

## Task 1: Write the `user_claim_views` migration + rollback

**Files:**
- Create: `supabase/migration-user-claim-views.sql`
- Create: `supabase/migration-user-claim-views-rollback.sql`

- [ ] **Step 1: Write the migration SQL**

File `supabase/migration-user-claim-views.sql`:

```sql
-- Per-user per-claim "last opened" timestamp.
-- Used by the appraiser dashboard to show a gray highlight on claims that
-- have been (re)assigned to the current user but not yet opened.
-- Detection rule: assigned_to = auth.uid() AND (no row OR assigned_at > opened_at).

create table if not exists public.user_claim_views (
  user_id   uuid        not null references auth.users(id)     on delete cascade,
  claim_id  text        not null references public.acv_history(id) on delete cascade,
  opened_at timestamptz not null default now(),
  primary key (user_id, claim_id)
);

alter table public.user_claim_views enable row level security;

drop policy if exists user_claim_views_select on public.user_claim_views;
create policy user_claim_views_select on public.user_claim_views
  for select using (user_id = auth.uid());

drop policy if exists user_claim_views_insert on public.user_claim_views;
create policy user_claim_views_insert on public.user_claim_views
  for insert with check (user_id = auth.uid());

drop policy if exists user_claim_views_update on public.user_claim_views;
create policy user_claim_views_update on public.user_claim_views
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Verification: expect 1, 1, 3 (table exists, RLS on, three policies).
select count(*) from information_schema.tables where table_schema='public' and table_name='user_claim_views';
select relrowsecurity::int from pg_class where oid = 'public.user_claim_views'::regclass;
select count(*) from pg_policies where schemaname='public' and tablename='user_claim_views';
```

File `supabase/migration-user-claim-views-rollback.sql`:

```sql
-- Rollback for migration-user-claim-views.sql.
drop table if exists public.user_claim_views cascade;
```

- [ ] **Step 2: Ask Henry to run in Supabase SQL Editor**

Message to Henry:

> Paste `supabase/migration-user-claim-views.sql` into the Supabase SQL editor and run it. Expected verification output at the bottom: `1`, `1`, `3` (table, RLS on, 3 policies). Reply with the numbers or any errors.

Wait for confirmation before proceeding to Task 2.

- [ ] **Step 3: Commit both files**

```bash
git add supabase/migration-user-claim-views.sql supabase/migration-user-claim-views-rollback.sql
git commit -m "migration: user_claim_views for unread-claim tracking"
```

---

## Task 2: Write the admin-only trigger extension migration + rollback

**Files:**
- Create: `supabase/migration-admin-only-claim-fields.sql`
- Create: `supabase/migration-admin-only-claim-fields-rollback.sql`

- [ ] **Step 1: Write the migration SQL**

File `supabase/migration-admin-only-claim-fields.sql`:

```sql
-- Extend acv_history_appraiser_guard to also reject appraiser writes to:
--   - client_id (top-level column)
--   - claim->>'handlingAppraiser'  (nested in the claim jsonb)
--   - claim->>'clientName'         (nested in the claim jsonb)
--
-- Admins and service role continue to bypass via the existing early returns
-- at the top of the function.

create or replace function public.acv_history_appraiser_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'service_role' then return new; end if;
  if public.is_admin() then return new; end if;

  -- Existing guards.
  if new.assigned_to  is distinct from old.assigned_to  then raise exception 'not allowed to change assigned_to';  end if;
  if new.status       is distinct from old.status       then raise exception 'not allowed to change status';       end if;
  if new.submitted_at is distinct from old.submitted_at then raise exception 'not allowed to change submitted_at'; end if;
  if new.submitted_by is distinct from old.submitted_by then raise exception 'not allowed to change submitted_by'; end if;
  if new.user_id      is distinct from old.user_id      then raise exception 'not allowed to change user_id';      end if;

  -- New guards: Handling Appraiser and Client are admin-only.
  if new.client_id is distinct from old.client_id then
    raise exception 'not allowed to change client_id';
  end if;
  if new.claim->>'handlingAppraiser' is distinct from old.claim->>'handlingAppraiser' then
    raise exception 'not allowed to change handlingAppraiser';
  end if;
  if new.claim->>'clientName' is distinct from old.claim->>'clientName' then
    raise exception 'not allowed to change clientName';
  end if;

  return new;
end;
$$;

-- Verification: function replaced, trigger still present.
select proname from pg_proc where proname = 'acv_history_appraiser_guard';
select tgname from pg_trigger where tgname = 'acv_history_appraiser_guard';
```

File `supabase/migration-admin-only-claim-fields-rollback.sql`:

```sql
-- Rollback: restore the pre-2026-09-16 version of the guard function
-- (five guards, no client_id / handlingAppraiser / clientName checks).
create or replace function public.acv_history_appraiser_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'service_role' then return new; end if;
  if public.is_admin() then return new; end if;
  if new.assigned_to  is distinct from old.assigned_to  then raise exception 'not allowed to change assigned_to';  end if;
  if new.status       is distinct from old.status       then raise exception 'not allowed to change status';       end if;
  if new.submitted_at is distinct from old.submitted_at then raise exception 'not allowed to change submitted_at'; end if;
  if new.submitted_by is distinct from old.submitted_by then raise exception 'not allowed to change submitted_by'; end if;
  if new.user_id      is distinct from old.user_id      then raise exception 'not allowed to change user_id';      end if;
  return new;
end;
$$;
```

- [ ] **Step 2: Ask Henry to run in Supabase SQL Editor**

Message to Henry:

> Paste `supabase/migration-admin-only-claim-fields.sql` into the Supabase SQL editor and run it. Expected verification output: `acv_history_appraiser_guard` in both selects. Reply with the output or any errors.

Wait for confirmation before proceeding to Task 3.

- [ ] **Step 3: Commit both files**

```bash
git add supabase/migration-admin-only-claim-fields.sql supabase/migration-admin-only-claim-fields-rollback.sql
git commit -m "migration: extend appraiser guard to lock client + handling appraiser"
```

---

## Task 3: Add `mark-viewed` API route

**Files:**
- Create: `src/app/api/claims/[id]/mark-viewed/route.ts`

- [ ] **Step 1: Write the route**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST /api/claims/[id]/mark-viewed
// Upserts (auth.uid(), claim_id, now()) into user_claim_views.
// Fire-and-forget from the client; failures are silent (a missed mark is
// cosmetic only — the dashboard will just keep showing gray).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { error } = await supabase
    .from('user_claim_views')
    .upsert({ user_id: user.id, claim_id: id, opened_at: new Date().toISOString() }, {
      onConflict: 'user_id,claim_id',
    })

  // 42P01 = table doesn't exist (migration not yet run). Silently no-op so
  // the client isn't broken during the migration window.
  if (error && error.code !== '42P01') {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Type-check**

```
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/claims/[id]/mark-viewed/route.ts
git commit -m "api: mark-viewed upserts user_claim_views on claim open"
```

---

## Task 4: Extend `history.ts` — add `openedAt` + `assignedAt` to `ACVHistoryEntry`, join views in `fetchACVHistory`

**Files:**
- Modify: `src/lib/supabase/history.ts`

- [ ] **Step 1: Read the current shape**

Open `src/lib/supabase/history.ts` and locate:
- The `ACVHistoryEntry` interface
- The `colsFull` / `colsCore` select strings (used with graceful-degradation on 42703)
- The `rowToEntry(row)` mapper
- The `fetchACVHistory()` function

Confirm that `assigned_at` is already in the select (added by an earlier migration). If not, add it to both `colsFull` and `colsCore`.

- [ ] **Step 2: Add fields to `ACVHistoryEntry`**

Locate the interface and add:

```ts
export interface ACVHistoryEntry {
  // ... existing fields ...
  assignedAt?: string | null    // acv_history.assigned_at — timestamp when this claim was (re)assigned
  openedAt?: string | null      // user_claim_views.opened_at for the current auth user; null if never opened
}
```

- [ ] **Step 3: Map `assigned_at` in `rowToEntry`**

Inside `rowToEntry(row)`, add:

```ts
assignedAt: row.assigned_at ?? null,
```

Do NOT map `openedAt` here — that comes from a separate join done in `fetchACVHistory`.

- [ ] **Step 4: Extend `fetchACVHistory` to pull views**

At the top of `fetchACVHistory` (or wherever the current auth user is available), after the main `acv_history` select succeeds, run a parallel select of the current user's views:

```ts
// Pull the current user's opened_at rows so the dashboard can derive
// isUnread (assigned_to = user AND (no row OR assigned_at > opened_at)).
// Wrapped in try/catch because the table may not exist yet if the
// migration hasn't run — in that case everything just shows as opened.
const { data: { user } } = await supabase.auth.getUser()
let viewsByClaimId = new Map<string, string>()
if (user) {
  const { data: views, error: viewsErr } = await supabase
    .from('user_claim_views')
    .select('claim_id, opened_at')
    .eq('user_id', user.id)
  // 42P01 = table doesn't exist yet (pre-migration). Fall through with empty map.
  if (!viewsErr && views) {
    viewsByClaimId = new Map(views.map(v => [v.claim_id as string, v.opened_at as string]))
  }
}
```

Then, after `rowToEntry` runs on each row, add:

```ts
entries = entries.map(e => ({ ...e, openedAt: viewsByClaimId.get(e.id) ?? null }))
```

(Adjust the variable name to whatever the array is called in the actual function.)

- [ ] **Step 5: Type-check**

```
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/supabase/history.ts
git commit -m "history: expose assignedAt + openedAt on ACVHistoryEntry"
```

---

## Task 5: Gray-out unread rows in `claims-table.tsx`

**Files:**
- Modify: `src/components/claims-table.tsx`

- [ ] **Step 1: Locate the current user + row-render code**

Open `src/components/claims-table.tsx` and find:
- Where the current user id is available (likely via `useCurrentProfile()` or a similar hook — check imports)
- The `<tr>` where each entry is rendered

- [ ] **Step 2: Derive `isUnread` for each entry**

Inside the row render (or as a computed above the return), add:

```ts
const isUnread = Boolean(
  currentUserId &&
  entry.assignedTo === currentUserId &&
  (!entry.openedAt || (entry.assignedAt && entry.assignedAt > entry.openedAt))
)
```

`currentUserId` should be pulled from whichever hook the file already uses to know the caller (search the file for `useCurrentProfile`, `useUser`, etc.). If neither is present, add:

```ts
import { useCurrentProfile } from '@/lib/supabase/profiles'
// inside the component:
const { profile } = useCurrentProfile()
const currentUserId = profile?.id ?? null
```

- [ ] **Step 3: Apply the styling**

On the `<tr>`, extend the existing className:

```tsx
<tr
  className={cn(
    /* existing classes */,
    isUnread && 'bg-gray-100 hover:bg-gray-200',
  )}
  /* existing props */
>
```

If the file doesn't import `cn`, add: `import { cn } from '@/lib/utils'` (or the codebase equivalent — check other components).

- [ ] **Step 4: Type-check + build**

```
npx tsc --noEmit
npm run build
```

Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/claims-table.tsx
git commit -m "claims-table: gray-out unread rows for the assigned appraiser"
```

---

## Task 6: `ClaimWorkspace` — mark-viewed effect + admin-gate the two fields

**Files:**
- Modify: `src/components/claim/ClaimWorkspace.tsx`

- [ ] **Step 1: Confirm `isAdmin` is in scope**

Search `ClaimWorkspace.tsx` for `isAdmin`. It should already be derived (existing admin-only gates like the Finalize button use it). If it isn't present, add near the top of the component:

```tsx
import { useCurrentProfile } from '@/lib/supabase/profiles'
// inside the component:
const { profile } = useCurrentProfile()
const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'
```

(Adjust exact role-check to match the codebase's existing pattern — check how other files derive isAdmin.)

- [ ] **Step 2: Add the mark-viewed effect**

Near the top of the `ClaimWorkspace` component, after `claim.id` and `isAdmin` are available, add:

```tsx
// Mark the claim as viewed by the current user (fires on mount + when
// the claim id changes). Fire-and-forget; failures are silent. Skipped
// for admins (they never see the unread gray highlight anyway).
useEffect(() => {
  if (!claim.id || isAdmin) return
  fetch(`/api/claims/${claim.id}/mark-viewed`, { method: 'POST' }).catch(() => {})
}, [claim.id, isAdmin])
```

(If `useEffect` isn't imported, add it to the existing React import at the top of the file.)

- [ ] **Step 3: Admin-gate the Handling Appraiser select (lines ~489–516)**

Replace the current `<select>` block with:

```tsx
{isAdmin ? (
  <select
    className={inputCls}
    value={claim.handlingAppraiser ?? ''}
    onChange={(e) => set('handlingAppraiser', e.target.value)}
  >
    <option value="">— Select appraiser —</option>
    {(() => {
      const visible = allProfiles.filter(p => p.isActive && p.showInHandlingAppraiserList !== false)
      const current = claim.handlingAppraiser ?? ''
      const currentInVisible = current && visible.some(p => (p.name || p.email) === current)
      return (
        <>
          {current && !currentInVisible && (
            <option value={current} disabled>{current} (not in list)</option>
          )}
          {visible.map(p => {
            const name = p.name || p.email
            return <option key={p.id} value={name}>{name}</option>
          })}
        </>
      )
    })()}
  </select>
) : (
  <input
    className={inputCls}
    value={claim.handlingAppraiser || '—'}
    disabled
    readOnly
  />
)}
```

- [ ] **Step 4: Admin-gate the Client picker (lines ~568–577)**

Replace the current `<ClientPicker>` block with:

```tsx
{isAdmin ? (
  <ClientPicker
    value={clientId}
    valueName={claim.clientName}
    onChange={(id, name) => {
      onClientIdChange(id)
      set('clientName', name)
    }}
  />
) : (
  <input
    className={inputCls}
    value={claim.clientName || '—'}
    disabled
    readOnly
  />
)}
```

- [ ] **Step 5: Type-check + build**

```
npx tsc --noEmit
npm run build
```

Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/claim/ClaimWorkspace.tsx
git commit -m "workspace: mark-viewed on open + admin-gate Handling Appraiser and Client"
```

---

## Task 7: Pre-deploy verification

**Files:** none (verification only)

- [ ] **Step 1: Full type-check**

```
npx tsc --noEmit
```

Expected: exit 0, no output.

- [ ] **Step 2: Full production build**

```
npm run build
```

Expected: "Compiled successfully" with the standard route table. No errors.

- [ ] **Step 3: Confirm both migrations were run**

Ask Henry:

> Confirm both migrations ran cleanly in Supabase:
> - `migration-user-claim-views.sql` (expected `1, 1, 3`)
> - `migration-admin-only-claim-fields.sql` (expected `acv_history_appraiser_guard` in both selects)

Wait for confirmation before Task 8.

---

## Task 8: Deploy

**Files:** none (deploy only)

- [ ] **Step 1: Capture current live deploy as rollback target**

```
npx vercel inspect modern-tools-rho.vercel.app --scope henry-as-projects-88caed67
```

Note the `id` and `url` of the deploy currently aliased.

- [ ] **Step 2: Post the rollback command to Henry BEFORE deploying**

Send Henry:

> Deploying now. If the new build breaks, rollback with:
> ```
> npx vercel promote <rollback-url-from-step-1> --scope henry-as-projects-88caed67 --yes
> ```

- [ ] **Step 3: Deploy**

```
npx vercel --prod --scope henry-as-projects-88caed67 --yes
```

Wait for "Production: https://…" and `readyState: READY`. Capture the new deploy id.

- [ ] **Step 4: Verify alias flipped**

```
npx vercel inspect modern-tools-rho.vercel.app --scope henry-as-projects-88caed67
```

Expected: `id` matches the new deploy from step 3, `status` is `● Ready`.

- [ ] **Step 5: Update `docs/SESSIONS.md`**

Prepend (or append to the current 09-16 entry) with:
- Files changed (list from Tasks 1–6)
- Migrations run (Tasks 1 & 2)
- New live deploy id + URL
- Rollback URL from step 2
- Smoke-test punch list for Henry (see Task 9)

- [ ] **Step 6: Commit the session log update**

```bash
git add docs/SESSIONS.md
git commit -m "SESSIONS: unread claims + admin-only Handling Appraiser/Client"
```

---

## Task 9: Smoke-test punch list for Henry

**Files:** none (verification instructions)

- [ ] **Step 1: Send the punch list**

> Please smoke-test the live site:
>
> 1. **Unread gray:** log in as an appraiser account, note the dashboard state. As admin, reassign one of their claims to them again → their dashboard should show that row in `bg-gray-100`. Click into the claim → refresh dashboard → gray gone.
> 2. **Handling Appraiser admin-only:** log in as appraiser → open any claim → Handling Appraiser field should be a disabled input showing whatever admin set, not a dropdown. Log in as admin → same claim → full dropdown returns.
> 3. **Client admin-only:** same test, Client field. Appraiser sees disabled input; admin sees `<ClientPicker>` search box.
> 4. **Trigger enforcement (optional):** in the browser dev tools console, as an appraiser, try `await supabase.from('acv_history').update({ client_id: '<some-uuid>' }).eq('id', '<their-claim-id>')`. Should get a `not allowed to change client_id` error (Postgres exception surfaced by Supabase).

Wait for report. If regressions found, roll back and diagnose.

---

## Rollback plan

Two independent migrations, two independent rollbacks:

- **Code:** `npx vercel promote <pre-deploy-url> --scope henry-as-projects-88caed67 --yes`
- **Trigger extension:** paste `supabase/migration-admin-only-claim-fields-rollback.sql` in the SQL editor.
- **user_claim_views table:** paste `supabase/migration-user-claim-views-rollback.sql`.

Rollback safety: client code tolerates either migration being reverted (42P01 fallback in `fetchACVHistory`; missing trigger guards just means less server-side enforcement — the UI still hides the fields).
