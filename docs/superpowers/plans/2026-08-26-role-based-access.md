# Role-Based Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline execution chosen — this is a big schema+API+UI feature with tight interdependencies) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the role-based access design at `docs/superpowers/specs/2026-08-26-role-based-access-design.md` — admin + appraiser roles, claim assignment, submit → admin queue → approve/send-back workflow, admin user management, site-settings toggle for appraiser-create.

**Architecture:** New `public.profiles` table with role column, new `assigned_to`/`submitted_at`/`submitted_by` on `acv_history`, RLS policies that scope reads/writes by role + assignment, service-role Supabase client for admin ops + all workflow transitions (assign/submit/send-back/approve/reopen), separate `/admin/*` pages, header profile dropdown for personal actions.

**Tech Stack:** Same as the rest of the app — Next.js 16 App Router, TypeScript 5, React 19, `@supabase/ssr` for auth, `@supabase/supabase-js` for admin ops with the new `SUPABASE_SERVICE_ROLE_KEY` env var.

**Verification model:** No test framework configured. "Verify" = `npx tsc --noEmit` + `npm run build` + manual dev-server smoke where applicable. Same standing pattern used for the Estimate Review feature yesterday.

**Enforcement choice (implementation detail beyond spec §5):** ALL workflow transitions (assign / submit / send-back / approve / reopen) go through API routes using the service-role client. Regular tool-data edits by appraisers continue to use the user's cookie session and are enforced by the RLS UPDATE policy + column-guard trigger. This keeps a single, consistent enforcement pattern for workflow ops.

---

## Task 1: Migration SQL + rollback SQL

Deliver the full migration and its rollback as two files. Henry runs them out of band in the Supabase SQL editor. Task does NOT execute against a live DB.

**Files:**
- Create: `supabase-migration-roles.sql`
- Create: `supabase-migration-roles-rollback.sql`

- [ ] **Step 1: Write the migration file**

Path: `supabase-migration-roles.sql`

```sql
-- =========================================================================
-- Modern Tools — Role-Based Access migration (2026-08-26)
-- Run in the Supabase SQL Editor (Dashboard -> SQL Editor).
-- Spec: docs/superpowers/specs/2026-08-26-role-based-access-design.md
-- Reverses cleanly with supabase-migration-roles-rollback.sql.
-- =========================================================================

-- 1. profiles table + trigger to seed on auth.users insert
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null default '',
  role text not null default 'appraiser' check (role in ('admin', 'appraiser')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles(role);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', ''), 'appraiser')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. Seed every existing auth.users row as admin (Henry confirmed only one
--    account exists today; walking auth.users is safer than hardcoding email).
insert into public.profiles (id, email, name, role)
select id, email, coalesce(raw_user_meta_data->>'name', ''), 'admin'
from auth.users
on conflict (id) do update set role = 'admin';

-- 3. is_admin() helper (used by every RLS policy that checks role)
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;

-- 4. profiles RLS
alter table public.profiles enable row level security;

drop policy if exists profiles_select       on public.profiles;
drop policy if exists profiles_update_self  on public.profiles;
drop policy if exists profiles_admin_all    on public.profiles;

create policy profiles_select on public.profiles for select
  using (auth.role() = 'authenticated');

create policy profiles_update_self on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

create policy profiles_admin_all on public.profiles for all
  using (public.is_admin())
  with check (public.is_admin());

-- Column-guard trigger: non-admins can update their own row's name only.
create or replace function public.profiles_role_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'service_role' then return new; end if;
  if public.is_admin() then return new; end if;
  if new.role  is distinct from old.role  then raise exception 'not allowed to change role'; end if;
  if new.email is distinct from old.email then raise exception 'not allowed to change email'; end if;
  return new;
end;
$$;

drop trigger if exists profiles_role_guard on public.profiles;
create trigger profiles_role_guard
  before update on public.profiles
  for each row execute function public.profiles_role_guard();

-- 5. acv_history: new columns
alter table public.acv_history add column if not exists assigned_to  uuid references auth.users(id) on delete set null;
alter table public.acv_history add column if not exists submitted_at timestamptz;
alter table public.acv_history add column if not exists submitted_by uuid references auth.users(id) on delete set null;

create index if not exists acv_history_assigned_to_idx  on public.acv_history(assigned_to);
create index if not exists acv_history_submitted_at_idx on public.acv_history(submitted_at) where submitted_at is not null;

-- 6. acv_history: replace authenticated-wide policies with role-aware policies
drop policy if exists "Authenticated users can view all acv_history"   on public.acv_history;
drop policy if exists "Authenticated users can insert acv_history"     on public.acv_history;
drop policy if exists "Authenticated users can update acv_history"     on public.acv_history;
drop policy if exists "Authenticated users can delete acv_history"     on public.acv_history;
drop policy if exists acv_select on public.acv_history;
drop policy if exists acv_insert on public.acv_history;
drop policy if exists acv_update on public.acv_history;
drop policy if exists acv_delete on public.acv_history;

create policy acv_select on public.acv_history for select
  using (
    public.is_admin()
    or assigned_to = auth.uid()
  );

create policy acv_insert on public.acv_history for insert
  with check (
    (public.is_admin() and user_id = auth.uid())
    or (
      not public.is_admin()
      and coalesce((select (value #>> '{}')::boolean from public.site_settings where key = 'allow_regular_create_claims'), true)
      and user_id = auth.uid()
      and (assigned_to is null or assigned_to = auth.uid())
    )
  );

create policy acv_update on public.acv_history for update
  using (
    public.is_admin()
    or (assigned_to = auth.uid() and submitted_at is null)
  )
  with check (
    public.is_admin()
    or (assigned_to = auth.uid() and submitted_at is null)
  );

create policy acv_delete on public.acv_history for delete
  using (public.is_admin());

-- 7. Column-guard trigger for acv_history: appraisers can't change protected columns.
--    Service-role bypasses (used by workflow API routes to set status/submitted/etc).
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

drop trigger if exists acv_history_appraiser_guard on public.acv_history;
create trigger acv_history_appraiser_guard
  before update on public.acv_history
  for each row execute function public.acv_history_appraiser_guard();

-- 8. site_settings table
create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.site_settings enable row level security;

drop policy if exists site_settings_read  on public.site_settings;
drop policy if exists site_settings_write on public.site_settings;

create policy site_settings_read on public.site_settings for select
  using (auth.role() = 'authenticated');

create policy site_settings_write on public.site_settings for all
  using (public.is_admin())
  with check (public.is_admin());

insert into public.site_settings (key, value)
values ('allow_regular_create_claims', 'true'::jsonb)
on conflict (key) do nothing;

-- 9. Storage bucket policies for claim-documents — scope by assignment.
--    Path convention set by uploadClaimDocument(): "<claimId>/<timestamp>-<name>".
drop policy if exists "Authenticated users can view claim-documents"   on storage.objects;
drop policy if exists "Authenticated users can upload claim-documents" on storage.objects;
drop policy if exists "Authenticated users can update claim-documents" on storage.objects;
drop policy if exists "Authenticated users can delete claim-documents" on storage.objects;
drop policy if exists claim_docs_view   on storage.objects;
drop policy if exists claim_docs_upload on storage.objects;
drop policy if exists claim_docs_update on storage.objects;
drop policy if exists claim_docs_delete on storage.objects;

create policy claim_docs_view on storage.objects for select using (
  bucket_id = 'claim-documents'
  and exists (
    select 1 from public.acv_history c
    where c.id = split_part(name, '/', 1)
      and (public.is_admin() or c.assigned_to = auth.uid())
  )
);

create policy claim_docs_upload on storage.objects for insert with check (
  bucket_id = 'claim-documents'
  and exists (
    select 1 from public.acv_history c
    where c.id = split_part(name, '/', 1)
      and (public.is_admin() or c.assigned_to = auth.uid())
  )
);

create policy claim_docs_update on storage.objects for update using (
  bucket_id = 'claim-documents'
  and exists (
    select 1 from public.acv_history c
    where c.id = split_part(name, '/', 1)
      and (public.is_admin() or c.assigned_to = auth.uid())
  )
);

create policy claim_docs_delete on storage.objects for delete using (
  bucket_id = 'claim-documents'
  and exists (
    select 1 from public.acv_history c
    where c.id = split_part(name, '/', 1)
      and (public.is_admin() or c.assigned_to = auth.uid())
  )
);

-- 10. Verification (informational — inspect the returned rows manually)
select 'acv_history rows' as label, count(*) as value from public.acv_history
union all
select 'admin profiles' as label, count(*) as value from public.profiles where role = 'admin'
union all
select 'site_settings rows' as label, count(*) as value from public.site_settings;
```

- [ ] **Step 2: Write the rollback file**

Path: `supabase-migration-roles-rollback.sql`

```sql
-- =========================================================================
-- Rollback for supabase-migration-roles.sql
-- Restores authenticated-wide RLS on acv_history and drops everything the
-- migration added. No data on acv_history is lost (only new columns removed).
-- =========================================================================

-- Storage bucket policies -> restore permissive
drop policy if exists claim_docs_view   on storage.objects;
drop policy if exists claim_docs_upload on storage.objects;
drop policy if exists claim_docs_update on storage.objects;
drop policy if exists claim_docs_delete on storage.objects;

create policy "Authenticated users can view claim-documents"
  on storage.objects for select
  using (bucket_id = 'claim-documents' and auth.role() = 'authenticated');
create policy "Authenticated users can upload claim-documents"
  on storage.objects for insert
  with check (bucket_id = 'claim-documents' and auth.role() = 'authenticated');
create policy "Authenticated users can update claim-documents"
  on storage.objects for update
  using (bucket_id = 'claim-documents' and auth.role() = 'authenticated');
create policy "Authenticated users can delete claim-documents"
  on storage.objects for delete
  using (bucket_id = 'claim-documents' and auth.role() = 'authenticated');

-- site_settings
drop table if exists public.site_settings;

-- acv_history: restore authenticated-wide policies + drop new columns
drop trigger if exists acv_history_appraiser_guard on public.acv_history;
drop function if exists public.acv_history_appraiser_guard();

drop policy if exists acv_select on public.acv_history;
drop policy if exists acv_insert on public.acv_history;
drop policy if exists acv_update on public.acv_history;
drop policy if exists acv_delete on public.acv_history;

create policy "Authenticated users can view all acv_history"
  on public.acv_history for select using (auth.role() = 'authenticated');
create policy "Authenticated users can insert acv_history"
  on public.acv_history for insert with check (auth.uid() = user_id);
create policy "Authenticated users can update acv_history"
  on public.acv_history for update using (auth.role() = 'authenticated');
create policy "Authenticated users can delete acv_history"
  on public.acv_history for delete using (auth.role() = 'authenticated');

alter table public.acv_history drop column if exists submitted_by;
alter table public.acv_history drop column if exists submitted_at;
alter table public.acv_history drop column if exists assigned_to;

-- profiles
drop trigger if exists profiles_role_guard on public.profiles;
drop function if exists public.profiles_role_guard();
drop policy if exists profiles_select      on public.profiles;
drop policy if exists profiles_update_self on public.profiles;
drop policy if exists profiles_admin_all   on public.profiles;
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop function if exists public.is_admin();
drop table if exists public.profiles;
```

- [ ] **Step 3: Commit**

```
git add supabase-migration-roles.sql supabase-migration-roles-rollback.sql
git commit -m "Add role-based access migration + rollback SQL"
```

---

## Task 2: Extend ACVHistoryEntry with new columns

Get the type surface right before any UI code depends on it.

**Files:**
- Modify: `src/lib/supabase/history.ts`

- [ ] **Step 1: Add assigned_to / submitted_at / submitted_by to the entry type + row mapper + insert payload**

Add three optional fields to `ACVHistoryEntry`:

```typescript
// (inside the ACVHistoryEntry interface, after `status?: ClaimStatus`)
assignedTo?: string | null    // uuid | null; null = unassigned
submittedAt?: string | null   // ISO timestamp | null
submittedBy?: string | null   // uuid | null
```

Update `rowToEntry` to include:

```typescript
assignedTo: row.assigned_to ?? null,
submittedAt: row.submitted_at ?? null,
submittedBy: row.submitted_by ?? null,
```

In `saveACVHistory`'s payload block, DO NOT include the new columns — they are workflow-controlled and set via dedicated API routes. The column-guard trigger will reject appraiser attempts to change them anyway.

- [ ] **Step 2: Type-check**

```
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```
git add src/lib/supabase/history.ts
git commit -m "Surface assigned_to/submitted_at/submitted_by on ACVHistoryEntry"
```

---

## Task 3: Service-role client + role/profile helpers + admin guard

The plumbing every server route and role-aware page will use.

**Files:**
- Create: `src/lib/supabase/service.ts`
- Create: `src/lib/supabase/profiles.ts`
- Create: `src/lib/supabase/site-settings.ts`
- Create: `src/lib/auth/require-admin.ts`

- [ ] **Step 1: service.ts — server-side client with SUPABASE_SERVICE_ROLE_KEY**

Path: `src/lib/supabase/service.ts`

```typescript
import { createClient } from '@supabase/supabase-js'

// Server-only. NEVER import from a client component. Uses the service role
// key which bypasses RLS. Every route that uses this must first validate
// the caller's role via require-admin or its own workflow-specific check.
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_URL) is missing')
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
```

- [ ] **Step 2: profiles.ts — types + server helper + client hook**

Path: `src/lib/supabase/profiles.ts`

```typescript
import { createClient as createBrowserClient } from './client'
import { useEffect, useState } from 'react'

export type Role = 'admin' | 'appraiser'

export interface Profile {
  id: string
  email: string
  name: string
  role: Role
  createdAt: string
  updatedAt: string
}

interface ProfileRow {
  id: string
  email: string
  name: string
  role: Role
  created_at: string
  updated_at: string
}

function rowToProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function fetchCurrentProfileBrowser(): Promise<Profile | null> {
  const supabase = createBrowserClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()
  if (error) {
    console.error('fetchCurrentProfileBrowser failed:', error)
    return null
  }
  return data ? rowToProfile(data as ProfileRow) : null
}

export async function fetchAllProfilesBrowser(): Promise<Profile[]> {
  const supabase = createBrowserClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('name', { ascending: true })
  if (error) {
    console.error('fetchAllProfilesBrowser failed:', error)
    return []
  }
  return (data as ProfileRow[]).map(rowToProfile)
}

// Session-scoped cache so multiple components share one fetch.
let cache: { profile: Profile | null; loadedAt: number } | null = null

export function useCurrentProfile(): { profile: Profile | null; loading: boolean; refresh: () => void } {
  const [profile, setProfile] = useState<Profile | null>(cache?.profile ?? null)
  const [loading, setLoading] = useState(!cache)

  const load = () => {
    setLoading(true)
    fetchCurrentProfileBrowser().then(p => {
      cache = { profile: p, loadedAt: Date.now() }
      setProfile(p)
      setLoading(false)
    })
  }

  useEffect(() => {
    if (!cache) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { profile, loading, refresh: () => { cache = null; load() } }
}
```

- [ ] **Step 3: site-settings.ts — read/write helpers**

Path: `src/lib/supabase/site-settings.ts`

```typescript
import { createClient as createBrowserClient } from './client'

export type SiteSettingsKey = 'allow_regular_create_claims'

export async function fetchSiteSetting<T>(key: SiteSettingsKey): Promise<T | null> {
  const supabase = createBrowserClient()
  const { data, error } = await supabase
    .from('site_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle()
  if (error) {
    console.error('fetchSiteSetting failed:', error)
    return null
  }
  return data ? (data.value as T) : null
}
```

- [ ] **Step 4: require-admin.ts — server helper for API routes**

Path: `src/lib/auth/require-admin.ts`

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { Role } from '@/lib/supabase/profiles'

interface CallerContext {
  userId: string
  role: Role
}

// Reads the session from cookies (via @supabase/ssr), then reads the caller's
// profile row. Returns { caller } on success or { errorResponse } on failure.
// Use for API routes that require the caller to be authenticated + admin.
export async function requireAdmin(): Promise<
  { caller: CallerContext; errorResponse: null } | { caller: null; errorResponse: NextResponse }
> {
  const authed = await getCaller()
  if (!authed.caller) return { caller: null, errorResponse: authed.errorResponse! }
  if (authed.caller.role !== 'admin') {
    return { caller: null, errorResponse: NextResponse.json({ error: 'Admin only' }, { status: 403 }) }
  }
  return { caller: authed.caller, errorResponse: null }
}

// Same but any authenticated caller passes (used by /api/profile).
export async function requireAuth(): Promise<
  { caller: CallerContext; errorResponse: null } | { caller: null; errorResponse: NextResponse }
> {
  return getCaller()
}

async function getCaller(): Promise<
  { caller: CallerContext; errorResponse: null } | { caller: null; errorResponse: NextResponse }
> {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() { /* API routes never set cookies via this path */ },
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { caller: null, errorResponse: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) }
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile) {
    return { caller: null, errorResponse: NextResponse.json({ error: 'No profile' }, { status: 403 }) }
  }
  return { caller: { userId: profile.id, role: profile.role as Role }, errorResponse: null }
}
```

- [ ] **Step 5: Type-check + commit**

```
npx tsc --noEmit
git add src/lib/supabase/service.ts src/lib/supabase/profiles.ts src/lib/supabase/site-settings.ts src/lib/auth/require-admin.ts
git commit -m "Add role helpers: service client, profile hook, require-admin"
```

---

## Task 4: Admin API — users CRUD

**Files:**
- Create: `src/app/api/admin/users/route.ts` (POST create)
- Create: `src/app/api/admin/users/[id]/route.ts` (PATCH update / DELETE)

- [ ] **Step 1: POST /api/admin/users**

Path: `src/app/api/admin/users/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const { errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const body = await request.json().catch(() => null) as {
    email?: string; name?: string; password?: string; role?: 'admin' | 'appraiser'
  } | null

  if (!body?.email || !body.password || !body.role) {
    return NextResponse.json({ error: 'email, password, and role are required' }, { status: 400 })
  }
  if (!['admin', 'appraiser'].includes(body.role)) {
    return NextResponse.json({ error: 'role must be admin or appraiser' }, { status: 400 })
  }

  const service = createServiceClient()

  // Create the auth user. email_confirm=true skips the email verification loop
  // since the admin is setting the password directly.
  const { data: created, error: createErr } = await service.auth.admin.createUser({
    email: body.email,
    password: body.password,
    email_confirm: true,
    user_metadata: { name: body.name ?? '' },
  })
  if (createErr || !created?.user) {
    return NextResponse.json({ error: createErr?.message ?? 'Create user failed' }, { status: 400 })
  }

  // The on_auth_user_created trigger already inserted a profiles row with
  // role='appraiser'. Update it to the requested role + name.
  const { error: updErr } = await service
    .from('profiles')
    .update({ name: body.name ?? '', role: body.role, updated_at: new Date().toISOString() })
    .eq('id', created.user.id)
  if (updErr) {
    console.error('Failed to set profile role/name after create:', updErr)
    return NextResponse.json({ error: 'User created but profile update failed' }, { status: 500 })
  }

  return NextResponse.json({ id: created.user.id })
}
```

- [ ] **Step 2: PATCH + DELETE /api/admin/users/[id]**

Path: `src/app/api/admin/users/[id]/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const { id } = await params
  const body = await request.json().catch(() => null) as { name?: string; role?: 'admin' | 'appraiser' } | null
  if (!body || (body.name === undefined && body.role === undefined)) {
    return NextResponse.json({ error: 'name and/or role is required' }, { status: 400 })
  }
  if (body.role !== undefined && !['admin', 'appraiser'].includes(body.role)) {
    return NextResponse.json({ error: 'role must be admin or appraiser' }, { status: 400 })
  }

  const service = createServiceClient()
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.name !== undefined) patch.name = body.name
  if (body.role !== undefined) patch.role = body.role

  const { error } = await service.from('profiles').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { caller, errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const { id } = await params
  if (id === caller!.userId) {
    return NextResponse.json({ error: 'Admins cannot delete themselves' }, { status: 400 })
  }

  const service = createServiceClient()
  const { error } = await service.auth.admin.deleteUser(id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  // profiles cascades via ON DELETE CASCADE. Existing claims' assigned_to
  // becomes null via ON DELETE SET NULL.
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Verify + commit**

```
npx tsc --noEmit && npm run build 2>&1 | grep -E "(error|Compiled)" | head -3
git add src/app/api/admin/users/
git commit -m "Add /api/admin/users CRUD (service-role guarded by admin session)"
```

---

## Task 5: Admin API — site settings

**Files:**
- Create: `src/app/api/admin/site-settings/route.ts`

- [ ] **Step 1: PATCH /api/admin/site-settings**

Path: `src/app/api/admin/site-settings/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

const ALLOWED_KEYS = new Set(['allow_regular_create_claims'])

export async function PATCH(request: NextRequest) {
  const { caller, errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const body = await request.json().catch(() => null) as { key?: string; value?: unknown } | null
  if (!body?.key || body.value === undefined) {
    return NextResponse.json({ error: 'key and value are required' }, { status: 400 })
  }
  if (!ALLOWED_KEYS.has(body.key)) {
    return NextResponse.json({ error: `Unknown key: ${body.key}` }, { status: 400 })
  }

  const service = createServiceClient()
  const { error } = await service
    .from('site_settings')
    .upsert({
      key: body.key,
      value: body.value,
      updated_at: new Date().toISOString(),
      updated_by: caller!.userId,
    }, { onConflict: 'key' })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Verify + commit**

```
npx tsc --noEmit && npm run build 2>&1 | grep -E "(error|Compiled)" | head -3
git add src/app/api/admin/site-settings/
git commit -m "Add /api/admin/site-settings PATCH (admin only)"
```

---

## Task 6: Claim workflow APIs (assign / submit / send-back / approve / reopen)

Five routes, one shared pattern. Each validates caller identity, verifies workflow legality (right role + right state), then uses service_role to write.

**Files:**
- Create: `src/app/api/claims/[id]/assign/route.ts`
- Create: `src/app/api/claims/[id]/submit/route.ts`
- Create: `src/app/api/claims/[id]/send-back/route.ts`
- Create: `src/app/api/claims/[id]/approve/route.ts`
- Create: `src/app/api/claims/[id]/reopen/route.ts`

- [ ] **Step 1: Small shared helper — fetchClaimForWorkflow**

Add to `src/lib/auth/require-admin.ts` (extends the existing file):

```typescript
// Add at end of require-admin.ts
import { createServiceClient } from '@/lib/supabase/service'

export interface WorkflowClaim {
  id: string
  status: 'open' | 'closed'
  assignedTo: string | null
  submittedAt: string | null
  userId: string
}

export async function fetchClaim(id: string): Promise<WorkflowClaim | null> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('acv_history')
    .select('id, status, assigned_to, submitted_at, user_id')
    .eq('id', id)
    .maybeSingle()
  if (error || !data) return null
  return {
    id: data.id,
    status: (data.status === 'closed' ? 'closed' : 'open'),
    assignedTo: data.assigned_to,
    submittedAt: data.submitted_at,
    userId: data.user_id,
  }
}
```

- [ ] **Step 2: POST /api/claims/[id]/assign (admin only)**

Path: `src/app/api/claims/[id]/assign/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const { id } = await params
  const body = await request.json().catch(() => null) as { assignedTo?: string | null } | null
  if (body === null || (body.assignedTo !== null && typeof body.assignedTo !== 'string')) {
    return NextResponse.json({ error: 'assignedTo (uuid string or null) required' }, { status: 400 })
  }

  const service = createServiceClient()
  const { error } = await service
    .from('acv_history')
    .update({ assigned_to: body.assignedTo })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: POST /api/claims/[id]/submit (appraiser own claim OR admin)**

Path: `src/app/api/claims/[id]/submit/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth, fetchClaim } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { caller, errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse

  const { id } = await params
  const claim = await fetchClaim(id)
  if (!claim) return NextResponse.json({ error: 'Claim not found' }, { status: 404 })
  if (claim.status !== 'open') return NextResponse.json({ error: 'Claim is not open' }, { status: 400 })
  if (claim.submittedAt) return NextResponse.json({ error: 'Claim already submitted' }, { status: 400 })

  const isAdmin = caller!.role === 'admin'
  const isAssignee = claim.assignedTo === caller!.userId
  if (!isAdmin && !isAssignee) {
    return NextResponse.json({ error: 'Not authorized to submit this claim' }, { status: 403 })
  }

  const service = createServiceClient()
  const { error } = await service
    .from('acv_history')
    .update({ submitted_at: new Date().toISOString(), submitted_by: caller!.userId })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: POST /api/claims/[id]/send-back (admin only, submitted claim)**

Path: `src/app/api/claims/[id]/send-back/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin, fetchClaim } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const { id } = await params
  const claim = await fetchClaim(id)
  if (!claim) return NextResponse.json({ error: 'Claim not found' }, { status: 404 })
  if (!claim.submittedAt) return NextResponse.json({ error: 'Claim is not submitted' }, { status: 400 })

  const service = createServiceClient()
  const { error } = await service
    .from('acv_history')
    .update({ submitted_at: null, submitted_by: null })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 5: POST /api/claims/[id]/approve (admin only, submitted claim)**

Path: `src/app/api/claims/[id]/approve/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin, fetchClaim } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const { id } = await params
  const claim = await fetchClaim(id)
  if (!claim) return NextResponse.json({ error: 'Claim not found' }, { status: 404 })
  if (!claim.submittedAt) return NextResponse.json({ error: 'Claim is not submitted' }, { status: 400 })

  const service = createServiceClient()
  // Approve = set status=closed. Leave submitted_at/by set for audit trail.
  const { error } = await service
    .from('acv_history')
    .update({ status: 'closed' })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 6: POST /api/claims/[id]/reopen (admin only, closed claim)**

Path: `src/app/api/claims/[id]/reopen/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin, fetchClaim } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const { id } = await params
  const claim = await fetchClaim(id)
  if (!claim) return NextResponse.json({ error: 'Claim not found' }, { status: 404 })
  if (claim.status !== 'closed') return NextResponse.json({ error: 'Claim is not closed' }, { status: 400 })

  const service = createServiceClient()
  const { error } = await service
    .from('acv_history')
    .update({ status: 'open', submitted_at: null, submitted_by: null })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 7: Verify + commit**

```
npx tsc --noEmit && npm run build 2>&1 | grep -E "(error|Compiled)" | head -3
git add src/lib/auth/require-admin.ts src/app/api/claims/
git commit -m "Add claim workflow API routes: assign/submit/send-back/approve/reopen"
```

---

## Task 7: /api/profile + /profile page

**Files:**
- Create: `src/app/api/profile/route.ts`
- Create: `src/app/profile/page.tsx`

- [ ] **Step 1: PATCH /api/profile**

Path: `src/app/api/profile/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'

// Any authenticated user can update their own name. Uses the caller's session
// (not service role) — the profiles_update_self RLS policy enforces id=auth.uid()
// and the profiles_role_guard trigger prevents role/email changes.
export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null) as { name?: string } | null
  if (body?.name === undefined) {
    return NextResponse.json({ error: 'name required' }, { status: 400 })
  }
  if (body.name.length > 200) {
    return NextResponse.json({ error: 'name too long' }, { status: 400 })
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() { /* no-op */ },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { error } = await supabase
    .from('profiles')
    .update({ name: body.name, updated_at: new Date().toISOString() })
    .eq('id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: /profile page — name + password form**

Path: `src/app/profile/page.tsx`

```typescript
"use client"

import { useState } from 'react'
import { useCurrentProfile } from '@/lib/supabase/profiles'
import { createClient } from '@/lib/supabase/client'
import { AppHeader } from '@/components/app-header'
import { Button } from '@/components/ui/button'

export default function ProfilePage() {
  const { profile, loading, refresh } = useCurrentProfile()
  const [name, setName] = useState('')
  const [savedName, setSavedName] = useState(false)
  const [nameErr, setNameErr] = useState<string | null>(null)

  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwMessage, setPwMessage] = useState<string | null>(null)
  const [pwErr, setPwErr] = useState<string | null>(null)

  const email = profile?.email ?? ''
  const displayName = profile?.name ?? ''

  const saveName = async () => {
    setNameErr(null)
    setSavedName(false)
    const value = (name || displayName).trim()
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: value }),
    })
    if (!res.ok) {
      const b = await res.json().catch(() => ({}))
      setNameErr(b.error ?? 'Save failed')
      return
    }
    setSavedName(true)
    refresh()
  }

  const changePassword = async () => {
    setPwErr(null)
    setPwMessage(null)
    if (newPw.length < 8) { setPwErr('New password must be 8+ characters'); return }
    if (newPw !== confirmPw) { setPwErr('New passwords do not match'); return }
    const supabase = createClient()
    // Re-authenticate with current password to prove ownership.
    if (!email) { setPwErr('No email on profile'); return }
    const { error: reauthErr } = await supabase.auth.signInWithPassword({ email, password: currentPw })
    if (reauthErr) { setPwErr('Current password is incorrect'); return }
    const { error } = await supabase.auth.updateUser({ password: newPw })
    if (error) { setPwErr(error.message); return }
    setPwMessage('Password updated')
    setCurrentPw(''); setNewPw(''); setConfirmPw('')
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <AppHeader />
      <main className="max-w-2xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold mb-6">Profile</h1>
        {loading ? (
          <p className="text-gray-500">Loading…</p>
        ) : (
          <div className="space-y-8">
            <section className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
              <h2 className="text-lg font-semibold">Name</h2>
              <div>
                <label className="text-xs text-gray-500">Email</label>
                <div className="text-sm text-gray-700 mt-1">{email}</div>
              </div>
              <div>
                <label className="text-xs text-gray-500">Display name</label>
                <input
                  className="w-full mt-1 bg-white border border-gray-200 rounded-md px-3 py-2 text-sm"
                  defaultValue={displayName}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                />
              </div>
              {nameErr && <div className="text-red-600 text-sm">{nameErr}</div>}
              {savedName && <div className="text-green-700 text-sm">Saved</div>}
              <Button onClick={saveName} className="bg-blue-600 text-white">Save Name</Button>
            </section>

            <section className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
              <h2 className="text-lg font-semibold">Password</h2>
              <input type="password" placeholder="Current password"
                     className="w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-sm"
                     value={currentPw} onChange={e => setCurrentPw(e.target.value)} />
              <input type="password" placeholder="New password (8+ chars)"
                     className="w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-sm"
                     value={newPw} onChange={e => setNewPw(e.target.value)} />
              <input type="password" placeholder="Confirm new password"
                     className="w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-sm"
                     value={confirmPw} onChange={e => setConfirmPw(e.target.value)} />
              {pwErr && <div className="text-red-600 text-sm">{pwErr}</div>}
              {pwMessage && <div className="text-green-700 text-sm">{pwMessage}</div>}
              <Button onClick={changePassword} className="bg-blue-600 text-white">Change Password</Button>
            </section>
          </div>
        )}
      </main>
    </div>
  )
}
```

- [ ] **Step 3: Verify + commit**

```
npx tsc --noEmit && npm run build 2>&1 | grep -E "(error|Compiled)" | head -3
git add src/app/api/profile/ src/app/profile/
git commit -m "Add /profile page (name + password) + PATCH /api/profile"
```

---

## Task 8: Header profile dropdown + admin nav link

**Files:**
- Modify: `src/components/app-header.tsx`

- [ ] **Step 1: Replace the plain email span with a dropdown**

Full file replacement (the existing file is 59 lines):

```typescript
"use client"

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { ChevronDown, User as UserIcon, Shield, LogOut } from 'lucide-react'
import { LogoutButton } from '@/components/logout-button'
import { useCurrentProfile } from '@/lib/supabase/profiles'

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/' },
  { label: 'All Claims', href: '/claims' },
  { label: 'Reports', href: '/reports' },
  { label: 'Rules / Laws', href: '/rules-laws' },
]

export function AppHeader() {
  const pathname = usePathname()
  const { profile } = useCurrentProfile()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const displayLabel = profile?.name || profile?.email || ''

  return (
    <header className="no-print border-b border-gray-800 bg-gray-950 shadow-sm sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-8">
        <Link href="/"><Image src="/logo.png" alt="Modern Appraisers" width={160} height={48} className="h-9 w-auto" priority /></Link>
        <nav className="flex items-center gap-6">
          {NAV_ITEMS.map(item => {
            const active = item.href === '/'
              ? pathname === '/' || pathname.startsWith('/claims/')
              : item.href === '/claims'
              ? pathname === '/claims'
              : pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`text-sm font-medium transition-colors ${active ? 'text-white' : 'text-gray-400 hover:text-white'}`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {displayLabel && (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(o => !o)}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-white px-2 py-1 rounded transition-colors"
              >
                {displayLabel}
                <ChevronDown className="w-3 h-3" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-20">
                  <Link href="/profile" onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100">
                    <UserIcon className="w-4 h-4" /> Profile
                  </Link>
                  {profile?.role === 'admin' && (
                    <Link href="/admin/users" onClick={() => setMenuOpen(false)}
                          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100">
                      <Shield className="w-4 h-4" /> Admin
                    </Link>
                  )}
                  <div className="border-t border-gray-100 my-1" />
                  <div className="px-3 py-1">
                    <LogoutButton />
                  </div>
                </div>
              )}
            </div>
          )}
          {!displayLabel && <LogoutButton />}
        </div>
      </div>
    </header>
  )
}
```

- [ ] **Step 2: Verify + commit**

```
npx tsc --noEmit && npm run build 2>&1 | grep -E "(error|Compiled)" | head -3
git add src/components/app-header.tsx
git commit -m "Add header profile dropdown with admin link (role-aware)"
```

---

## Task 9: Admin pages — /admin/users + /admin/settings

**Files:**
- Create: `src/app/admin/page.tsx` (redirect to /admin/users)
- Create: `src/app/admin/users/page.tsx`
- Create: `src/app/admin/settings/page.tsx`
- Create: `src/app/admin/_guard.tsx` — small server helper for the pages to 404 non-admins

- [ ] **Step 1: Server-side admin guard**

Path: `src/app/admin/_guard.tsx`

```typescript
import { notFound } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Server component only. Renders nothing when the caller is admin; calls
// notFound() (404) otherwise. Use as a first-line guard in every /admin/* page.
export async function AdminGuard() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()
  const { data } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (!data || data.role !== 'admin') notFound()
  return null
}
```

- [ ] **Step 2: /admin (redirects to /admin/users)**

Path: `src/app/admin/page.tsx`

```typescript
import { redirect } from 'next/navigation'
export default function AdminIndex() { redirect('/admin/users') }
```

- [ ] **Step 3: /admin/users page (client component wrapped by server guard)**

Path: `src/app/admin/users/page.tsx`

```typescript
import { AppHeader } from '@/components/app-header'
import { AdminGuard } from '../_guard'
import { UsersAdminClient } from './users-admin-client'

export default async function AdminUsersPage() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Renders notFound() (404) for non-admins before the client component mounts */}
      <AdminGuard />
      <AppHeader />
      <main className="max-w-5xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold mb-6">Users</h1>
        <UsersAdminClient />
      </main>
    </div>
  )
}
```

Path: `src/app/admin/users/users-admin-client.tsx`

```typescript
"use client"

import { useEffect, useState } from 'react'
import { Trash2, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { fetchAllProfilesBrowser, type Profile, type Role } from '@/lib/supabase/profiles'

export function UsersAdminClient() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setProfiles(await fetchAllProfilesBrowser())
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const changeRole = async (id: string, role: Role) => {
    setError(null)
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    })
    if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.error ?? 'Failed'); return }
    load()
  }
  const changeName = async (id: string, name: string) => {
    setError(null)
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.error ?? 'Failed'); return }
    load()
  }
  const remove = async (id: string) => {
    if (!confirm('Delete this user? They lose access immediately and any claims assigned to them become Unassigned.')) return
    setError(null)
    const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' })
    if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.error ?? 'Failed'); return }
    load()
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-500">
          {loading ? 'Loading…' : `${profiles.length} user${profiles.length === 1 ? '' : 's'}`}
        </div>
        <Button onClick={() => setShowAdd(true)} className="bg-blue-600 text-white gap-2">
          <Plus className="w-4 h-4" /> Add User
        </Button>
      </div>

      {error && <div className="p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Email</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map(p => (
              <tr key={p.id} className="border-b border-gray-100">
                <td className="px-4 py-3">
                  <input
                    className="bg-transparent border-0 border-b border-transparent hover:border-gray-200 focus:border-blue-500 focus:outline-none px-1 py-0.5 text-sm text-gray-800 w-full"
                    defaultValue={p.name}
                    onBlur={(e) => { if (e.target.value !== p.name) changeName(p.id, e.target.value) }}
                  />
                </td>
                <td className="px-4 py-3 text-gray-600">{p.email}</td>
                <td className="px-4 py-3">
                  <select
                    className="bg-white border border-gray-200 rounded px-2 py-1 text-sm"
                    value={p.role}
                    onChange={(e) => changeRole(p.id, e.target.value as Role)}
                  >
                    <option value="appraiser">Appraiser</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => remove(p.id)} className="text-gray-400 hover:text-red-600" title="Delete user">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && <AddUserModal onClose={() => { setShowAdd(false); load() }} />}
    </div>
  )
}

function AddUserModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('appraiser')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setErr(null)
    if (!email || !password) { setErr('Email and password are required'); return }
    if (password.length < 8) { setErr('Password must be 8+ characters'); return }
    setBusy(true)
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name, password, role }),
    })
    setBusy(false)
    if (!res.ok) { const b = await res.json().catch(() => ({})); setErr(b.error ?? 'Create failed'); return }
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Add User</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>
        <input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
               className="w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-sm" />
        <input placeholder="Name" value={name} onChange={e => setName(e.target.value)}
               className="w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-sm" />
        <input placeholder="Password (8+ chars)" type="password" value={password} onChange={e => setPassword(e.target.value)}
               className="w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-sm" />
        <select value={role} onChange={e => setRole(e.target.value as Role)}
                className="w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-sm">
          <option value="appraiser">Appraiser</option>
          <option value="admin">Admin</option>
        </select>
        {err && <div className="text-red-600 text-sm">{err}</div>}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} variant="outline">Cancel</Button>
          <Button onClick={submit} disabled={busy} className="bg-blue-600 text-white">
            {busy ? 'Creating…' : 'Create User'}
          </Button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: /admin/settings page**

Path: `src/app/admin/settings/page.tsx`

```typescript
import { AppHeader } from '@/components/app-header'
import { AdminGuard } from '../_guard'
import { SettingsAdminClient } from './settings-admin-client'

export default async function AdminSettingsPage() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <AdminGuard />
      <AppHeader />
      <main className="max-w-3xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold mb-6">Site Settings</h1>
        <SettingsAdminClient />
      </main>
    </div>
  )
}
```

Path: `src/app/admin/settings/settings-admin-client.tsx`

```typescript
"use client"

import { useEffect, useState } from 'react'
import { fetchSiteSetting } from '@/lib/supabase/site-settings'

export function SettingsAdminClient() {
  const [allowCreate, setAllowCreate] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetchSiteSetting<boolean>('allow_regular_create_claims').then(v => setAllowCreate(v ?? true))
  }, [])

  const set = async (value: boolean) => {
    setError(null); setSaved(false)
    const prev = allowCreate
    setAllowCreate(value) // optimistic
    const res = await fetch('/api/admin/site-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'allow_regular_create_claims', value }),
    })
    if (!res.ok) {
      setAllowCreate(prev) // revert
      const b = await res.json().catch(() => ({}))
      setError(b.error ?? 'Save failed')
      return
    }
    setSaved(true)
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
      <div className="flex items-start justify-between gap-6">
        <div>
          <div className="text-base font-semibold text-gray-900">Allow appraisers to create claims</div>
          <p className="text-sm text-gray-500 mt-1">
            When off, only admins can create new claims. Enforced server-side (RLS) — hiding
            the button is not the only guard.
          </p>
        </div>
        <button
          onClick={() => allowCreate !== null && set(!allowCreate)}
          disabled={allowCreate === null}
          className={`shrink-0 mt-1 relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            allowCreate ? 'bg-blue-600' : 'bg-gray-300'
          }`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            allowCreate ? 'translate-x-6' : 'translate-x-1'
          }`} />
        </button>
      </div>
      {error && <div className="text-red-600 text-sm">{error}</div>}
      {saved && <div className="text-green-700 text-sm">Saved</div>}
    </div>
  )
}
```

- [ ] **Step 5: Verify + commit**

```
npx tsc --noEmit && npm run build 2>&1 | grep -E "(error|Compiled)" | head -3
git add src/app/admin/
git commit -m "Add /admin/users and /admin/settings pages (admin-only via server guard)"
```

---

## Task 10: Dashboard role-aware + Assigned To column + assign dropdown

**Files:**
- Modify: `src/components/claims-table.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/claims/page.tsx`

- [ ] **Step 1: Extend claims-table with role-aware Assigned To column**

Read the current file first. Modify to accept new props:

```typescript
// Add to props:
adminView?: boolean          // shows Assigned To column + inline dropdown
profiles?: Profile[]         // used to render assignee names + dropdown options
showSubmittedColumn?: boolean // renders Submitted timestamp/name (for admin's Completed Assignments queue)
onAssignmentChanged?: () => void
```

Import `Profile` type from `@/lib/supabase/profiles`.

Add the Assigned To column when `adminView === true`. In each row's cell, render a `<select>` populated with `profiles` + an "Unassigned" option. On change, POST to `/api/claims/[id]/assign` with body `{ assignedTo: value || null }`; on success call `onAssignmentChanged?.()`.

Add the Submitted column when `showSubmittedColumn === true`. Render `${fmtDate(submittedAt)} — ${profiles.find(p => p.id === submittedBy)?.name ?? 'Unknown'}` when present.

Row click still routes to the claim workspace.

- [ ] **Step 2: Dashboard admin view — Open Claims + Completed Assignments cards**

Rewrite `src/app/page.tsx`:

```typescript
"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { MigrateData } from "@/components/migrate-data"
import { AppHeader } from "@/components/app-header"
import { ClaimsTable } from "@/components/claims-table"
import { fetchACVHistory, type ACVHistoryEntry } from '@/lib/supabase/history'
import { useCurrentProfile, fetchAllProfilesBrowser, type Profile } from '@/lib/supabase/profiles'
import { fetchSiteSetting } from '@/lib/supabase/site-settings'

export default function DashboardPage() {
  const router = useRouter()
  const { profile } = useCurrentProfile()
  const [entries, setEntries] = useState<ACVHistoryEntry[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [fetchError, setFetchError] = useState(false)
  const [allowCreate, setAllowCreate] = useState(true)

  const load = async () => {
    const [claims, profs, gate] = await Promise.all([
      fetchACVHistory(),
      fetchAllProfilesBrowser(),
      fetchSiteSetting<boolean>('allow_regular_create_claims'),
    ])
    if (claims === null) setFetchError(true); else setEntries(claims)
    setProfiles(profs)
    setAllowCreate(gate ?? true)
  }
  useEffect(() => { load() }, [])

  const isAdmin = profile?.role === 'admin'
  const openClaims = entries.filter(e => e.status !== 'closed' && !e.submittedAt)
  const submittedClaims = entries.filter(e => e.status !== 'closed' && !!e.submittedAt)
  const canCreate = isAdmin || allowCreate

  const startNewClaim = () => {
    localStorage.removeItem('modern-tools-comp-finder-draft')
    localStorage.removeItem('modern-tools-auto-acv-draft')
    sessionStorage.removeItem('modern-tools-comp-finder-draft')
    sessionStorage.removeItem('modern-tools-auto-acv-draft')
    sessionStorage.removeItem('modern-tools-acv-edit')
    router.push('/claims/new')
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <MigrateData />
      <AppHeader />
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
            <p className="text-sm text-gray-400">{openClaims.length} open</p>
          </div>
          {canCreate && (
            <button
              onClick={startNewClaim}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold px-5 py-2.5 rounded-lg transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              New Claim
            </button>
          )}
        </div>

        {fetchError && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            Could not load claims from the database. Check your connection, then refresh.
          </div>
        )}

        {/* Open Claims card */}
        <section>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Open Claims</h3>
          <ClaimsTable
            entries={openClaims}
            onDeleted={(id) => setEntries(prev => prev.filter(e => e.id !== id))}
            emptyText={isAdmin ? 'No open claims.' : 'No claims assigned to you.'}
            adminView={isAdmin}
            profiles={profiles}
            onAssignmentChanged={load}
          />
        </section>

        {/* Completed Assignments (admin only) */}
        {isAdmin && (
          <section>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Completed Assignments</h3>
            {submittedClaims.length === 0 ? (
              <div className="text-sm text-gray-400 italic">No completed assignments to review.</div>
            ) : (
              <ClaimsTable
                entries={submittedClaims}
                onDeleted={(id) => setEntries(prev => prev.filter(e => e.id !== id))}
                emptyText=""
                adminView
                profiles={profiles}
                showSubmittedColumn
                onAssignmentChanged={load}
              />
            )}
          </section>
        )}
      </main>
    </div>
  )
}
```

- [ ] **Step 3: Update /claims (All Claims)**

Modify `src/app/claims/page.tsx`: fetch profiles, pass `adminView` + `profiles` to `<ClaimsTable />`. RLS already scopes rows to appraisers.

- [ ] **Step 4: Verify + commit**

```
npx tsc --noEmit && npm run build 2>&1 | grep -E "(error|Compiled)" | head -3
git add src/app/page.tsx src/app/claims/page.tsx src/components/claims-table.tsx
git commit -m "Dashboard: admin dual-card view, Completed Assignments queue, assign dropdown"
```

---

## Task 11: Claim workspace — Submit/Approve/Send-Back/Reopen + submitted banner

**Files:**
- Modify: `src/components/claim/ClaimWorkspace.tsx`

- [ ] **Step 1: Add role + claim.submitted awareness**

In the workspace component:
- Call `useCurrentProfile()` at the top; derive `role`, `userId`.
- Derive `isAdmin = role === 'admin'`, `isAssignee = claim.assignedTo === userId`, `isSubmitted = !!claim.submittedAt`, `isClosed = status === 'closed'`.
- Read-only mode: `!isAdmin && (isSubmitted || isClosed || !isAssignee)`. When read-only, disable all inputs and hide Save button; skip the auto-save timer.

- [ ] **Step 2: Add the buttons in the top toolbar (next to Save Claim)**

```typescript
// Below the existing Save Claim button, before the download-PDF row:

{/* Appraiser or admin on an open, not-yet-submitted claim */}
{!isSubmitted && !isClosed && (isAssignee || isAdmin) && (
  <Button
    onClick={handleSubmit}
    disabled={workflowBusy}
    className="bg-emerald-600 hover:bg-emerald-500 text-white"
  >
    Submit
  </Button>
)}

{/* Admin on a submitted claim: Approve + Send Back */}
{isAdmin && isSubmitted && !isClosed && (
  <>
    <Button onClick={handleApprove} disabled={workflowBusy} className="bg-emerald-600 hover:bg-emerald-500 text-white">
      Approve
    </Button>
    <Button onClick={handleSendBack} disabled={workflowBusy} variant="outline">
      Send Back
    </Button>
  </>
)}

{/* Admin on a closed claim: Reopen */}
{isAdmin && isClosed && (
  <Button onClick={handleReopen} disabled={workflowBusy} variant="outline">
    Reopen
  </Button>
)}
```

Handlers:

```typescript
const [workflowBusy, setWorkflowBusy] = useState(false)

const callWorkflow = async (path: string, confirmMsg?: string) => {
  if (confirmMsg && !confirm(confirmMsg)) return
  setWorkflowBusy(true)
  const res = await fetch(`/api/claims/${editingId}/${path}`, { method: 'POST' })
  setWorkflowBusy(false)
  if (!res.ok) { const b = await res.json().catch(() => ({})); alert(b.error ?? 'Action failed'); return }
  router.refresh() // reload server data
  // Also refetch the claim so local state updates:
  const fresh = editingId ? await fetchACVEntry(editingId) : null
  if (fresh) hydrateFromEntry(fresh)
}

const handleSubmit    = () => callWorkflow('submit',    'Submit this claim for admin review? You will not be able to edit it after submitting.')
const handleApprove   = () => callWorkflow('approve',   'Approve and close this claim?')
const handleSendBack  = () => callWorkflow('send-back', 'Send this claim back to the appraiser?')
const handleReopen    = () => callWorkflow('reopen',    'Reopen this closed claim?')
```

- [ ] **Step 3: Submitted banner + input disable**

Above the tab bar, when `isSubmitted && !isAdmin`:

```typescript
{isSubmitted && !isAdmin && (
  <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-sm">
    Submitted on {new Date(claim.submittedAt!).toLocaleString()}. Waiting on admin review.
    This claim is read-only until an admin sends it back or approves it.
  </div>
)}
```

Wrap every editable input's `disabled={readOnly}` — for a workspace of this size, use a `<fieldset disabled={readOnly}>` around the tab-content container so every nested input is disabled without touching each one individually.

- [ ] **Step 4: Admin inline assign in the claim header stats row**

Locate the header stats row (`ClaimHeaderStat`s). Add an Assign control visible only to admins:

```typescript
{isAdmin && (
  <div className="flex items-center gap-2 text-xs text-gray-500">
    <span>Assigned to:</span>
    <select
      value={claim.assignedTo ?? ''}
      onChange={async (e) => {
        const val = e.target.value || null
        await fetch(`/api/claims/${editingId}/assign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assignedTo: val }),
        })
        const fresh = editingId ? await fetchACVEntry(editingId) : null
        if (fresh) hydrateFromEntry(fresh)
      }}
      className="bg-white border border-gray-200 rounded px-2 py-1 text-sm"
    >
      <option value="">Unassigned</option>
      {profiles.map(p => <option key={p.id} value={p.id}>{p.name || p.email}</option>)}
    </select>
  </div>
)}
```

Load `profiles` via `fetchAllProfilesBrowser()` inside a `useEffect` (only when `isAdmin`).

- [ ] **Step 5: Verify + commit**

```
npx tsc --noEmit && npm run build 2>&1 | grep -E "(error|Compiled)" | head -3
git add src/components/claim/ClaimWorkspace.tsx
git commit -m "ClaimWorkspace: role-aware Submit/Approve/Send-Back/Reopen + submitted banner"
```

---

## Task 12: /claims/[id] server-side access guard

Prevents an appraiser from URL-hitting a claim they're not assigned to.

**Files:**
- Modify: `src/app/claims/[id]/page.tsx`

- [ ] **Step 1: Add server-side check**

Path: `src/app/claims/[id]/page.tsx` — wrap the existing client component render:

```typescript
import { notFound } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { ClaimWorkspace } from '@/components/claim/ClaimWorkspace'

export default async function ClaimPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (id === 'new') return <ClaimWorkspace editingId={null} />

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  const isAdmin = profile?.role === 'admin'

  // Admins skip the ownership check; appraisers must be the assignee.
  if (!isAdmin) {
    const { data: claim } = await supabase
      .from('acv_history')
      .select('assigned_to')
      .eq('id', id)
      .maybeSingle()
    // RLS already filters this — if the appraiser can't see the row, `claim` is null.
    if (!claim || claim.assigned_to !== user.id) notFound()
  }

  return <ClaimWorkspace editingId={id} />
}
```

Note: this depends on `ClaimWorkspace` accepting an `editingId` prop. If it currently reads it from the URL params directly, add the prop and pass through.

- [ ] **Step 2: Verify + commit**

```
npx tsc --noEmit && npm run build 2>&1 | grep -E "(error|Compiled)" | head -3
git add src/app/claims/[id]/page.tsx
git commit -m "Guard /claims/[id] server-side: 404 for appraisers on non-assigned claims"
```

---

## Task 13: End-to-end verify + deploy + SESSIONS log

Nothing new to build — final verification, deploy, and the session log entry.

- [ ] **Step 1: Full local verification**

```
npx tsc --noEmit
npm run lint
npm run build
```

All must be clean. Any NEW warnings must be addressed (pre-existing warnings from other files are OK).

- [ ] **Step 2: Confirm Henry has completed the two out-of-band steps**

Check with Henry:
- [ ] `supabase-migration-roles.sql` has been executed in Supabase SQL Editor. Verification row-count query at the end of the file printed:
  - `acv_history rows` matches pre-migration count (should still be ~390).
  - `admin profiles` = 1.
  - `site_settings rows` = 1.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` has been added to Vercel Production environment (from Supabase Dashboard → Project Settings → API → `service_role`).

If either step is not done, STOP — don't deploy.

- [ ] **Step 3: Capture current live deploy for rollback**

```
npx vercel inspect modern-tools-rho.vercel.app --scope henry-as-projects-88caed67
```

Note the deploy id for the rollback command.

- [ ] **Step 4: Deploy**

```
npx vercel --prod --scope henry-as-projects-88caed67 --yes
```

- [ ] **Step 5: Verify alias flipped**

```
npx vercel inspect modern-tools-rho.vercel.app --scope henry-as-projects-88caed67
```

Alias should point to the new deploy id from Step 4.

- [ ] **Step 6: Update `docs/SESSIONS.md`**

Prepend a new entry describing:
- What was built: role-based access (admin + appraiser), assignment, submit workflow, user management, site-settings toggle
- Files created / modified
- Deploy id + alias verification
- Rollback URL (Vercel promote) AND rollback SQL (`supabase-migration-roles-rollback.sql`)
- Known limitations: no email invites (admin-set passwords only), no notifications on assign/submit/send-back, session cache staleness on role change (cosmetic)
- Next: Henry validates by creating a test appraiser account, assigning a claim, and running the full submit → approve loop.

- [ ] **Step 7: Commit**

```
git add docs/SESSIONS.md
git commit -m "SESSIONS: Log role-based access rollout"
```

---

## Self-review checklist (post-plan)

Reviewed after writing all tasks:

1. **Spec coverage.** Every spec section maps to a task:
   - §3 (data model) → Task 1 (all schema in the migration file)
   - §4 (RLS) → Task 1 (policies + triggers)
   - §5 (server routes) → Tasks 3 (helpers) + 4 (admin users) + 5 (site settings) + 6 (workflow)
   - §6 (rollout) → Task 1 + Task 13
   - §7 (UI) → Task 8 (header) + Task 7 (profile) + Task 9 (admin pages) + Task 10 (dashboard) + Task 11 (workspace) + Task 12 (access guard)
   - §8 (files touched) → cross-checked; all listed files are created or modified.
   - §9 (verification plan) → Task 13.
   - §10-12 (risks, alternatives, sequencing) → design context; Task 13 addresses rollback + limitations.
2. **Placeholder scan.** No TBDs, no "handle edge cases," no "similar to Task N without repeating code." Each API route has full body. Each SQL statement is complete.
3. **Type consistency.**
   - `Role = 'admin' | 'appraiser'` — used consistently across profiles.ts, require-admin.ts, admin API routes, dashboard, workspace.
   - `Profile` interface (id, email, name, role, createdAt, updatedAt) — same shape everywhere.
   - `ACVHistoryEntry.assignedTo/submittedAt/submittedBy` — added in Task 2, referenced in Tasks 10, 11, 12.
   - `WorkflowClaim` interface in require-admin.ts — used by Tasks 6's routes.
   - Site-settings key `allow_regular_create_claims` — same string in SQL, in API validation, in dashboard read.
