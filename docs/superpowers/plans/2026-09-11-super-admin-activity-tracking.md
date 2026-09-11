# Super-admin activity tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a super-admin account (Henry Admin) with same permissions as a regular admin plus one extra capability: viewing per-user active-time analytics for today / this week / this month / last 6 months. Regular admins and appraisers are tracked but see no UI change.

**Architecture:** Additive `is_super_admin` boolean on `profiles`. New `user_activity_daily` table with per-user, per-day active-seconds counters. Client-side heartbeat hook posts to `/api/activity/heartbeat` every 60s while the tab is focused and the user has interacted in the last 2 minutes. Server dedups heartbeats per-minute so multiple tabs don't double-count. New `/admin/settings/activity` route gated by a `SuperAdminGuard`.

**Tech Stack:** Next.js 16, React 19, Supabase (`@supabase/ssr` + `@supabase/supabase-js` service role), Tailwind v4, lucide-react. No test framework — manual verification via SQL, `curl`, `tsc --noEmit`, `npm run build`, and browser checks (per project convention documented in `CLAUDE.md`).

**Spec:** `docs/superpowers/specs/2026-09-11-super-admin-activity-tracking-design.md`

**Deploy order (executed by Henry between tasks):**
1. Run migration in Supabase SQL editor.
2. `node scripts/bootstrap-henry-admin.mjs` from repo root.
3. `npx vercel --prod --scope henry-as-projects-88caed67 --yes` after Task 11.

---

## File map

**New:**
- `supabase/migration-super-admin-activity.sql` — column, table, RLS, trigger extension.
- `supabase/migration-super-admin-activity-rollback.sql` — reverse.
- `scripts/bootstrap-henry-admin.mjs` — one-shot auth-user + profile creation.
- `src/lib/activity/formatters.ts` — `formatHoursMinutes(seconds)`, `formatRelativeTime(iso)`.
- `src/components/activity-heartbeat.tsx` — client-only, mounts the hook.
- `src/app/api/activity/heartbeat/route.ts` — POST, credits one minute.
- `src/app/api/activity/summary/route.ts` — GET, per-user totals.
- `src/app/api/activity/summary/[userId]/route.ts` — GET, last-180-day rows for one user.
- `src/app/admin/settings/activity/page.tsx` — server component with `SuperAdminGuard`.
- `src/app/admin/settings/activity/activity-client.tsx` — table + sort + inactive toggle.
- `src/app/admin/settings/activity/[userId]/page.tsx` — server component with `SuperAdminGuard`.
- `src/app/admin/settings/activity/[userId]/user-activity-client.tsx` — cards + chart + monthly table.

**Modified:**
- `src/lib/supabase/profiles.ts` — add `isSuperAdmin` to `Profile` type + `rowToProfile`.
- `src/lib/auth/require-admin.ts` — extend `getCaller()` to return `isSuperAdmin`; add `requireSuperAdmin()`.
- `src/app/admin/_guard.tsx` — add `SuperAdminGuard()`.
- `src/app/admin/settings/_settings-nav.tsx` — conditionally render Activity item.
- `src/app/layout.tsx` — mount `<ActivityHeartbeat />`.

---

## Task 1: Migration SQL — column, table, RLS, trigger

**Files:**
- Create: `supabase/migration-super-admin-activity.sql`
- Create: `supabase/migration-super-admin-activity-rollback.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migration-super-admin-activity.sql`:

```sql
-- =========================================================================
-- Modern Tools — Super-admin flag + activity tracking (2026-09-11)
-- Run in the Supabase SQL Editor (Dashboard -> SQL Editor).
-- Spec: docs/superpowers/specs/2026-09-11-super-admin-activity-tracking-design.md
-- Reverses cleanly with migration-super-admin-activity-rollback.sql.
--
-- What this does:
--
--  1. Adds profiles.is_super_admin (bool, default false). Additive to the
--     existing 'admin' / 'appraiser' role split. Every existing role check
--     continues to work unchanged. is_super_admin gates exactly one thing:
--     visibility of /admin/settings/activity.
--
--  2. Extends profiles_role_guard so that is_super_admin can ONLY be
--     changed by the service role. Regular admins cannot escalate
--     themselves or others via the admin UI. The check is hoisted above
--     the admin-bypass on purpose.
--
--  3. Creates user_activity_daily — one row per (user, LA-calendar-date)
--     with an active_seconds counter and a last_tick_minute for
--     multi-tab dedup on heartbeat writes.
--
--  4. RLS on user_activity_daily: SELECT allowed for super-admins only;
--     no INSERT/UPDATE/DELETE policy => authenticated role blocked;
--     service role bypasses RLS as usual and does all writes.
-- =========================================================================

-- 1. Column.
alter table public.profiles
  add column if not exists is_super_admin boolean not null default false;

-- 2. Extend profiles_role_guard. is_super_admin check is BEFORE the
--    admin-bypass — admins are not allowed to change it. Same to_jsonb
--    pattern as the existing guard for forward-compat.
create or replace function public.profiles_role_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- is_super_admin: service-role only, regardless of role. Hoisted above admin bypass.
  if auth.role() <> 'service_role' then
    if coalesce((to_jsonb(new)->>'is_super_admin'), '') is distinct from coalesce((to_jsonb(old)->>'is_super_admin'), '') then
      raise exception 'not allowed to change is_super_admin';
    end if;
  end if;
  if auth.role() = 'service_role' then return new; end if;
  if public.is_admin() then return new; end if;
  if new.role  is distinct from old.role  then raise exception 'not allowed to change role'; end if;
  if new.email is distinct from old.email then raise exception 'not allowed to change email'; end if;
  if coalesce((to_jsonb(new)->>'can_reassign_claims'),      '') is distinct from coalesce((to_jsonb(old)->>'can_reassign_claims'),      '') then raise exception 'not allowed to change can_reassign_claims';      end if;
  if coalesce((to_jsonb(new)->>'can_edit_claim_info'),      '') is distinct from coalesce((to_jsonb(old)->>'can_edit_claim_info'),      '') then raise exception 'not allowed to change can_edit_claim_info';      end if;
  if coalesce((to_jsonb(new)->>'can_create_claims'),        '') is distinct from coalesce((to_jsonb(old)->>'can_create_claims'),        '') then raise exception 'not allowed to change can_create_claims';        end if;
  if coalesce((to_jsonb(new)->>'auto_status_requests_override'), '') is distinct from coalesce((to_jsonb(old)->>'auto_status_requests_override'), '') then raise exception 'not allowed to change auto_status_requests_override'; end if;
  if coalesce((to_jsonb(new)->>'is_active'),                '') is distinct from coalesce((to_jsonb(old)->>'is_active'),                '') then raise exception 'not allowed to change is_active';                end if;
  if coalesce((to_jsonb(new)->>'show_in_handling_appraiser_list'), '') is distinct from coalesce((to_jsonb(old)->>'show_in_handling_appraiser_list'), '') then raise exception 'not allowed to change show_in_handling_appraiser_list'; end if;
  return new;
end;
$$;

-- 3. Table.
create table if not exists public.user_activity_daily (
  user_id          uuid        not null references auth.users(id) on delete cascade,
  activity_date    date        not null,
  active_seconds   integer     not null default 0,
  last_tick_minute timestamptz null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (user_id, activity_date)
);

create index if not exists user_activity_daily_date_idx
  on public.user_activity_daily (activity_date);

-- 4. RLS.
alter table public.user_activity_daily enable row level security;

drop policy if exists user_activity_daily_select_super_admin on public.user_activity_daily;
create policy user_activity_daily_select_super_admin on public.user_activity_daily
  for select
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.is_super_admin = true
    )
  );
-- no INSERT/UPDATE/DELETE policies => blocked for authenticated role;
-- service role bypasses RLS.

-- 5. Verification (informational — inspect returned rows).
select 'is_super_admin column exists' as label, count(*) as value
  from information_schema.columns
 where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_super_admin'
union all
select 'user_activity_daily table exists', count(*)
  from information_schema.tables
 where table_schema = 'public' and table_name = 'user_activity_daily'
union all
select 'RLS enabled on user_activity_daily', count(*)
  from pg_tables
 where schemaname = 'public' and tablename = 'user_activity_daily' and rowsecurity = true;

-- Expected: 1, 1, 1.
```

- [ ] **Step 2: Write the rollback**

Create `supabase/migration-super-admin-activity-rollback.sql`:

```sql
-- Rollback for migration-super-admin-activity.sql.
-- Run in Supabase SQL Editor.

-- 1. Drop table + policy.
drop policy if exists user_activity_daily_select_super_admin on public.user_activity_daily;
drop index if exists public.user_activity_daily_date_idx;
drop table if exists public.user_activity_daily;

-- 2. Revert profiles_role_guard to the pre-super-admin version (the
--    handling-appraiser-flag migration's version).
create or replace function public.profiles_role_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'service_role' then return new; end if;
  if public.is_admin() then return new; end if;
  if new.role  is distinct from old.role  then raise exception 'not allowed to change role'; end if;
  if new.email is distinct from old.email then raise exception 'not allowed to change email'; end if;
  if coalesce((to_jsonb(new)->>'can_reassign_claims'),      '') is distinct from coalesce((to_jsonb(old)->>'can_reassign_claims'),      '') then raise exception 'not allowed to change can_reassign_claims';      end if;
  if coalesce((to_jsonb(new)->>'can_edit_claim_info'),      '') is distinct from coalesce((to_jsonb(old)->>'can_edit_claim_info'),      '') then raise exception 'not allowed to change can_edit_claim_info';      end if;
  if coalesce((to_jsonb(new)->>'can_create_claims'),        '') is distinct from coalesce((to_jsonb(old)->>'can_create_claims'),        '') then raise exception 'not allowed to change can_create_claims';        end if;
  if coalesce((to_jsonb(new)->>'auto_status_requests_override'), '') is distinct from coalesce((to_jsonb(old)->>'auto_status_requests_override'), '') then raise exception 'not allowed to change auto_status_requests_override'; end if;
  if coalesce((to_jsonb(new)->>'is_active'),                '') is distinct from coalesce((to_jsonb(old)->>'is_active'),                '') then raise exception 'not allowed to change is_active';                end if;
  if coalesce((to_jsonb(new)->>'show_in_handling_appraiser_list'), '') is distinct from coalesce((to_jsonb(old)->>'show_in_handling_appraiser_list'), '') then raise exception 'not allowed to change show_in_handling_appraiser_list'; end if;
  return new;
end;
$$;

-- 3. Drop the column.
alter table public.profiles drop column if exists is_super_admin;
```

- [ ] **Step 3: Ask Henry to run the migration in Supabase SQL Editor**

Print the message:

> "Migration + rollback written. Please run `supabase/migration-super-admin-activity.sql` in the Supabase SQL Editor. Expected output is `1, 1, 1` (column, table, RLS). Confirm before I proceed to Task 2."

Wait for confirmation. Do NOT proceed to Task 2 until Henry confirms.

- [ ] **Step 4: Commit**

```bash
git add supabase/migration-super-admin-activity.sql supabase/migration-super-admin-activity-rollback.sql
git commit -m "migration: super-admin flag + user_activity_daily table"
```

---

## Task 2: Bootstrap Henry Admin account

**Files:**
- Create: `scripts/bootstrap-henry-admin.mjs`

- [ ] **Step 1: Write the bootstrap script**

Create `scripts/bootstrap-henry-admin.mjs`:

```javascript
#!/usr/bin/env node
// Bootstrap the Henry Admin super-admin account.
// One-shot script — idempotent, safe to re-run.
//
// Usage: node scripts/bootstrap-henry-admin.mjs
//
// Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// Load .env.local manually — this script doesn't run under Next.
const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dirname, '..', '.env.local')
const envText = readFileSync(envPath, 'utf8')
const env = Object.fromEntries(
  envText.split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .map(line => {
      const eq = line.indexOf('=')
      return [line.slice(0, eq), line.slice(eq + 1).replace(/^"|"$/g, '')]
    })
)

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const EMAIL = 'henryaleksanyan@gmail.com'
const PASSWORD = 'Hratch33!'
const NAME = 'Henry Admin'

async function main() {
  // 1. Check if the auth user already exists.
  let userId = null
  const { data: listData, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (listErr) throw listErr
  const existing = listData.users.find(u => u.email?.toLowerCase() === EMAIL.toLowerCase())
  if (existing) {
    userId = existing.id
    console.log(`Auth user already exists: ${userId}`)
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
    })
    if (error) throw error
    userId = data.user.id
    console.log(`Created auth user: ${userId}`)
  }

  // 2. Upsert the profile row. Do NOT overwrite an existing name.
  const { data: existingProfile } = await admin
    .from('profiles')
    .select('id, name')
    .eq('id', userId)
    .maybeSingle()

  const nameToWrite = existingProfile?.name || NAME

  const { error: upsertErr } = await admin
    .from('profiles')
    .upsert({
      id: userId,
      email: EMAIL,
      name: nameToWrite,
      role: 'admin',
      is_super_admin: true,
      is_active: true,
      show_in_handling_appraiser_list: false,
      can_reassign_claims: true,
      can_edit_claim_info: true,
      can_create_claims: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' })
  if (upsertErr) throw upsertErr

  console.log(`Profile upserted for ${EMAIL} (name="${nameToWrite}", is_super_admin=true)`)
  console.log('Done. Henry can now log in.')
}

main().catch(err => {
  console.error('Bootstrap failed:', err)
  process.exit(1)
})
```

- [ ] **Step 2: Run the bootstrap script**

Ask Henry to run:

```bash
node scripts/bootstrap-henry-admin.mjs
```

Expected output:

```
Created auth user: <uuid>
Profile upserted for henryaleksanyan@gmail.com (name="Henry Admin", is_super_admin=true)
Done. Henry can now log in.
```

If the auth user already exists (re-run), the first line becomes `Auth user already exists: <uuid>`.

- [ ] **Step 3: Verify via SQL**

Ask Henry to run in Supabase SQL Editor:

```sql
select id, email, name, role, is_super_admin, is_active
from public.profiles
where email = 'henryaleksanyan@gmail.com';
```

Expected: one row with `role='admin'`, `is_super_admin=true`, `is_active=true`.

- [ ] **Step 4: Commit**

```bash
git add scripts/bootstrap-henry-admin.mjs
git commit -m "script: bootstrap Henry Admin super-admin account"
```

---

## Task 3: Profile type + auth helpers

**Files:**
- Modify: `src/lib/supabase/profiles.ts`
- Modify: `src/lib/auth/require-admin.ts`
- Modify: `src/app/admin/_guard.tsx`

- [ ] **Step 1: Add `isSuperAdmin` to the Profile type**

In `src/lib/supabase/profiles.ts`, extend the `Profile` interface. Insert `isSuperAdmin: boolean` right after `showInHandlingAppraiserList`:

```typescript
  showInHandlingAppraiserList: boolean
  isSuperAdmin: boolean
  createdAt: string
```

Extend `ProfileRow` right after `show_in_handling_appraiser_list`:

```typescript
  show_in_handling_appraiser_list?: boolean | null
  is_super_admin?: boolean | null
  created_at: string
```

Extend `rowToProfile` right after `showInHandlingAppraiserList`:

```typescript
    showInHandlingAppraiserList: row.show_in_handling_appraiser_list !== false,
    isSuperAdmin: row.is_super_admin === true,
    createdAt: row.created_at,
```

Note: `isSuperAdmin` defaults to `false` on any row where the column is null (defensive against a missing migration).

- [ ] **Step 2: Extend `getCaller()` to include `isSuperAdmin`**

In `src/lib/auth/require-admin.ts`:

Update `CallerContext`:

```typescript
interface CallerContext {
  userId: string
  role: Role
  isSuperAdmin: boolean
}
```

Update the profile query in `getCaller()` to select `is_super_admin`:

```typescript
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, is_super_admin')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile) {
    return { caller: null, errorResponse: NextResponse.json({ error: 'No profile' }, { status: 403 }) }
  }
  return {
    caller: {
      userId: profile.id,
      role: profile.role as Role,
      isSuperAdmin: (profile as { is_super_admin?: boolean }).is_super_admin === true,
    },
    errorResponse: null,
  }
```

- [ ] **Step 3: Add `requireSuperAdmin()`**

Append to `src/lib/auth/require-admin.ts` (after `requireAdmin`):

```typescript
// Same as requireAdmin but also requires is_super_admin = true. Use for
// routes that expose cross-user analytics that regular admins shouldn't see.
export async function requireSuperAdmin(): Promise<
  { caller: CallerContext; errorResponse: null } | { caller: null; errorResponse: NextResponse }
> {
  const authed = await requireAdmin()
  if (!authed.caller) return authed
  if (!authed.caller.isSuperAdmin) {
    return { caller: null, errorResponse: NextResponse.json({ error: 'Super-admin only' }, { status: 403 }) }
  }
  return authed
}
```

- [ ] **Step 4: Add `SuperAdminGuard()` server component**

In `src/app/admin/_guard.tsx`, append (below `AdminGuard`):

```typescript
// Server component only. Renders nothing when the caller is super-admin;
// calls notFound() (404) for anyone else — including regular admins.
export async function SuperAdminGuard() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()
  const { data } = await supabase
    .from('profiles')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .maybeSingle()
  if (!data || data.role !== 'admin' || data.is_super_admin !== true) notFound()
  return null
}
```

- [ ] **Step 5: Type-check**

Run:

```bash
npx tsc --noEmit
```

Expected: no new errors introduced by these changes.

- [ ] **Step 6: Commit**

```bash
git add src/lib/supabase/profiles.ts src/lib/auth/require-admin.ts src/app/admin/_guard.tsx
git commit -m "auth: add is_super_admin, requireSuperAdmin, SuperAdminGuard"
```

---

## Task 4: Time formatters library

**Files:**
- Create: `src/lib/activity/formatters.ts`

- [ ] **Step 1: Write the formatters**

Create `src/lib/activity/formatters.ts`:

```typescript
// Formatters for the activity dashboard. Kept client-safe (no fs / server deps).

// Formats a seconds duration as "Xh Ym" (or "Xm" if under an hour, or "—" if zero).
export function formatHoursMinutes(seconds: number): string {
  if (!seconds || seconds <= 0) return '—'
  const totalMinutes = Math.floor(seconds / 60)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

// Formats an ISO timestamp as "2 min ago", "3 hours ago", "yesterday",
// "5 days ago", "never" (null input).
export function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'never'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 'never'
  const diffMs = Date.now() - then
  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 60) return `${diffSec}s ago`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin} min ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay === 1) return 'yesterday'
  if (diffDay < 30) return `${diffDay} days ago`
  const diffMonth = Math.floor(diffDay / 30)
  if (diffMonth < 12) return `${diffMonth} month${diffMonth === 1 ? '' : 's'} ago`
  const diffYear = Math.floor(diffDay / 365)
  return `${diffYear} year${diffYear === 1 ? '' : 's'} ago`
}

// LA-calendar-date helper. Returns YYYY-MM-DD for the given timestamp,
// as observed in America/Los_Angeles. Used both server-side (activity_date
// column bucket) and client-side (rendering month labels, etc.).
export function laCalendarDate(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)
  const y = parts.find(p => p.type === 'year')!.value
  const m = parts.find(p => p.type === 'month')!.value
  const d = parts.find(p => p.type === 'day')!.value
  return `${y}-${m}-${d}`
}

// Given an LA calendar date string YYYY-MM-DD, return the LA date for
// Monday of that week. Used by the summary API to compute weekStart.
export function laMondayOf(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00-08:00`)
  const dow = d.getUTCDay()  // 0=Sun, 1=Mon, ..., 6=Sat
  const daysBack = (dow + 6) % 7  // Mon=0, Tue=1, ..., Sun=6
  d.setUTCDate(d.getUTCDate() - daysBack)
  return laCalendarDate(d)
}

// Given an LA calendar date string, return the 1st of its month, YYYY-MM-01.
export function laMonthStart(dateStr: string): string {
  return `${dateStr.slice(0, 7)}-01`
}

// Given an LA calendar date string, return the LA date 180 days earlier.
export function laMinusDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00-08:00`)
  d.setUTCDate(d.getUTCDate() - days)
  return laCalendarDate(d)
}
```

- [ ] **Step 2: Type-check**

Run:

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/activity/formatters.ts
git commit -m "activity: time + LA-calendar formatters"
```

---

## Task 5: Heartbeat API route

**Files:**
- Create: `src/app/api/activity/heartbeat/route.ts`

- [ ] **Step 1: Write the route**

Create `src/app/api/activity/heartbeat/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/service'
import { laCalendarDate } from '@/lib/activity/formatters'

export const runtime = 'nodejs'

// POST /api/activity/heartbeat
// Credits the caller with one 60-second tick against today's LA-calendar
// activity_date, deduped per-minute across tabs. Silent — returns 204 on
// success and on almost every error path. Called by the client every 60s
// from a focused, recently-interacted tab (see ActivityHeartbeat).
export async function POST() {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return new NextResponse(null, { status: 204 })

    const activityDate = laCalendarDate()
    // Minute bucket: current UTC time truncated to the minute.
    const now = new Date()
    now.setUTCSeconds(0, 0)
    const tickMinuteIso = now.toISOString()

    const service = createServiceClient()

    // supabase-js can't express the "WHERE last_tick_minute < EXCLUDED"
    // guard on an atomic upsert, so we do read → compare-and-set. The CAS
    // uses .eq('last_tick_minute', <prev>) so a racing tab that updated
    // between our select and update sees 0 rows affected — safe dedup.
    const { data: existing } = await service
      .from('user_activity_daily')
      .select('active_seconds, last_tick_minute')
      .eq('user_id', user.id)
      .eq('activity_date', activityDate)
      .maybeSingle()

    if (!existing) {
      // Insert with 60s. If a race inserts first, this errors — swallow.
      const { error: insertErr } = await service
        .from('user_activity_daily')
        .insert({
          user_id: user.id,
          activity_date: activityDate,
          active_seconds: 60,
          last_tick_minute: tickMinuteIso,
        })
      if (insertErr && insertErr.code !== '23505') {
        console.warn('[heartbeat] insert failed', insertErr.message)
      }
      return new NextResponse(null, { status: 204 })
    }

    // Dedup: if this minute has already been credited by another tab,
    // last_tick_minute >= our tickMinuteIso — no-op.
    if (existing.last_tick_minute && existing.last_tick_minute >= tickMinuteIso) {
      return new NextResponse(null, { status: 204 })
    }

    // Compare-and-set update. Filter on the OLD last_tick_minute so a
    // racing tab that updated between our select and update loses.
    const casQuery = service
      .from('user_activity_daily')
      .update({
        active_seconds: existing.active_seconds + 60,
        last_tick_minute: tickMinuteIso,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)
      .eq('activity_date', activityDate)

    const { error: updErr } = existing.last_tick_minute
      ? await casQuery.eq('last_tick_minute', existing.last_tick_minute)
      : await casQuery.is('last_tick_minute', null)

    if (updErr) console.warn('[heartbeat] update failed', updErr.message)
    return new NextResponse(null, { status: 204 })
  } catch (e) {
    console.warn('[heartbeat] unexpected', e instanceof Error ? e.message : String(e))
    return new NextResponse(null, { status: 204 })
  }
}
```

- [ ] **Step 2: Type-check**

Run:

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Manual smoke-test via curl**

Start the dev server (`npm run dev`), then in a separate terminal, log in through the browser (any account), copy the `sb-*-auth-token` cookie value from DevTools, and:

```bash
curl -i -X POST http://localhost:3000/api/activity/heartbeat \
  -H "Cookie: sb-ektglhdstobaipdqssjx-auth-token=<VALUE>"
```

Expected: `HTTP/1.1 204 No Content`.

Then run in Supabase SQL Editor:

```sql
select user_id, activity_date, active_seconds, last_tick_minute
from public.user_activity_daily
order by updated_at desc
limit 3;
```

Expected: one row for your user with `active_seconds = 60` and today's LA date. Fire the curl again in the same minute — `active_seconds` stays 60 (dedup). Wait 60s, fire again — `active_seconds` becomes 120.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/activity/heartbeat/route.ts
git commit -m "api: activity heartbeat with per-minute dedup"
```

---

## Task 6: Client heartbeat component + mount

**Files:**
- Create: `src/components/activity-heartbeat.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/activity-heartbeat.tsx`:

```typescript
'use client'

import { useEffect, useRef } from 'react'
import { useCurrentProfile } from '@/lib/supabase/profiles'

const TICK_MS = 60_000
const IDLE_MS = 120_000  // 2 minutes of no interaction => stop crediting

// Client-only. Fires POST /api/activity/heartbeat every 60s while:
//   - the tab is visible (document.visibilityState === 'visible')
//   - the window has focus (document.hasFocus())
//   - the user interacted (mouse/keyboard/scroll/touch) within the last 2 min
// Multi-tab dedup is handled server-side; this hook can safely fire from every tab.
export function ActivityHeartbeat() {
  const { profile } = useCurrentProfile()
  const lastInteractionRef = useRef<number>(Date.now())

  useEffect(() => {
    if (!profile) return

    const markInteraction = () => { lastInteractionRef.current = Date.now() }
    const events: (keyof WindowEventMap)[] = ['mousemove', 'keydown', 'click', 'scroll', 'pointerdown']
    events.forEach(e => window.addEventListener(e, markInteraction, { passive: true }))

    const fire = () => {
      if (typeof document === 'undefined') return
      if (document.visibilityState !== 'visible') return
      if (!document.hasFocus()) return
      if (Date.now() - lastInteractionRef.current > IDLE_MS) return

      const url = '/api/activity/heartbeat'
      try {
        if (navigator.sendBeacon) {
          navigator.sendBeacon(url, new Blob([], { type: 'application/json' }))
        } else {
          void fetch(url, { method: 'POST', keepalive: true }).catch(() => {})
        }
      } catch { /* swallow */ }
    }

    // Fire once shortly after mount so the "landed on the app 15 seconds ago"
    // case still counts a tick, then continue on 60s intervals.
    const firstTimeout = setTimeout(fire, 5_000)
    const interval = setInterval(fire, TICK_MS)

    return () => {
      clearTimeout(firstTimeout)
      clearInterval(interval)
      events.forEach(e => window.removeEventListener(e, markInteraction))
    }
  }, [profile])

  return null
}
```

- [ ] **Step 2: Mount in root layout**

Read `src/app/layout.tsx` first to see the current tree — it may have providers/wrappers around `{children}`. Then import the component at the top and insert `<ActivityHeartbeat />` as a sibling of `{children}` inside `<body>`:

```typescript
import { ActivityHeartbeat } from '@/components/activity-heartbeat'
```

Example placement (adjust to actual structure):

```tsx
<body>
  <ActivityHeartbeat />
  {children}
</body>
```

- [ ] **Step 3: Type-check + build**

```bash
npx tsc --noEmit
npm run build
```

Expected: both clean.

- [ ] **Step 4: Browser smoke-test**

Run `npm run dev`. Log in. Open DevTools → Network. Wait ~65 seconds. Confirm you see a `POST /api/activity/heartbeat` with status 204. Focus a different tab for 3+ minutes and confirm no new heartbeats fire during that time. Return to the tab, move the mouse, wait 60s — a new heartbeat fires.

Then in Supabase SQL Editor:

```sql
select user_id, activity_date, active_seconds, last_tick_minute
from public.user_activity_daily
where user_id = auth.uid()
order by activity_date desc;
```

Confirm `active_seconds` grows by 60 for each minute of real usage.

- [ ] **Step 5: Commit**

```bash
git add src/components/activity-heartbeat.tsx src/app/layout.tsx
git commit -m "activity: client heartbeat hook, mounted in root layout"
```

---

## Task 7: Summary API (all users)

**Files:**
- Create: `src/app/api/activity/summary/route.ts`

- [ ] **Step 1: Write the route**

Create `src/app/api/activity/summary/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth/require-admin'
import { createServiceClient } from '@/lib/supabase/service'
import { laCalendarDate, laMondayOf, laMonthStart, laMinusDays } from '@/lib/activity/formatters'

export const runtime = 'nodejs'

interface SummaryUser {
  userId: string
  name: string
  email: string
  isActive: boolean
  today: number
  thisWeek: number
  thisMonth: number
  last6Months: number
  lastActiveAt: string | null
}

// GET /api/activity/summary
// Super-admin only. Returns per-user totals over four rolling windows.
export async function GET() {
  const auth = await requireSuperAdmin()
  if (auth.errorResponse) return auth.errorResponse

  const today = laCalendarDate()
  const weekStart = laMondayOf(today)
  const monthStart = laMonthStart(today)
  const sixMonthsStart = laMinusDays(today, 180)

  const service = createServiceClient()

  // Fetch all profiles.
  const { data: profiles, error: profilesErr } = await service
    .from('profiles')
    .select('id, name, email, is_active')
    .order('name', { ascending: true })
  if (profilesErr) {
    return NextResponse.json({ error: profilesErr.message }, { status: 500 })
  }

  // Fetch daily rows for the 6-month window. May not exist if migration wasn't run.
  const { data: rows, error: rowsErr } = await service
    .from('user_activity_daily')
    .select('user_id, activity_date, active_seconds, last_tick_minute')
    .gte('activity_date', sixMonthsStart)

  if (rowsErr) {
    // 42P01 = relation does not exist. Return empty totals so the UI stays alive.
    if (rowsErr.code === '42P01') {
      const users: SummaryUser[] = (profiles ?? []).map(p => ({
        userId: p.id,
        name: p.name,
        email: p.email,
        isActive: p.is_active !== false,
        today: 0, thisWeek: 0, thisMonth: 0, last6Months: 0,
        lastActiveAt: null,
      }))
      return NextResponse.json({ users, warning: 'user_activity_daily table not found' })
    }
    return NextResponse.json({ error: rowsErr.message }, { status: 500 })
  }

  // Bucket rows per user.
  const byUser = new Map<string, { today: number; week: number; month: number; sixMonths: number; lastActive: string | null }>()
  for (const row of rows ?? []) {
    let b = byUser.get(row.user_id)
    if (!b) {
      b = { today: 0, week: 0, month: 0, sixMonths: 0, lastActive: null }
      byUser.set(row.user_id, b)
    }
    const secs = row.active_seconds ?? 0
    b.sixMonths += secs
    if (row.activity_date >= monthStart) b.month += secs
    if (row.activity_date >= weekStart) b.week += secs
    if (row.activity_date === today) b.today += secs
    if (row.last_tick_minute && (!b.lastActive || row.last_tick_minute > b.lastActive)) {
      b.lastActive = row.last_tick_minute
    }
  }

  const users: SummaryUser[] = (profiles ?? []).map(p => {
    const b = byUser.get(p.id)
    return {
      userId: p.id,
      name: p.name,
      email: p.email,
      isActive: p.is_active !== false,
      today: b?.today ?? 0,
      thisWeek: b?.week ?? 0,
      thisMonth: b?.month ?? 0,
      last6Months: b?.sixMonths ?? 0,
      lastActiveAt: b?.lastActive ?? null,
    }
  })

  // Default sort: most recently active first, nulls last.
  users.sort((a, b) => {
    if (a.lastActiveAt && b.lastActiveAt) return b.lastActiveAt.localeCompare(a.lastActiveAt)
    if (a.lastActiveAt) return -1
    if (b.lastActiveAt) return 1
    return a.name.localeCompare(b.name)
  })

  return NextResponse.json({ users })
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Manual smoke-test**

With Henry Admin logged in (via browser cookies) and dev server running:

```bash
curl -i http://localhost:3000/api/activity/summary \
  -H "Cookie: sb-ektglhdstobaipdqssjx-auth-token=<HENRY_ADMIN_TOKEN>"
```

Expected: `HTTP/1.1 200` with a JSON body containing `users: [...]`.

Then log in as a regular admin and repeat — expect `HTTP/1.1 403` with `{"error":"Super-admin only"}`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/activity/summary/route.ts
git commit -m "api: activity summary for super-admin"
```

---

## Task 8: Per-user summary API

**Files:**
- Create: `src/app/api/activity/summary/[userId]/route.ts`

- [ ] **Step 1: Write the route**

Create `src/app/api/activity/summary/[userId]/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth/require-admin'
import { createServiceClient } from '@/lib/supabase/service'
import { laCalendarDate, laMinusDays } from '@/lib/activity/formatters'

export const runtime = 'nodejs'

// GET /api/activity/summary/[userId]
// Super-admin only. Returns raw daily rows for the last 180 days for one user.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const auth = await requireSuperAdmin()
  if (auth.errorResponse) return auth.errorResponse

  const { userId } = await params
  const today = laCalendarDate()
  const sixMonthsStart = laMinusDays(today, 180)

  const service = createServiceClient()

  const { data: profile, error: profileErr } = await service
    .from('profiles')
    .select('id, name, email, is_active')
    .eq('id', userId)
    .maybeSingle()
  if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 500 })
  if (!profile) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const { data: rows, error: rowsErr } = await service
    .from('user_activity_daily')
    .select('activity_date, active_seconds, last_tick_minute')
    .eq('user_id', userId)
    .gte('activity_date', sixMonthsStart)
    .order('activity_date', { ascending: true })

  if (rowsErr) {
    if (rowsErr.code === '42P01') {
      return NextResponse.json({
        userId, name: profile.name, email: profile.email,
        isActive: profile.is_active !== false,
        days: [],
        warning: 'user_activity_daily table not found',
      })
    }
    return NextResponse.json({ error: rowsErr.message }, { status: 500 })
  }

  return NextResponse.json({
    userId,
    name: profile.name,
    email: profile.email,
    isActive: profile.is_active !== false,
    days: (rows ?? []).map(r => ({
      date: r.activity_date,
      activeSeconds: r.active_seconds ?? 0,
      lastTickAt: r.last_tick_minute,
    })),
  })
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Manual smoke-test**

```bash
curl -i http://localhost:3000/api/activity/summary/<A_USER_ID> \
  -H "Cookie: sb-ektglhdstobaipdqssjx-auth-token=<HENRY_ADMIN_TOKEN>"
```

Expected: `HTTP/1.1 200`, JSON with `userId`, `name`, `days: [...]`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/activity/summary/[userId]/route.ts
git commit -m "api: per-user activity summary"
```

---

## Task 9: Activity landing page + client

**Files:**
- Create: `src/app/admin/settings/activity/page.tsx`
- Create: `src/app/admin/settings/activity/activity-client.tsx`

- [ ] **Step 1: Write the page server component**

Create `src/app/admin/settings/activity/page.tsx`:

```typescript
import { SuperAdminGuard } from '@/app/admin/_guard'
import { ActivityClient } from './activity-client'

export default async function ActivityPage() {
  await SuperAdminGuard()
  return <ActivityClient />
}
```

- [ ] **Step 2: Write the client**

Create `src/app/admin/settings/activity/activity-client.tsx`:

```typescript
'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { formatHoursMinutes, formatRelativeTime } from '@/lib/activity/formatters'

interface SummaryUser {
  userId: string
  name: string
  email: string
  isActive: boolean
  today: number
  thisWeek: number
  thisMonth: number
  last6Months: number
  lastActiveAt: string | null
}

type SortKey = 'name' | 'today' | 'thisWeek' | 'thisMonth' | 'last6Months' | 'lastActiveAt'

export function ActivityClient() {
  const [users, setUsers] = useState<SummaryUser[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showInactive, setShowInactive] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('lastActiveAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    let cancelled = false
    fetch('/api/activity/summary')
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((body: { users: SummaryUser[] }) => {
        if (!cancelled) setUsers(body.users)
      })
      .catch(e => {
        if (!cancelled) setError(e.message || 'Failed to load')
      })
    return () => { cancelled = true }
  }, [])

  const sorted = useMemo(() => {
    if (!users) return null
    const filtered = showInactive ? users : users.filter(u => u.isActive)
    const dir = sortDir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name) * dir
      if (sortKey === 'lastActiveAt') {
        if (a.lastActiveAt && b.lastActiveAt) return a.lastActiveAt.localeCompare(b.lastActiveAt) * dir
        if (a.lastActiveAt) return -1 * dir
        if (b.lastActiveAt) return 1 * dir
        return 0
      }
      return ((a[sortKey] as number) - (b[sortKey] as number)) * dir
    })
  }, [users, showInactive, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir(key === 'name' ? 'asc' : 'desc') }
  }

  const arrow = (key: SortKey) => sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Activity</h1>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={e => setShowInactive(e.target.checked)}
          />
          Show inactive users
        </label>
      </div>

      {error && (
        <div className="mb-3 rounded border border-red-300 bg-red-50 text-red-800 text-sm px-3 py-2">
          Failed to load activity: {error}
        </div>
      )}

      {!users && !error && (
        <div className="text-sm text-gray-500">Loading…</div>
      )}

      {sorted && (
        <div className="overflow-x-auto border border-gray-200 rounded">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-700">
              <tr>
                <Th onClick={() => toggleSort('name')}>User{arrow('name')}</Th>
                <Th onClick={() => toggleSort('today')} align="right">Today{arrow('today')}</Th>
                <Th onClick={() => toggleSort('thisWeek')} align="right">This Week{arrow('thisWeek')}</Th>
                <Th onClick={() => toggleSort('thisMonth')} align="right">This Month{arrow('thisMonth')}</Th>
                <Th onClick={() => toggleSort('last6Months')} align="right">Last 6 Months{arrow('last6Months')}</Th>
                <Th onClick={() => toggleSort('lastActiveAt')} align="right">Last Active{arrow('lastActiveAt')}</Th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(u => (
                <tr key={u.userId} className={`border-t border-gray-200 hover:bg-blue-50 ${!u.isActive ? 'text-gray-400' : ''}`}>
                  <td className="px-3 py-2">
                    <Link href={`/admin/settings/activity/${u.userId}`} className="text-blue-600 hover:underline">
                      {u.name}
                    </Link>
                    <div className="text-xs text-gray-500">{u.email}</div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatHoursMinutes(u.today)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatHoursMinutes(u.thisWeek)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatHoursMinutes(u.thisMonth)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatHoursMinutes(u.last6Months)}</td>
                  <td className="px-3 py-2 text-right text-gray-500">{formatRelativeTime(u.lastActiveAt)}</td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-500">No users match the current filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Th({ children, align = 'left', onClick }: { children: React.ReactNode; align?: 'left' | 'right'; onClick: () => void }) {
  return (
    <th
      onClick={onClick}
      className={`px-3 py-2 font-medium cursor-pointer select-none ${align === 'right' ? 'text-right' : 'text-left'}`}
    >
      {children}
    </th>
  )
}
```

- [ ] **Step 3: Type-check + build**

```bash
npx tsc --noEmit
npm run build
```

Expected: both clean.

- [ ] **Step 4: Browser smoke-test**

Log in as Henry Admin. Visit `http://localhost:3000/admin/settings/activity`. Expect the user table to render with your own row showing at least the accumulated `Today` value from Task 6's testing.

Log out, log in as a regular admin, visit the same URL. Expect a 404 page.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/settings/activity/page.tsx src/app/admin/settings/activity/activity-client.tsx
git commit -m "activity: super-admin dashboard landing page"
```

---

## Task 10: Per-user drilldown page + client

**Files:**
- Create: `src/app/admin/settings/activity/[userId]/page.tsx`
- Create: `src/app/admin/settings/activity/[userId]/user-activity-client.tsx`

- [ ] **Step 1: Write the page server component**

Create `src/app/admin/settings/activity/[userId]/page.tsx`:

```typescript
import { SuperAdminGuard } from '@/app/admin/_guard'
import { UserActivityClient } from './user-activity-client'

export default async function UserActivityPage({
  params,
}: { params: Promise<{ userId: string }> }) {
  await SuperAdminGuard()
  const { userId } = await params
  return <UserActivityClient userId={userId} />
}
```

- [ ] **Step 2: Write the client**

Create `src/app/admin/settings/activity/[userId]/user-activity-client.tsx`:

```typescript
'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { formatHoursMinutes, laCalendarDate, laMinusDays } from '@/lib/activity/formatters'

interface Day { date: string; activeSeconds: number; lastTickAt: string | null }
interface UserSummary { userId: string; name: string; email: string; isActive: boolean; days: Day[] }

export function UserActivityClient({ userId }: { userId: string }) {
  const [data, setData] = useState<UserSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/activity/summary/${userId}`)
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((body: UserSummary) => { if (!cancelled) setData(body) })
      .catch(e => { if (!cancelled) setError(e.message || 'Failed to load') })
    return () => { cancelled = true }
  }, [userId])

  const totals = useMemo(() => {
    if (!data) return null
    const today = laCalendarDate()
    const weekStart = mondayOf(today)
    const monthStart = `${today.slice(0, 7)}-01`
    const sixMonthsStart = laMinusDays(today, 180)
    let t = 0, w = 0, m = 0, s = 0
    for (const d of data.days) {
      if (d.date >= sixMonthsStart) s += d.activeSeconds
      if (d.date >= monthStart) m += d.activeSeconds
      if (d.date >= weekStart) w += d.activeSeconds
      if (d.date === today) t += d.activeSeconds
    }
    return { today: t, thisWeek: w, thisMonth: m, last6Months: s }
  }, [data])

  const last30 = useMemo(() => build30DaySeries(data?.days ?? []), [data])
  const monthlyTotals = useMemo(() => build6MonthTotals(data?.days ?? []), [data])

  if (error) {
    return (
      <div className="rounded border border-red-300 bg-red-50 text-red-800 text-sm px-3 py-2">
        Failed to load: {error}
      </div>
    )
  }
  if (!data || !totals) return <div className="text-sm text-gray-500">Loading…</div>

  const maxSec = Math.max(1, ...last30.map(d => d.activeSeconds))

  return (
    <div>
      <div className="mb-4">
        <Link href="/admin/settings/activity" className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1">
          <ChevronLeft className="w-4 h-4" /> Back to Activity
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{data.name}</h1>
        <div className="text-sm text-gray-500">{data.email}{!data.isActive && ' — inactive'}</div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card label="Today"           value={formatHoursMinutes(totals.today)} />
        <Card label="This Week"       value={formatHoursMinutes(totals.thisWeek)} />
        <Card label="This Month"      value={formatHoursMinutes(totals.thisMonth)} />
        <Card label="Last 6 Months"   value={formatHoursMinutes(totals.last6Months)} />
      </div>

      <h2 className="text-sm font-medium text-gray-700 mb-2">Last 30 days</h2>
      <div className="mb-6 border border-gray-200 rounded p-3 bg-white">
        <div className="flex items-end gap-1 h-32">
          {last30.map(d => {
            const heightPct = d.activeSeconds === 0 ? 2 : Math.max(4, (d.activeSeconds / maxSec) * 100)
            return (
              <div
                key={d.date}
                title={`${d.date}: ${formatHoursMinutes(d.activeSeconds)}`}
                className="flex-1 bg-blue-500 rounded-t"
                style={{ height: `${heightPct}%` }}
              />
            )
          })}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-gray-500">
          <span>{last30[0]?.date}</span>
          <span>{last30[last30.length - 1]?.date}</span>
        </div>
      </div>

      <h2 className="text-sm font-medium text-gray-700 mb-2">Monthly totals</h2>
      <div className="border border-gray-200 rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-700">
            <tr><th className="px-3 py-2 text-left font-medium">Month</th><th className="px-3 py-2 text-right font-medium">Active time</th></tr>
          </thead>
          <tbody>
            {monthlyTotals.map(m => (
              <tr key={m.label} className="border-t border-gray-200">
                <td className="px-3 py-2">{m.label}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatHoursMinutes(m.seconds)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-gray-200 rounded p-3 bg-white">
      <div className="text-xs uppercase tracking-wider text-gray-500">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  )
}

// Local: Monday-of-week for an LA date string. Duplicated here (rather than
// importing) because the formatters module's laMondayOf is server-safe but
// this file only needs the pure-string form.
function mondayOf(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00-08:00`)
  const dow = d.getUTCDay()
  const daysBack = (dow + 6) % 7
  d.setUTCDate(d.getUTCDate() - daysBack)
  return d.toISOString().slice(0, 10)
}

function build30DaySeries(days: Day[]): { date: string; activeSeconds: number }[] {
  const byDate = new Map(days.map(d => [d.date, d.activeSeconds]))
  const today = laCalendarDate()
  const out: { date: string; activeSeconds: number }[] = []
  for (let i = 29; i >= 0; i--) {
    const d = laMinusDays(today, i)
    out.push({ date: d, activeSeconds: byDate.get(d) ?? 0 })
  }
  return out
}

function build6MonthTotals(days: Day[]): { label: string; seconds: number }[] {
  const buckets = new Map<string, number>()
  for (const d of days) {
    const key = d.date.slice(0, 7)  // YYYY-MM
    buckets.set(key, (buckets.get(key) ?? 0) + d.activeSeconds)
  }
  const today = laCalendarDate()
  const out: { label: string; seconds: number }[] = []
  for (let i = 0; i < 6; i++) {
    const target = laMinusDays(today, i * 30)
    const key = target.slice(0, 7)
    if (out.find(o => o.label.endsWith(key.slice(0, 4)) && labelKey(o.label) === key)) continue
    out.push({ label: monthLabel(key), seconds: buckets.get(key) ?? 0 })
  }
  return out
}

function labelKey(label: string): string {
  // Convert "Aug 2026" -> "2026-08"
  const [mon, year] = label.split(' ')
  const monthIdx = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(mon)
  return `${year}-${String(monthIdx + 1).padStart(2, '0')}`
}

function monthLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split('-')
  const monthName = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(m, 10) - 1]
  return `${monthName} ${y}`
}
```

- [ ] **Step 3: Type-check + build**

```bash
npx tsc --noEmit
npm run build
```

Expected: both clean.

- [ ] **Step 4: Browser smoke-test**

As Henry Admin, click into your own row on `/admin/settings/activity`. Expect:
- Four summary cards up top.
- 30-day bar chart with today's bar populated.
- Monthly totals table with the current month showing your accumulated time.

Regular admin visiting the same URL: 404.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/settings/activity/[userId]
git commit -m "activity: per-user drilldown with 30-day chart"
```

---

## Task 11: Sidebar nav conditional Activity link

**Files:**
- Modify: `src/app/admin/settings/_settings-nav.tsx`

- [ ] **Step 1: Add conditional Activity item**

The current file is a client component. Add a `useCurrentProfile()` call and filter the sections list.

Replace the file's contents with:

```typescript
"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Users, Database, BookOpen, DollarSign, ShieldCheck, Tag, Activity } from 'lucide-react'
import { useCurrentProfile } from '@/lib/supabase/profiles'

const SECTIONS = [
  { href: '/admin/settings/users',           label: 'Users',            Icon: Users,        superAdminOnly: false },
  { href: '/admin/settings/fee-catalog',     label: 'Fee Catalog',      Icon: DollarSign,   superAdminOnly: false },
  { href: '/admin/settings/status-phases',   label: 'Status Phases',    Icon: Tag,          superAdminOnly: false },
  { href: '/admin/settings/licensed-states', label: 'Licensed States',  Icon: ShieldCheck,  superAdminOnly: false },
  { href: '/admin/settings/guidelines',      label: 'Guidelines',       Icon: BookOpen,     superAdminOnly: false },
  { href: '/admin/settings/data',            label: 'Data',             Icon: Database,     superAdminOnly: false },
  { href: '/admin/settings/activity',        label: 'Activity',         Icon: Activity,     superAdminOnly: true  },
]

export function SettingsNav() {
  const pathname = usePathname()
  const { profile } = useCurrentProfile()
  const visible = SECTIONS.filter(s => !s.superAdminOnly || profile?.isSuperAdmin === true)
  return (
    <nav className="w-56 shrink-0">
      <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-3 mb-2">
        Settings
      </div>
      <ul className="space-y-1">
        {visible.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <li key={href}>
              <Link
                href={href}
                className={`flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors ${
                  active
                    ? 'bg-blue-50 text-blue-700 font-semibold'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
```

- [ ] **Step 2: Type-check + build**

```bash
npx tsc --noEmit
npm run build
```

Expected: both clean.

- [ ] **Step 3: Browser smoke-test**

Log in as Henry Admin → confirm "Activity" is visible in the settings sidebar as the 7th item.

Log in as a regular admin → confirm "Activity" is NOT visible in the sidebar.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/settings/_settings-nav.tsx
git commit -m "activity: conditionally show Activity link in settings sidebar"
```

---

## Task 12: End-to-end verification + deploy

- [ ] **Step 1: Full-repo type-check + build**

```bash
npx tsc --noEmit
npm run build
```

Both must be clean before deploy. If either fails, fix the offending code and re-run — do not proceed.

- [ ] **Step 2: Capture current prod deploy for rollback**

```bash
npx vercel inspect modern-tools-rho.vercel.app --scope henry-as-projects-88caed67
```

Note the current `deployment url` — that's the rollback target if the new build breaks.

- [ ] **Step 3: Send rollback command to Henry BEFORE deploying**

Print a message to Henry with the rollback command pre-filled:

> "Deploying now. If it breaks, roll back with:
> `npx vercel promote <PREV_URL> --scope henry-as-projects-88caed67 --yes`"

Where `<PREV_URL>` is the URL captured in Step 2.

- [ ] **Step 4: Deploy**

```bash
npx vercel --prod --scope henry-as-projects-88caed67 --yes
```

Wait for the deploy to finish. Capture the new deploy id.

- [ ] **Step 5: Verify alias flipped**

```bash
npx vercel inspect modern-tools-rho.vercel.app --scope henry-as-projects-88caed67
```

Expected: alias points to the new deploy id, status `● Ready`.

- [ ] **Step 6: Post-deploy smoke test in prod**

- Log in as Henry Admin at `https://modern-tools-rho.vercel.app`. Confirm the Activity nav item appears.
- Visit `/admin/settings/activity`. Confirm the user table renders.
- Log in as a regular admin. Confirm no Activity nav item and 404 at `/admin/settings/activity`.
- Wait ~90 seconds in a focused tab as any user. Query `user_activity_daily` in Supabase — confirm today's `active_seconds` for that user has grown.

- [ ] **Step 7: Update `docs/SESSIONS.md`**

Prepend a new entry to `docs/SESSIONS.md` (newest on top) using the standard shape from `CLAUDE.md` — worked on, changed, deploy status (with new deploy id + alias verification + rollback URL), in progress / broken / unknowns, next.

- [ ] **Step 8: Commit the session log**

```bash
git add docs/SESSIONS.md
git commit -m "SESSIONS: super-admin activity tracking shipped"
```

---

## Rollback plan (if the deploy breaks)

**Code:**

```bash
npx vercel promote <PREV_DEPLOY_URL> --scope henry-as-projects-88caed67 --yes
```

**Migration:** run `supabase/migration-super-admin-activity-rollback.sql` in the Supabase SQL Editor. This drops `user_activity_daily`, reverts the trigger, and drops `profiles.is_super_admin`. **Rolling back the migration without also reverting the code will 500 the Activity page and log warnings on every heartbeat, but the app stays alive** because both the summary route and the heartbeat route catch `42P01` (relation does not exist) and swallow silently.

**Henry Admin account:** the account can be left in place after a rollback — with `is_super_admin` gone it's just a normal admin. To delete outright, in Supabase Dashboard → Authentication → find `henryaleksanyan@gmail.com` → delete. That cascades and removes the profile row too.
