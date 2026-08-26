# Role-Based Access Control — Design Spec

**Date:** 2026-08-26
**Status:** Approved for implementation planning
**Follow-up:** implementation plan at `docs/superpowers/plans/2026-08-26-role-based-access.md` (after this spec is approved).

## 1. Elevator pitch

Split Modern Tools' single shared login model into two roles — **admin** and **appraiser (regular)** — with claim assignment, per-user settings, admin-only user management, and an admin-controlled toggle that gates whether appraisers can create claims. Enforcement is server-side (RLS + API routes), not just UI. Existing open claims stay open and untouched; unassigned is a valid state.

## 2. In scope / out of scope

### In scope
- New `profiles` table + role column (`admin` | `appraiser`).
- `assigned_to` on `acv_history`; admins assign/reassign; appraisers cannot.
- Submit workflow: appraiser submits a claim → leaves their queue → appears in admin's Completed Assignments queue → admin approves (closes) or sends back (unlocks).
- User management: admin creates users with email + name + password + role via a form.
- Personal profile page: any user can change their own name and password.
- Site-settings toggle: **Allow appraisers to create claims** (default ON). Enforced server-side.
- Header profile dropdown for personal actions; `/admin` route for admin-only pages.
- All existing users (currently only Henry) become admin at migration time. All existing ~390 claims remain unassigned.

### Out of scope for v1
- Groups / teams / multiple admin tiers (hierarchy — spec says all admins are equal).
- Per-appraiser dashboards or reports beyond "my open claims" + "my closed claims via All Claims".
- Notifications (email, in-app) on assign / submit / send back. Handled out-of-band.
- Audit log UI (submitted_at / submitted_by / reviewed_by columns are enough for future ad-hoc queries; no viewer).
- Invite-by-email flow. Admin sets password directly.
- Role higher than admin (super-admin, owner). All admins equal.
- Password reset by admin. Users use their own password change UI.
- Impersonation ("view as this appraiser").

## 3. Data model

### 3.1 New table: `public.profiles`

```sql
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null default '',
  role text not null default 'appraiser' check (role in ('admin', 'appraiser')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_role_idx on public.profiles(role);
```

Auto-populated on user creation via a trigger on `auth.users`:

```sql
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', ''), 'appraiser');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

Migration seeds Henry's existing account as `admin` (see §6.1).

### 3.2 New columns on `acv_history`

```sql
alter table acv_history
  add column if not exists assigned_to  uuid references auth.users(id) on delete set null,
  add column if not exists submitted_at timestamptz,
  add column if not exists submitted_by uuid references auth.users(id) on delete set null;

create index if not exists acv_history_assigned_to_idx on acv_history(assigned_to);
create index if not exists acv_history_submitted_at_idx on acv_history(submitted_at) where submitted_at is not null;
```

- `assigned_to` — null = unassigned; existing rows stay null.
- `submitted_at` — set when appraiser submits; cleared on Send Back or Reopen; **kept** when admin Approves (for audit trail — no visual distinction on closed claims per Henry's decision).
- `submitted_by` — audit; same lifecycle as `submitted_at`.
- Existing `status` (`open`|`closed`) unchanged. Approve = set `status = 'closed'`.

### 3.3 State machine

| status | submitted_at | assigned_to | meaning | who sees on dashboard |
|---|---|---|---|---|
| open | null | null | new claim, no owner | admins (Open Claims) |
| open | null | X | assigned, active | admin (Open) + user X (dashboard) |
| open | set | X | submitted, waiting on admin review, appraiser locked | admins (Completed Assignments) only |
| closed | null | null | admin-closed unassigned | All Claims only |
| closed | null | X | admin-closed assigned; never went through submit | All Claims only |
| closed | set | X | admin-approved a submission | All Claims only (no special badge) |

Transitions:
- Assign (admin only): sets `assigned_to`.
- Submit (appraiser, on their own open claim): sets `submitted_at`, `submitted_by`.
- Send Back (admin, on submitted claim): clears `submitted_at`, `submitted_by`.
- Approve (admin, on submitted claim): sets `status = 'closed'`. Leaves `submitted_at`/`submitted_by`.
- Reopen (admin, on any closed claim): sets `status = 'open'`, clears `submitted_at`, `submitted_by`.

### 3.4 New table: `public.site_settings`

```sql
create table public.site_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.site_settings (key, value)
values ('allow_regular_create_claims', 'true'::jsonb)
on conflict do nothing;
```

Single-row key/value shape so future toggles are `insert into` — no schema changes.

## 4. RLS enforcement

### 4.1 Helper function

```sql
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;
```

`security definer` so it can read `profiles` even from within RLS contexts.

### 4.2 `acv_history` policies (replaces existing authenticated-wide policies)

```sql
drop policy if exists "Authenticated users can view all acv_history"   on acv_history;
drop policy if exists "Authenticated users can insert acv_history"     on acv_history;
drop policy if exists "Authenticated users can update acv_history"     on acv_history;
drop policy if exists "Authenticated users can delete acv_history"     on acv_history;

-- SELECT: admin sees all; appraiser sees only their assigned claims.
create policy acv_select on acv_history for select
  using (
    public.is_admin()
    or assigned_to = auth.uid()
  );

-- INSERT: admin always; appraiser only if the site toggle allows AND stamps self as assignee + user_id.
create policy acv_insert on acv_history for insert
  with check (
    (public.is_admin() and user_id = auth.uid())
    or (
      not public.is_admin()
      and (select (value)::text::boolean from public.site_settings where key = 'allow_regular_create_claims')
      and user_id = auth.uid()
      and assigned_to = auth.uid()
    )
  );

-- UPDATE: admin any; appraiser only their assigned + not-submitted claims,
-- and must not change protected columns (assigned_to, status, submitted_at, submitted_by, user_id).
create policy acv_update on acv_history for update
  using (
    public.is_admin()
    or (assigned_to = auth.uid() and submitted_at is null)
  )
  with check (
    public.is_admin()
    or (
      assigned_to = auth.uid()
      and submitted_at is null
    )
  );

-- Column-level protection for appraisers: implemented via a BEFORE UPDATE trigger,
-- since Postgres RLS WITH CHECK operates on the whole row (can't compare to OLD).
create or replace function public.appraiser_column_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then
    return new;
  end if;
  -- Non-admin: block changes to protected columns.
  if new.assigned_to  is distinct from old.assigned_to  then raise exception 'not allowed to change assigned_to';  end if;
  if new.status       is distinct from old.status       then raise exception 'not allowed to change status';       end if;
  if new.submitted_at is distinct from old.submitted_at then raise exception 'not allowed to change submitted_at'; end if;
  if new.submitted_by is distinct from old.submitted_by then raise exception 'not allowed to change submitted_by'; end if;
  if new.user_id      is distinct from old.user_id      then raise exception 'not allowed to change user_id';      end if;
  return new;
end;
$$;

create trigger acv_history_appraiser_guard
  before update on acv_history
  for each row execute function public.appraiser_column_guard();

-- DELETE: admin only.
create policy acv_delete on acv_history for delete
  using (public.is_admin());
```

### 4.3 `profiles` policies

```sql
alter table public.profiles enable row level security;

-- Any authenticated user can list profiles (needed for assignment dropdown).
create policy profiles_select on public.profiles for select
  using (auth.role() = 'authenticated');

-- Users can update their own row (name only — role changes are blocked by trigger below).
create policy profiles_update_self on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

create or replace function public.profiles_role_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then return new; end if;
  if new.role is distinct from old.role then raise exception 'not allowed to change role'; end if;
  if new.email is distinct from old.email then raise exception 'not allowed to change email'; end if;
  return new;
end;
$$;

create trigger profiles_role_guard
  before update on public.profiles
  for each row execute function public.profiles_role_guard();

-- Admin-only: full manage.
create policy profiles_admin_all on public.profiles for all
  using (public.is_admin())
  with check (public.is_admin());
```

Insert / delete of profile rows happens via the server API routes using the service role (never from the client). The `on_auth_user_created` trigger handles automatic profile seeding when Supabase Auth's admin API creates a user.

### 4.4 `site_settings` policies

```sql
alter table public.site_settings enable row level security;

-- Everyone can read (client needs to know whether to render Create Claim).
create policy site_settings_read on public.site_settings for select
  using (auth.role() = 'authenticated');

-- Admin only can write.
create policy site_settings_write on public.site_settings for all
  using (public.is_admin())
  with check (public.is_admin());
```

### 4.5 Storage bucket `claim-documents`

Existing bucket policies (`bucket_id = 'claim-documents' and auth.role() = 'authenticated'`) get tightened so that an appraiser can only read/write objects under a claim they're assigned to. Path convention today is `${claimId}/${timestamp}-${filename}`. New policy uses that first path segment to check assignment:

```sql
drop policy if exists "Authenticated users can view claim-documents"   on storage.objects;
drop policy if exists "Authenticated users can upload claim-documents" on storage.objects;
drop policy if exists "Authenticated users can update claim-documents" on storage.objects;
drop policy if exists "Authenticated users can delete claim-documents" on storage.objects;

create policy "Users can view claim-documents they can see" on storage.objects
  for select using (
    bucket_id = 'claim-documents'
    and exists (
      select 1 from public.acv_history c
      where c.id = split_part(name, '/', 1)
        and (public.is_admin() or c.assigned_to = auth.uid())
    )
  );

-- Analogous insert/update/delete policies with the same subquery.
```

## 5. Server-side API routes

Workflow transitions and admin operations go through Next.js API routes so we have ONE chokepoint for auth + role checking. Direct client mutations for status/submitted/assignment are blocked by the trigger from §4.2 — the routes are the only path.

### 5.1 Route table

| Route | Method | Who | Purpose |
|---|---|---|---|
| `/api/admin/users` | POST | admin | Create user (email + name + password + role). Uses service-role `auth.admin.createUser`; the auth trigger auto-inserts the profile row; then this route updates the row to set role + name. |
| `/api/admin/users/[id]` | PATCH | admin | Update name / role of an existing user. |
| `/api/admin/users/[id]` | DELETE | admin | Delete user (cascades profile via FK; existing claims' `assigned_to` becomes null via ON DELETE SET NULL). |
| `/api/admin/site-settings` | PATCH | admin | Set a key (currently only `allow_regular_create_claims`). |
| `/api/claims/[id]/assign` | POST | admin | Set `assigned_to = <uuid>` (or null to unassign). |
| `/api/claims/[id]/submit` | POST | appraiser (own claim) | Set `submitted_at = now()`, `submitted_by = user_id`. Rejects if already submitted. |
| `/api/claims/[id]/send-back` | POST | admin (on submitted) | Clear `submitted_at`, `submitted_by`. |
| `/api/claims/[id]/approve` | POST | admin (on submitted) | Set `status = 'closed'`. Keeps submission timestamps. |
| `/api/claims/[id]/reopen` | POST | admin (on closed) | Set `status = 'open'`, clear submission fields. |
| `/api/profile` | PATCH | any | Update own name. |
| Password change | (uses `supabase.auth.updateUser` directly from the client) | any | No route needed. |

Every admin route: verifies session, reads caller's profile, aborts with 403 if role !== 'admin'. Every claim workflow route also verifies role + assignment against the target claim before mutating.

### 5.2 Service-role client

New file `src/lib/supabase/service.ts` — server-only helper that constructs a Supabase client with `SUPABASE_SERVICE_ROLE_KEY`. Used by:
- `/api/admin/users` (needs `auth.admin.createUser`, `auth.admin.deleteUser`)
- `/api/admin/users/[id]` PATCH (bypasses column-guard trigger to change role)

The service-role key is a new Vercel env var. **Never** imported in a client component. Any file that imports it must run only on the server (Node runtime). ESLint rule optional; convention enforced by review.

## 6. Migration & rollout

### 6.1 Migration file: `supabase-migration-roles.sql`

Runs in Supabase SQL Editor. Order:
1. `create table public.profiles (...)`.
2. `create function handle_new_user() ... create trigger on_auth_user_created`.
3. Seed every existing Supabase Auth user as admin (Henry confirmed there is only one account today; walking `auth.users` is more robust than hardcoding an email):
   ```sql
   insert into public.profiles (id, email, name, role)
   select id, email, coalesce(raw_user_meta_data->>'name', ''), 'admin'
   from auth.users
   on conflict (id) do update set role = 'admin';
   ```
4. `alter table acv_history add column ...` (assigned_to, submitted_at, submitted_by).
5. `create function is_admin()`.
6. `create function appraiser_column_guard() ... create trigger`.
7. Drop old `acv_history` authenticated-wide policies.
8. Create new role-aware `acv_history` policies.
9. Enable RLS on `profiles`; create profiles policies + role_guard trigger.
10. `create table public.site_settings (...)`; enable RLS; create policies; seed toggle.
11. Update `storage.objects` policies for `claim-documents`.
12. **Verification queries at end** (as `select` statements the operator inspects):
    - `select count(*) from acv_history;` (compare to pre-run count).
    - `select count(*) from profiles where role = 'admin';` (must be 1).
    - `select * from site_settings;` (must contain `allow_regular_create_claims=true`).

### 6.2 Rollback file: `supabase-migration-roles-rollback.sql`

Reverses everything: drops triggers, drops functions, drops policies, drops columns, drops tables. Restores the previous authenticated-wide `acv_history` policies. Since no existing data was modified, rollback is loss-free.

### 6.3 Env var

Henry adds `SUPABASE_SERVICE_ROLE_KEY` to the Vercel project (Production environment, sensitive). Value comes from Supabase dashboard → Project Settings → API → `service_role` (secret). Not committed to git.

### 6.4 Deploy sequence

1. Migration SQL run + verified (Henry executes, confirms row counts).
2. Env var added to Vercel.
3. Code deploy via `vercel --prod`. On first load: Henry sees admin dashboard, all claims still visible (as admin), all previous functionality intact.
4. Henry uses `/admin/users` to add appraiser accounts + assigns claims. New appraisers log in and see only what's assigned to them.

Rollback = `vercel promote <previous>` + run `-rollback.sql`. Order matters if rolling back: revert code first (so it doesn't try to read profiles), then SQL.

## 7. UI surfaces

### 7.1 Header (`src/components/app-header.tsx`)

- Replaces the plain email span next to LogoutButton with a small dropdown trigger showing the user's name (falls back to email).
- Menu items: **Profile**, **Admin** (only visible when `role === 'admin'`), **Sign out**.
- Uses a small `useCurrentProfile()` hook — fetches once per session, cached in module state.
- Server-side pages under `/admin/*` re-check role and return 404 for non-admins. UI hiding is convenience, not security.

### 7.2 Dashboard (`src/app/page.tsx`)

- **Admin view:** Two stacked sections, each their own card.
  - **Open Claims** — existing table. New column: **Assigned To**. Cell contents = name of assignee, or "Unassigned" muted. When admin clicks the cell, an inline dropdown opens with a list of appraisers to pick from + an Unassigned option. Selection calls `POST /api/claims/[id]/assign`.
  - **Completed Assignments** — new table with the same columns as Open Claims, plus a "Submitted" column showing timestamp + submitter name. Rows come from `where submitted_at is not null and status = 'open'`. Clicking a row opens the workspace. If empty, section collapses to a small muted "No completed assignments to review".
- **Appraiser view:** Single card, only claims where `assigned_to = me` AND `submitted_at IS NULL` AND `status = 'open'`. No Assigned To column (they know it's them). The **New Claim** button hidden if `site_settings.allow_regular_create_claims === false`; backend still enforces on insert.

### 7.3 All Claims (`/claims`)

- Admin: all claims (open + closed). Same Assigned To column with inline dropdown. Status column as today.
- Appraiser: only claims where `assigned_to = me`, open + closed together.

### 7.4 Claim workspace (`/claims/[id]`)

- Existing UI unchanged when the viewer has edit rights.
- **Top-right toolbar additions:**
  - Appraiser, open + not submitted: **Submit** button (with confirm dialog).
  - Appraiser, submitted: read-only banner "Submitted <date> — waiting on admin review." All tab inputs disabled visually + save calls short-circuit. No Submit button; only Back.
  - Admin, submitted claim: **Approve** and **Send Back** buttons. Approve closes the claim; Send Back returns it to the appraiser (unlocks).
  - Admin, closed claim: **Reopen** button. Reopens + clears submission fields.
  - Admin, any other state: full editing + admin-only inline **Assign** dropdown in the claim header stats row so they can reassign without leaving the workspace.
- Appraiser navigating to `/claims/[id]` for a claim they don't have access to: server-side check in the page component returns `notFound()` → 404 (no leak of claim existence).

### 7.5 `/profile` (all users)

- Form with:
  - **Name** — editable, `PATCH /api/profile`.
  - **Email** — read-only display (changing email is future scope).
  - **Password** — current + new + confirm. Uses `supabase.auth.updateUser({ password })` directly from the client (Supabase enforces current-password via a re-auth call).

### 7.6 `/admin` (admin-only, top-nav item)

- Two sections on one page, or two child routes `/admin/users` + `/admin/settings`. Pick child routes for cleanliness.
- **/admin/users:** Table of profiles (name, email, role, created). Per-row: change role dropdown, delete button. Top-right **Add User** button opens a modal or inline form (email + name + password + role).
- **/admin/settings:** Currently one toggle — **Allow appraisers to create claims** (default ON). Toggle persists to site_settings. Room for future toggles.

## 8. Type + code changes summary

### 8.1 New files

| File | Purpose |
|---|---|
| `supabase-migration-roles.sql` | Full migration described in §6. |
| `supabase-migration-roles-rollback.sql` | Reverses the migration. |
| `src/lib/supabase/service.ts` | Server-side client with `SUPABASE_SERVICE_ROLE_KEY`. |
| `src/lib/supabase/profiles.ts` | `getCurrentProfile()`, `useCurrentProfile()`, `Profile` type. |
| `src/lib/supabase/site-settings.ts` | `getSiteSetting()`, `setSiteSetting()`. |
| `src/lib/auth/require-admin.ts` | Server helper for API routes: reads session + profile, returns 403 unless admin. |
| `src/app/api/admin/users/route.ts` | POST create user. |
| `src/app/api/admin/users/[id]/route.ts` | PATCH update / DELETE user. |
| `src/app/api/admin/site-settings/route.ts` | PATCH toggle. |
| `src/app/api/claims/[id]/assign/route.ts` | POST assign. |
| `src/app/api/claims/[id]/submit/route.ts` | POST submit. |
| `src/app/api/claims/[id]/send-back/route.ts` | POST send back. |
| `src/app/api/claims/[id]/approve/route.ts` | POST approve. |
| `src/app/api/claims/[id]/reopen/route.ts` | POST reopen. |
| `src/app/api/profile/route.ts` | PATCH own name. |
| `src/app/profile/page.tsx` | Personal profile page. |
| `src/app/admin/users/page.tsx` | Admin: users list + add. |
| `src/app/admin/settings/page.tsx` | Admin: site-settings toggle. |

### 8.2 Modified files

| File | Change |
|---|---|
| `src/components/app-header.tsx` | Profile dropdown; Admin link conditional on role. |
| `src/components/claims-table.tsx` | Assigned To column + inline dropdown (admin only); "Submitted" column visible in Completed Assignments variant. |
| `src/app/page.tsx` | Admin dual-card layout; appraiser single-card filtered view; conditional New Claim button. |
| `src/app/claims/page.tsx` | Admin sees all; appraiser sees their assigned. |
| `src/app/claims/[id]/page.tsx` | Server-side access check → 404 for non-authorized appraiser. |
| `src/components/claim/ClaimWorkspace.tsx` | Submit / Approve / Send Back / Reopen buttons; read-only banner when submitted; admin-only inline assign in header. |
| `src/lib/supabase/history.ts` | Surface `assigned_to`, `submitted_at`, `submitted_by` on `ACVHistoryEntry`; row mapper updates. |
| `middleware.ts` | No change — API routes were already excluded from middleware. Auth checks in the routes themselves. |

### 8.3 Explicitly untouched

- All tool tabs (ACV, DV, Award, Notes, Summary, Estimate, Invoice, Documents, Estimate Review) beyond the enable/disable when submitted.
- All PDF fillers and generation routes.
- Existing migrations, other tables, other RLS policies not listed above.
- Existing user's login flow.

## 9. Verification plan

Before claiming done:
- `npx tsc --noEmit` and `npm run build` — must be clean.
- `npm run lint` — no new warnings/errors.
- **Migration dry-run on a Supabase dev branch** if available (Henry to confirm); otherwise Henry runs on prod after backing up (`pg_dump` via Supabase dashboard export).
- Smoke test as admin (Henry): everything works as before, plus:
  - New Assigned To column on Open Claims shows correctly.
  - Assign dropdown persists and reappears after refresh.
  - Add User → new appraiser can log in → sees empty dashboard.
  - After assigning claim to appraiser: appraiser sees it; admin sees "Assigned To: <name>".
- Smoke test as new appraiser (Henry logs in as a test appraiser account):
  - Dashboard shows only assigned open claims.
  - Cannot reach a non-assigned claim URL (404).
  - Can open, edit, then Submit — claim disappears from their dashboard.
  - Cannot see it in All Claims (until admin closes).
  - Password change works.
- Return to admin: submitted claim appears in Completed Assignments. Approve closes it. Reopen returns it to appraiser.
- Toggle "Allow appraisers to create claims" off → appraiser's New Claim button hidden; direct client-side `supabase.from('acv_history').insert(...)` also rejected by RLS.
- `vercel inspect modern-tools-rho.vercel.app` after deploy — alias flipped.

## 10. Risks & open questions

- **Storage-bucket path convention** — the RLS I'm adding for `claim-documents` splits the object name on `/` and expects `${claimId}/${filename}`. This is what `uploadClaimDocument()` in `documents.ts` already does. If that convention ever changes, the storage policy breaks silently.
- **Column-guard trigger vs. RLS** — Postgres RLS `WITH CHECK` can't compare NEW to OLD, so column protection lives in a trigger. Downside: triggers can be dropped by anyone with the right privileges (in practice, only Henry via Supabase dashboard). Acceptable.
- **Session cache staleness** — `useCurrentProfile()` caches the current role for the session lifetime (client). If admin demotes an active appraiser session, the client will keep showing admin UI until reload. RLS still enforces on the server, so no data risk — just cosmetic. Acceptable v1; can add a Realtime subscription later if needed.
- **Reassignment mid-work** — if admin reassigns Bob's open claim to Alice while Bob is editing, Bob's next save gets a 403 (RLS reject). UI should show a friendly "This claim was reassigned" message on that failure. Handled by a top-level error catch in the workspace's autosave.
- **CL-PDF-parse route unused today?** The client uses `src/lib/parse-claim-pdf.ts` (client-side pdfjs). The `/api/acv/parse-claim` route exists but no callers found — no impact on this spec, but noting for cleanup later.
- **`user_id` vs `assigned_to` on `acv_history`** — after this change, `user_id` is only the *creator* (immutable), `assigned_to` is the *owner* (mutable). Existing code that reads `user_id` for attribution stays unchanged.
- **Data-loss risk on migration** — none, since only new columns / tables are added and existing policies are replaced (not dropped-with-cascade). Verify with row-count query pre/post.

## 11. Alternatives considered

- **Role in `auth.users.app_metadata` (JWT-stamped)** — faster RLS (no join) but role changes require re-login. Rejected because the app already carries a lightweight per-fetch profile read, and immediate role propagation is a real UX benefit.
- **Three-state status column** (`open` | `submitted` | `closed`) — cleaner in some queries but Henry explicitly said "open and closed are the only statuses needed" and prefers a separate submission timestamp for the workflow. Rejected.
- **Per-column RLS via GRANT** — Postgres does support column-level grants, but they don't interact well with RLS and aren't the standard Supabase pattern. Trigger is more idiomatic here.
- **Client-side filtering only (no RLS role changes)** — rejected outright by Henry's constraint "every permission check must be enforced on the backend."
- **Invite-by-email user creation** — smoother onboarding but requires Supabase SMTP config that Henry doesn't have. Deferred; admin-set password meets v1 needs.

## 12. Sequencing (for the plan phase)

Rough order the plan will use:
1. Migration SQL + rollback SQL (deliver both together).
2. `src/lib/supabase/service.ts`, `profiles.ts`, `site-settings.ts`, `require-admin.ts`.
3. Admin API routes (users CRUD + site-settings).
4. Claim workflow API routes (assign / submit / send-back / approve / reopen).
5. Header dropdown + `useCurrentProfile()` wiring.
6. `/profile` page.
7. `/admin/users` + `/admin/settings` pages.
8. `claims-table.tsx` + `page.tsx` (dashboard admin/appraiser views + assign dropdown).
9. `ClaimWorkspace.tsx` — Submit/Approve/Send-Back/Reopen buttons + submitted read-only banner.
10. `/claims/[id]` server-side access guard.
11. Verify + deploy.
