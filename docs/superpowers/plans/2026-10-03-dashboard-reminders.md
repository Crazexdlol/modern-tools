# Dashboard Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an in-app reminders system on the dashboard where any user can schedule a note + fire time (with optional claim link + optional recurrence) and have it delivered via in-app popup, browser push, and/or email.

**Architecture:** New Supabase `reminders` + `push_subscriptions` tables with RLS. Minute-cadence Vercel Cron scans for due rows, marks them `fired`, fans out push + email, and lets Supabase Realtime push the row to the recipient's open browser for the in-app toast. UI: a right-side sidebar on `/` for listing/creating, a globally-mounted toast for fire-time popups, a service worker in `public/sw.js` for push.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres + Realtime + RLS), TypeScript, React 19, Tailwind v4, shadcn primitives, Resend (email), web-push (VAPID), Vercel Cron.

**Reference spec:** `docs/superpowers/specs/2026-10-03-dashboard-reminders-design.md`

---

## Pre-flight — Henry handles outside the code

Before Task 1, Henry needs these one-time items set up. The implementation plan assumes they're done.

1. **Resend account:** sign up at resend.com, verify a sending domain (or use `onboarding@resend.dev` for dev), create an API key. Store as `RESEND_API_KEY` in Vercel + `.env.local`.
2. **VAPID keys for Web Push:** run `npx web-push generate-vapid-keys` once. Save the public key as `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and the private key as `VAPID_PRIVATE_KEY` in Vercel + `.env.local`.
3. **Cron shared secret:** generate a random 32-char token (e.g. `openssl rand -hex 32`). Store as `REMINDERS_CRON_SECRET` in Vercel + `.env.local`.
4. **Vercel Cron plan check:** confirm the project is on a Vercel plan that allows minute-cadence crons (Pro+ does; Hobby is daily-only).

**Pre-migration safety:** every new-column / new-table read in the code is wrapped in try/fallback so a route still works if Henry hasn't run the migration yet (project convention — see `src/lib/supabase/history.ts` for the 42703 pattern).

---

## File inventory

### New files

```
supabase/migration-reminders.sql
supabase/migration-reminders-rollback.sql
src/lib/reminders/types.ts
src/lib/reminders/recurrence.ts
src/lib/reminders/push.ts
src/lib/reminders/email.ts
src/app/api/reminders/route.ts
src/app/api/reminders/[id]/route.ts
src/app/api/reminders/tick/route.ts
src/app/api/reminders/push-subscribe/route.ts
src/components/reminders/reminders-sidebar.tsx
src/components/reminders/reminder-row.tsx
src/components/reminders/create-reminder-sheet.tsx
src/components/reminders/reminder-toast.tsx
src/components/reminders/reminders-realtime-provider.tsx
public/sw.js
scripts/verify-reminder-recurrence.mjs
```

### Modified files

```
src/app/page.tsx                 (mount <RemindersSidebar/>)
src/app/layout.tsx               (mount <RemindersRealtimeProvider/> + <ReminderToaster/>)
vercel.json                      (new or edited — add the cron entry)
package.json                     (add web-push, resend deps)
```

### Testing convention

The project has no unit test framework (CLAUDE.md: "No test framework configured"). Pure-function tests use standalone `node scripts/verify-*.mjs` scripts — see `scripts/check-neg-match.mjs` for the existing pattern. API routes verified via curl + the dev server. UI verified via `npm run dev` and a browser.

**Every task ends with `npx tsc --noEmit` and the task-specific verification before `git commit`.** `npm run build` runs at the end of the plan (Task 15) before deploy — running it per task is wasteful.

---

## Task 1: Database migration

**Files:**
- Create: `supabase/migration-reminders.sql`
- Create: `supabase/migration-reminders-rollback.sql`

- [ ] **Step 1: Write `supabase/migration-reminders.sql`**

```sql
-- =========================================================================
-- HamsPortal — Reminders (2026-10-03)
-- Adds: reminders table + push_subscriptions table + RLS + indexes.
-- Run in Supabase SQL Editor. Idempotent. Reversible via -rollback.sql.
-- =========================================================================

-- 1. reminders table
create table if not exists public.reminders (
  id              uuid primary key default gen_random_uuid(),
  created_by      uuid not null references public.profiles(id) on delete cascade,
  target_user_id  uuid not null references public.profiles(id) on delete cascade,
  note            text not null check (char_length(note) between 1 and 1000),
  fire_at         timestamptz not null,
  claim_id        text null references public.acv_history(id) on delete set null,
  recurrence      jsonb null,
  channels        jsonb not null
                    check (
                      (channels ? 'in_app' and channels ? 'push' and channels ? 'email')
                      and ((channels->>'in_app')::bool
                           or (channels->>'push')::bool
                           or (channels->>'email')::bool)
                    ),
  status          text not null default 'scheduled'
                    check (status in ('scheduled','fired','acknowledged','snoozed','dismissed')),
  fired_at        timestamptz null,
  acknowledged_at timestamptz null,
  snoozed_until   timestamptz null,
  created_at      timestamptz not null default now()
);

create index if not exists reminders_target_status_fire_at_idx
  on public.reminders (target_user_id, status, fire_at);

create index if not exists reminders_due_idx
  on public.reminders (fire_at)
  where status = 'scheduled';

create index if not exists reminders_created_by_idx
  on public.reminders (created_by);

alter table public.reminders enable row level security;

-- INSERT guard: appraisers can only target self or admins; admins target anyone.
-- Implemented as a trigger so we can look up profiles.role of the target.
create or replace function public.reminders_insert_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  target_role text;
begin
  if auth.role() = 'service_role' then return new; end if;
  if new.created_by is distinct from auth.uid() then
    raise exception 'created_by must equal auth.uid()';
  end if;
  if public.is_admin() then return new; end if;
  if new.target_user_id = auth.uid() then return new; end if;
  select role into target_role from public.profiles where id = new.target_user_id;
  if target_role = 'admin' then return new; end if;
  raise exception 'appraisers may only target themselves or admins';
end;
$$;

drop trigger if exists reminders_insert_guard_trigger on public.reminders;
create trigger reminders_insert_guard_trigger
  before insert on public.reminders
  for each row execute function public.reminders_insert_guard();

drop policy if exists reminders_select on public.reminders;
create policy reminders_select on public.reminders for select to authenticated
  using (target_user_id = auth.uid() or created_by = auth.uid());

drop policy if exists reminders_insert on public.reminders;
create policy reminders_insert on public.reminders for insert to authenticated
  with check (true);  -- the trigger does the real check

drop policy if exists reminders_update_recipient on public.reminders;
create policy reminders_update_recipient on public.reminders for update to authenticated
  using (target_user_id = auth.uid())
  with check (target_user_id = auth.uid());

drop policy if exists reminders_update_creator on public.reminders;
create policy reminders_update_creator on public.reminders for update to authenticated
  using (created_by = auth.uid() and status = 'scheduled')
  with check (created_by = auth.uid() and status = 'scheduled');

drop policy if exists reminders_delete on public.reminders;
create policy reminders_delete on public.reminders for delete to authenticated
  using (created_by = auth.uid() or public.is_admin());

-- 2. push_subscriptions table
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  endpoint    text not null,
  p256dh      text not null,
  auth        text not null,
  user_agent  text null,
  created_at  timestamptz not null default now(),
  unique (user_id, endpoint)
);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subs_all on public.push_subscriptions;
create policy push_subs_all on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 3. Realtime publication: enable so the dashboard can subscribe.
alter publication supabase_realtime add table public.reminders;

-- 4. Verification (expect 1 for each)
select 'reminders table' as label, count(*)::int as value
  from information_schema.tables
  where table_schema='public' and table_name='reminders'
union all
select 'push_subscriptions table', count(*)::int
  from information_schema.tables
  where table_schema='public' and table_name='push_subscriptions'
union all
select 'reminders_insert_guard trigger', count(*)::int
  from information_schema.triggers
  where event_object_schema='public' and event_object_table='reminders'
    and trigger_name='reminders_insert_guard_trigger';
```

- [ ] **Step 2: Write `supabase/migration-reminders-rollback.sql`**

```sql
-- Rollback for migration-reminders.sql
alter publication supabase_realtime drop table if exists public.reminders;
drop trigger if exists reminders_insert_guard_trigger on public.reminders;
drop function if exists public.reminders_insert_guard();
drop table if exists public.push_subscriptions;
drop table if exists public.reminders;
```

- [ ] **Step 3: Hand off to Henry**

Tell Henry: "Please run `supabase/migration-reminders.sql` in the Supabase SQL Editor and confirm the 3 verification rows all show `1`. Reply with confirmation before I proceed to Task 2."

- [ ] **Step 4: Commit**

```
git add supabase/migration-reminders.sql supabase/migration-reminders-rollback.sql
git commit -m "feat(reminders): schema — reminders + push_subscriptions tables with RLS and realtime"
```

---

## Task 2: Shared types

**Files:**
- Create: `src/lib/reminders/types.ts`

- [ ] **Step 1: Write `src/lib/reminders/types.ts`**

```ts
export type ReminderChannels = {
  in_app: boolean;
  push: boolean;
  email: boolean;
};

export type ReminderRecurrence = {
  freq: 'daily' | 'weekly' | 'monthly';
  interval: number;        // every N days/weeks/months (default 1)
  end_at: string | null;   // ISO timestamp or null = indefinite
};

export type ReminderStatus =
  | 'scheduled'
  | 'fired'
  | 'acknowledged'
  | 'snoozed'
  | 'dismissed';

export type Reminder = {
  id: string;
  created_by: string;
  target_user_id: string;
  note: string;
  fire_at: string;           // ISO timestamp
  claim_id: string | null;
  recurrence: ReminderRecurrence | null;
  channels: ReminderChannels;
  status: ReminderStatus;
  fired_at: string | null;
  acknowledged_at: string | null;
  snoozed_until: string | null;
  created_at: string;
};

export type ReminderCreateInput = {
  target_user_ids: string[];           // one row inserted per entry
  note: string;
  fire_at: string;
  claim_id?: string | null;
  recurrence?: ReminderRecurrence | null;
  channels: ReminderChannels;
};

export type ReminderUpdateInput = Partial<{
  note: string;
  fire_at: string;
  claim_id: string | null;
  recurrence: ReminderRecurrence | null;
  channels: ReminderChannels;
}>;

export type ReminderActionInput = {
  action: 'acknowledge' | 'snooze' | 'dismiss';
  snooze_until?: string;    // required when action='snooze'
};
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors added by this file.

- [ ] **Step 3: Commit**

```
git add src/lib/reminders/types.ts
git commit -m "feat(reminders): shared types"
```

---

## Task 3: Recurrence helper (pure function, verified)

**Files:**
- Create: `scripts/verify-reminder-recurrence.mjs`
- Create: `src/lib/reminders/recurrence.ts`

- [ ] **Step 1: Write the failing verification script**

Create `scripts/verify-reminder-recurrence.mjs`:

```js
// Standalone verification for computeNextFire. Run with: node scripts/verify-reminder-recurrence.mjs
// Loads the TS via esbuild-register or compiled JS — but since this is a tiny pure function
// we duplicate the import by invoking tsx. If tsx isn't present, we fall back to compiled output.
// Simpler: compile on the fly.

import { computeNextFire } from '../src/lib/reminders/recurrence.ts';

const cases = [
  // daily, interval 1, no end
  {
    name: 'daily +1 day',
    fireAt: '2026-10-03T15:00:00.000Z',
    rec: { freq: 'daily', interval: 1, end_at: null },
    expected: '2026-10-04T15:00:00.000Z',
  },
  // daily interval 3
  {
    name: 'daily interval=3',
    fireAt: '2026-10-03T15:00:00.000Z',
    rec: { freq: 'daily', interval: 3, end_at: null },
    expected: '2026-10-06T15:00:00.000Z',
  },
  // weekly
  {
    name: 'weekly',
    fireAt: '2026-10-03T15:00:00.000Z',
    rec: { freq: 'weekly', interval: 1, end_at: null },
    expected: '2026-10-10T15:00:00.000Z',
  },
  // monthly
  {
    name: 'monthly',
    fireAt: '2026-10-03T15:00:00.000Z',
    rec: { freq: 'monthly', interval: 1, end_at: null },
    expected: '2026-11-03T15:00:00.000Z',
  },
  // monthly end-of-month clamp (Jan 31 + 1 month → Feb 28 non-leap)
  {
    name: 'monthly end-of-month clamp (Jan 31 → Feb 28 in 2027)',
    fireAt: '2027-01-31T15:00:00.000Z',
    rec: { freq: 'monthly', interval: 1, end_at: null },
    expected: '2027-02-28T15:00:00.000Z',
  },
  // past end_at → null
  {
    name: 'past end_at returns null',
    fireAt: '2026-10-03T15:00:00.000Z',
    rec: { freq: 'daily', interval: 1, end_at: '2026-10-03T20:00:00.000Z' },
    expected: null,
  },
];

let pass = 0;
let fail = 0;
for (const c of cases) {
  const got = computeNextFire(c.fireAt, c.rec);
  const ok = got === c.expected;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${c.name}  got=${got}  expected=${c.expected}`);
  if (ok) pass++;
  else fail++;
}
console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
```

(Note: this script imports a `.ts` file. Run it with `npx tsx scripts/verify-reminder-recurrence.mjs` — add `tsx` as a devDep in Step 2 if not already installed.)

- [ ] **Step 2: Install tsx if not already present**

Run: `npm ls tsx`

- If "empty" or missing: `npm install --save-dev tsx`
- If present: skip.

- [ ] **Step 3: Run the verification — expect failure**

Run: `npx tsx scripts/verify-reminder-recurrence.mjs`
Expected: fails with "Cannot find module '../src/lib/reminders/recurrence'" (file doesn't exist yet).

- [ ] **Step 4: Write `src/lib/reminders/recurrence.ts`**

```ts
import type { ReminderRecurrence } from './types';

// Returns the next fire time as an ISO string, or null if the recurrence has
// ended (next computed time would exceed end_at).
export function computeNextFire(
  currentFireAt: string,
  recurrence: ReminderRecurrence
): string | null {
  const base = new Date(currentFireAt);
  if (Number.isNaN(base.getTime())) {
    throw new Error(`invalid fireAt: ${currentFireAt}`);
  }
  const interval = Math.max(1, Math.floor(recurrence.interval || 1));
  const next = new Date(base);

  if (recurrence.freq === 'daily') {
    next.setUTCDate(next.getUTCDate() + interval);
  } else if (recurrence.freq === 'weekly') {
    next.setUTCDate(next.getUTCDate() + 7 * interval);
  } else if (recurrence.freq === 'monthly') {
    // Preserve the day-of-month, clamping to the last day of the target month
    // (e.g. Jan 31 + 1 month = Feb 28).
    const targetDay = base.getUTCDate();
    next.setUTCDate(1);
    next.setUTCMonth(next.getUTCMonth() + interval);
    const daysInTargetMonth = new Date(
      Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)
    ).getUTCDate();
    next.setUTCDate(Math.min(targetDay, daysInTargetMonth));
  } else {
    throw new Error(`unknown freq: ${(recurrence as { freq: string }).freq}`);
  }

  if (recurrence.end_at) {
    const end = new Date(recurrence.end_at);
    if (next.getTime() > end.getTime()) return null;
  }
  return next.toISOString();
}
```

- [ ] **Step 5: Run the verification — expect pass**

Run: `npx tsx scripts/verify-reminder-recurrence.mjs`
Expected: `6 pass, 0 fail` and exit 0.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Commit**

```
git add scripts/verify-reminder-recurrence.mjs src/lib/reminders/recurrence.ts package.json package-lock.json
git commit -m "feat(reminders): recurrence helper + verification"
```

---

## Task 4: CRUD API — list + create

**Files:**
- Create: `src/app/api/reminders/route.ts`

- [ ] **Step 1: Write `src/app/api/reminders/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { ReminderCreateInput } from '@/lib/reminders/types';

export const runtime = 'nodejs';

// GET /api/reminders?tab=upcoming|sent|done
export async function GET(req: Request) {
  const url = new URL(req.url);
  const tab = url.searchParams.get('tab') ?? 'upcoming';
  const supabase = await createClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const me = userData.user.id;

  let query = supabase.from('reminders').select('*');
  if (tab === 'upcoming') {
    query = query
      .eq('target_user_id', me)
      .in('status', ['scheduled', 'fired', 'snoozed'])
      .order('fire_at', { ascending: true });
  } else if (tab === 'sent') {
    query = query
      .eq('created_by', me)
      .neq('target_user_id', me)
      .order('fire_at', { ascending: true });
  } else if (tab === 'done') {
    query = query
      .eq('target_user_id', me)
      .in('status', ['acknowledged', 'dismissed'])
      .order('fire_at', { ascending: false })
      .limit(50);
  } else {
    return NextResponse.json({ error: 'invalid tab' }, { status: 400 });
  }

  const { data, error } = await query;
  if (error) {
    // 42703 = column/table does not exist (pre-migration safety)
    if (error.code === '42703' || error.code === '42P01') {
      return NextResponse.json({ reminders: [] });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ reminders: data ?? [] });
}

// POST /api/reminders
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const me = userData.user.id;

  let body: ReminderCreateInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  if (!Array.isArray(body.target_user_ids) || body.target_user_ids.length === 0) {
    return NextResponse.json({ error: 'target_user_ids required' }, { status: 400 });
  }
  if (!body.note || body.note.length > 1000) {
    return NextResponse.json({ error: 'note required, max 1000 chars' }, { status: 400 });
  }
  if (!body.fire_at) {
    return NextResponse.json({ error: 'fire_at required' }, { status: 400 });
  }
  if (!body.channels || (!body.channels.in_app && !body.channels.push && !body.channels.email)) {
    return NextResponse.json({ error: 'at least one channel required' }, { status: 400 });
  }

  const rows = body.target_user_ids.map((target_user_id) => ({
    created_by: me,
    target_user_id,
    note: body.note,
    fire_at: body.fire_at,
    claim_id: body.claim_id ?? null,
    recurrence: body.recurrence ?? null,
    channels: body.channels,
  }));

  const { data, error } = await supabase.from('reminders').insert(rows).select('*');
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ reminders: data ?? [] }, { status: 201 });
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Smoke-test the GET endpoint via dev server**

Terminal 1: `npm run dev`
Terminal 2 (replace `<token>` with a logged-in session cookie — easiest route is to log in via the browser then copy `sb-...-auth-token` from devtools):

```
curl -i "http://localhost:3000/api/reminders?tab=upcoming" -H "Cookie: sb-ektglhdstobaipdqssjx-auth-token=<token>"
```

Expected: `200` with `{"reminders":[]}` (empty list is fine — the table is empty).

- [ ] **Step 4: Smoke-test POST (create a self-reminder for 2 min from now)**

```
curl -i -X POST "http://localhost:3000/api/reminders" \
  -H "Cookie: sb-ektglhdstobaipdqssjx-auth-token=<token>" \
  -H "Content-Type: application/json" \
  -d "{\"target_user_ids\":[\"<my-profile-id>\"],\"note\":\"test reminder\",\"fire_at\":\"<ISO 2 min from now>\",\"channels\":{\"in_app\":true,\"push\":false,\"email\":false}}"
```

Expected: `201` with one `reminders` row. Verify in the Supabase table editor that it exists.

- [ ] **Step 5: Smoke-test the appraiser-targeting guard**

Repeat Step 4 but set `target_user_ids` to a non-admin appraiser's ID (when logged in as a different non-admin appraiser).
Expected: `400` with an error mentioning the trigger (e.g. "appraisers may only target themselves or admins").

- [ ] **Step 6: Commit**

```
git add src/app/api/reminders/route.ts
git commit -m "feat(reminders): list + create API"
```

---

## Task 5: CRUD API — update + delete + lifecycle actions

**Files:**
- Create: `src/app/api/reminders/[id]/route.ts`

- [ ] **Step 1: Write `src/app/api/reminders/[id]/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { ReminderActionInput, ReminderUpdateInput } from '@/lib/reminders/types';

export const runtime = 'nodejs';

// PATCH /api/reminders/[id]
// Body is either ReminderUpdateInput (edit a scheduled row — creator only) or
// ReminderActionInput (acknowledge/snooze/dismiss a fired row — recipient only).
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  let body: ReminderUpdateInput & Partial<ReminderActionInput>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  // Branch on action vs. edit.
  if (body.action) {
    const now = new Date().toISOString();
    const patch: Record<string, string | null> = {};
    if (body.action === 'acknowledge') {
      patch.status = 'acknowledged';
      patch.acknowledged_at = now;
      patch.snoozed_until = null;
    } else if (body.action === 'dismiss') {
      patch.status = 'dismissed';
      patch.acknowledged_at = now;
      patch.snoozed_until = null;
    } else if (body.action === 'snooze') {
      if (!body.snooze_until) {
        return NextResponse.json({ error: 'snooze_until required' }, { status: 400 });
      }
      patch.status = 'scheduled';
      patch.fire_at = body.snooze_until;
      patch.fired_at = null;
      patch.snoozed_until = body.snooze_until;
    } else {
      return NextResponse.json({ error: 'invalid action' }, { status: 400 });
    }
    const { data, error } = await supabase
      .from('reminders')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ reminder: data });
  }

  // Edit branch — scheduled rows only; policy enforces this.
  const patch: Record<string, unknown> = {};
  if (body.note !== undefined) patch.note = body.note;
  if (body.fire_at !== undefined) patch.fire_at = body.fire_at;
  if (body.claim_id !== undefined) patch.claim_id = body.claim_id;
  if (body.recurrence !== undefined) patch.recurrence = body.recurrence;
  if (body.channels !== undefined) patch.channels = body.channels;

  const { data, error } = await supabase
    .from('reminders')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ reminder: data });
}

// DELETE /api/reminders/[id]
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const { error } = await supabase.from('reminders').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Smoke-test ack**

Using the reminder ID from Task 4 Step 4 (manually simulate the fired state first — in Supabase table editor, set that row's `status='fired'`, `fired_at=now()`):

```
curl -i -X PATCH "http://localhost:3000/api/reminders/<id>" \
  -H "Cookie: ..." -H "Content-Type: application/json" \
  -d "{\"action\":\"acknowledge\"}"
```

Expected: `200` with the row showing `status='acknowledged'` and `acknowledged_at` populated.

- [ ] **Step 4: Smoke-test snooze**

Insert another scheduled row, then force it to `fired` manually, then:

```
curl -i -X PATCH "http://localhost:3000/api/reminders/<id>" \
  -H "Cookie: ..." -H "Content-Type: application/json" \
  -d "{\"action\":\"snooze\",\"snooze_until\":\"<ISO 10 min from now>\"}"
```

Expected: `200` with `status='scheduled'`, `fire_at` updated to the new time.

- [ ] **Step 5: Smoke-test delete**

```
curl -i -X DELETE "http://localhost:3000/api/reminders/<id>" -H "Cookie: ..."
```

Expected: `200 {"ok":true}`. Row gone from the table.

- [ ] **Step 6: Commit**

```
git add src/app/api/reminders/[id]/route.ts
git commit -m "feat(reminders): edit + lifecycle action + delete API"
```

---

## Task 6: Push subscription helpers + API

**Files:**
- Create: `src/lib/reminders/push.ts`
- Create: `src/app/api/reminders/push-subscribe/route.ts`

- [ ] **Step 1: Install deps**

Run: `npm install web-push`
Run: `npm install --save-dev @types/web-push`

- [ ] **Step 2: Write `src/lib/reminders/push.ts`**

```ts
import webpush from 'web-push';

type PushPayload = {
  title: string;
  body: string;
  url?: string;
};

type PushSubscriptionRow = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

let configured = false;
function configure() {
  if (configured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    throw new Error('VAPID keys missing');
  }
  webpush.setVapidDetails('mailto:reminders@hamsportal.com', publicKey, privateKey);
  configured = true;
}

// Send a push payload to a single subscription. Returns the HTTP status
// (or 0 on network error) and whether the subscription should be pruned.
export async function sendPush(
  sub: PushSubscriptionRow,
  payload: PushPayload
): Promise<{ status: number; shouldPrune: boolean }> {
  configure();
  try {
    const res = await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload)
    );
    return { status: res.statusCode, shouldPrune: false };
  } catch (err: unknown) {
    const status =
      typeof err === 'object' && err !== null && 'statusCode' in err
        ? Number((err as { statusCode: number }).statusCode)
        : 0;
    const shouldPrune = status === 404 || status === 410;
    return { status, shouldPrune };
  }
}
```

- [ ] **Step 3: Write `src/app/api/reminders/push-subscribe/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// POST { endpoint, keys: { p256dh, auth } }
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  let body: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const endpoint = body.endpoint;
  const p256dh = body.keys?.p256dh;
  const auth = body.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: 'endpoint + keys required' }, { status: 400 });
  }

  const ua = req.headers.get('user-agent') ?? null;

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        user_id: userData.user.id,
        endpoint,
        p256dh,
        auth,
        user_agent: ua,
      },
      { onConflict: 'user_id,endpoint' }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

// DELETE { endpoint }
export async function DELETE(req: Request) {
  const supabase = await createClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  let body: { endpoint?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  if (!body.endpoint) {
    return NextResponse.json({ error: 'endpoint required' }, { status: 400 });
  }
  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('user_id', userData.user.id)
    .eq('endpoint', body.endpoint);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```
git add src/lib/reminders/push.ts src/app/api/reminders/push-subscribe/route.ts package.json package-lock.json
git commit -m "feat(reminders): web-push helper + push subscription API"
```

---

## Task 7: Service worker

**Files:**
- Create: `public/sw.js`

- [ ] **Step 1: Write `public/sw.js`**

```js
/* HamsPortal reminders — push service worker */
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Reminder', body: event.data.text() };
  }
  const title = payload.title || 'Reminder';
  const options = {
    body: payload.body || '',
    data: { url: payload.url || '/' },
    requireInteraction: true,
    tag: payload.tag || undefined,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
```

- [ ] **Step 2: Smoke-test service worker registration (manually)**

Terminal: `npm run dev`
Browser (logged in): devtools → Application → Service Workers. There should be none registered yet (the registration happens in the UI task). This step is just confirming the file is served:

Visit `http://localhost:3000/sw.js` in the browser. Expected: the JavaScript file content loads with 200 OK and content-type `application/javascript` or similar.

- [ ] **Step 3: Commit**

```
git add public/sw.js
git commit -m "feat(reminders): push service worker"
```

---

## Task 8: Email helper

**Files:**
- Create: `src/lib/reminders/email.ts`

- [ ] **Step 1: Install Resend**

Run: `npm install resend`

- [ ] **Step 2: Write `src/lib/reminders/email.ts`**

```ts
import { Resend } from 'resend';

type EmailPayload = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

let client: Resend | null = null;
function getClient(): Resend {
  if (!client) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error('RESEND_API_KEY missing');
    client = new Resend(key);
  }
  return client;
}

const FROM = process.env.RESEND_FROM ?? 'reminders@hamsportal.com';

export async function sendEmail(payload: EmailPayload): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await getClient().emails.send({
      from: FROM,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```
git add src/lib/reminders/email.ts package.json package-lock.json
git commit -m "feat(reminders): email helper (Resend)"
```

---

## Task 9: Cron tick route

**Files:**
- Create: `src/app/api/reminders/tick/route.ts`
- Create or modify: `vercel.json`

- [ ] **Step 1: Write `src/app/api/reminders/tick/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { computeNextFire } from '@/lib/reminders/recurrence';
import { sendPush } from '@/lib/reminders/push';
import { sendEmail } from '@/lib/reminders/email';
import type { Reminder } from '@/lib/reminders/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Called by Vercel Cron every minute. Also protected by a shared secret so a
// random internet caller can't trigger fan-out.
export async function POST(req: Request) {
  const secret = req.headers.get('x-cron-secret');
  if (!secret || secret !== process.env.REMINDERS_CRON_SECRET) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const db = createServiceClient();
  const nowIso = new Date().toISOString();

  // 1. Find scheduled reminders that are due.
  const { data: due, error: dueErr } = await db
    .from('reminders')
    .select('*')
    .eq('status', 'scheduled')
    .lte('fire_at', nowIso)
    .limit(200);
  if (dueErr) {
    return NextResponse.json({ error: dueErr.message }, { status: 500 });
  }

  const results: { id: string; status: string; errors: string[] }[] = [];

  for (const r of (due ?? []) as Reminder[]) {
    const errors: string[] = [];

    // 2. Emit the next recurrence BEFORE marking this one fired so a crash
    //    mid-batch doesn't lose the schedule.
    if (r.recurrence) {
      const next = computeNextFire(r.fire_at, r.recurrence);
      if (next) {
        const { error: insErr } = await db.from('reminders').insert({
          created_by: r.created_by,
          target_user_id: r.target_user_id,
          note: r.note,
          fire_at: next,
          claim_id: r.claim_id,
          recurrence: r.recurrence,
          channels: r.channels,
        });
        if (insErr) errors.push(`recurrence insert: ${insErr.message}`);
      }
    }

    // 3. Conditional UPDATE — idempotent against double-tick.
    const { data: updated, error: updErr } = await db
      .from('reminders')
      .update({ status: 'fired', fired_at: nowIso })
      .eq('id', r.id)
      .eq('status', 'scheduled')
      .select('id')
      .maybeSingle();
    if (updErr) {
      errors.push(`fire update: ${updErr.message}`);
      results.push({ id: r.id, status: 'skipped', errors });
      continue;
    }
    if (!updated) {
      // Another worker got it first.
      results.push({ id: r.id, status: 'already_fired', errors });
      continue;
    }

    // 4. Email channel
    if (r.channels.email) {
      const { data: profile } = await db
        .from('profiles')
        .select('email, full_name')
        .eq('id', r.target_user_id)
        .maybeSingle();
      if (profile?.email) {
        const subject = r.note.slice(0, 80);
        const text =
          `${r.note}\n\n` +
          (r.claim_id ? `Linked claim: ${r.claim_id}\n` : '') +
          `Open HamsPortal: https://modern-tools-rho.vercel.app/`;
        const emailResult = await sendEmail({
          to: profile.email,
          subject: `[HamsPortal reminder] ${subject}`,
          text,
        });
        if (!emailResult.ok) errors.push(`email: ${emailResult.error}`);
      }
    }

    // 5. Push channel
    if (r.channels.push) {
      const { data: subs } = await db
        .from('push_subscriptions')
        .select('id, endpoint, p256dh, auth')
        .eq('user_id', r.target_user_id);
      for (const sub of subs ?? []) {
        const res = await sendPush(sub, {
          title: 'HamsPortal reminder',
          body: r.note.slice(0, 180),
          url: r.claim_id ? `/claims/${r.claim_id}` : '/',
        });
        if (res.shouldPrune) {
          await db.from('push_subscriptions').delete().eq('id', sub.id);
        } else if (res.status >= 400) {
          errors.push(`push ${sub.endpoint.slice(0, 40)}: ${res.status}`);
        }
      }
    }

    results.push({ id: r.id, status: 'fired', errors });
  }

  // 6. Daily prune — only run near the top of the hour at 03:00 UTC to keep
  //    load off most ticks. Cheap enough that running every minute would also
  //    be fine, but limiting it reduces noise.
  const now = new Date();
  if (now.getUTCHours() === 3 && now.getUTCMinutes() === 0) {
    const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    await db
      .from('reminders')
      .delete()
      .in('status', ['acknowledged', 'dismissed'])
      .lt('fired_at', cutoff);
  }

  return NextResponse.json({ fired: results.length, results });
}
```

- [ ] **Step 2: Add or update `vercel.json`**

Check if `vercel.json` exists:

Run: `test -f vercel.json && cat vercel.json || echo "missing"`

If missing, create it:

```json
{
  "crons": [
    { "path": "/api/reminders/tick", "schedule": "* * * * *" }
  ]
}
```

If it exists, merge in the `crons` array. (Note: Vercel Cron doesn't support custom headers directly — the shared secret is checked against the request's URL/path pattern. For Vercel Cron, the secret can also be set via `CRON_SECRET` and auto-forwarded. See https://vercel.com/docs/cron-jobs/security for the current pattern. If the current docs say to use `authorization: Bearer <CRON_SECRET>` instead of `x-cron-secret`, update the route to read the Authorization header.)

- [ ] **Step 3: Smoke-test the tick manually (dev server)**

Start the dev server. Insert a scheduled row directly via Supabase table editor with `fire_at = now()`. Then:

```
curl -i -X POST "http://localhost:3000/api/reminders/tick" -H "x-cron-secret: <REMINDERS_CRON_SECRET>"
```

Expected: `200` with a result array showing the row was `fired`. Row in DB should show `status='fired'` and `fired_at` populated. If `channels.email` was true, an email arrives at the target user's inbox.

- [ ] **Step 4: Smoke-test the auth guard**

```
curl -i -X POST "http://localhost:3000/api/reminders/tick"
```

Expected: `403`.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`

- [ ] **Step 6: Commit**

```
git add src/app/api/reminders/tick/route.ts vercel.json
git commit -m "feat(reminders): cron tick route — fan-out + recurrence emission"
```

---

## Task 10: Realtime provider + toast component

**Files:**
- Create: `src/components/reminders/reminders-realtime-provider.tsx`
- Create: `src/components/reminders/reminder-toast.tsx`

- [ ] **Step 1: Write `src/components/reminders/reminder-toast.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { Reminder } from '@/lib/reminders/types';

type Props = {
  reminder: Reminder;
  onAck: (id: string) => void;
  onSnooze: (id: string, until: string) => void;
  onDismiss: (id: string) => void;
};

function snoozeTime(preset: '10m' | '1h' | 'tomorrow9'): string {
  const d = new Date();
  if (preset === '10m') d.setMinutes(d.getMinutes() + 10);
  else if (preset === '1h') d.setHours(d.getHours() + 1);
  else if (preset === 'tomorrow9') {
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
  }
  return d.toISOString();
}

export function ReminderToast({ reminder, onAck, onSnooze, onDismiss }: Props) {
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  return (
    <div className="w-80 rounded-xl border border-amber-300 bg-amber-50 shadow-lg p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-semibold text-amber-900">🔔 Reminder</div>
        <button
          onClick={() => onDismiss(reminder.id)}
          className="text-amber-700 hover:text-amber-900 text-xs"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
      <div className="mt-1 text-sm text-neutral-900 whitespace-pre-wrap">{reminder.note}</div>
      {reminder.claim_id && (
        <a
          className="mt-2 inline-block text-xs underline text-amber-800"
          href={`/claims/${reminder.claim_id}`}
        >
          Open claim →
        </a>
      )}
      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" onClick={() => onAck(reminder.id)}>Done</Button>
        <div className="relative">
          <Button size="sm" variant="secondary" onClick={() => setSnoozeOpen((v) => !v)}>
            Snooze ▾
          </Button>
          {snoozeOpen && (
            <div className="absolute left-0 bottom-full mb-1 w-36 rounded-md border bg-white shadow z-10">
              <button
                className="block w-full text-left px-3 py-1.5 text-xs hover:bg-neutral-100"
                onClick={() => { setSnoozeOpen(false); onSnooze(reminder.id, snoozeTime('10m')); }}
              >
                10 minutes
              </button>
              <button
                className="block w-full text-left px-3 py-1.5 text-xs hover:bg-neutral-100"
                onClick={() => { setSnoozeOpen(false); onSnooze(reminder.id, snoozeTime('1h')); }}
              >
                1 hour
              </button>
              <button
                className="block w-full text-left px-3 py-1.5 text-xs hover:bg-neutral-100"
                onClick={() => { setSnoozeOpen(false); onSnooze(reminder.id, snoozeTime('tomorrow9')); }}
              >
                Tomorrow 9am
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write `src/components/reminders/reminders-realtime-provider.tsx`**

```tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Reminder } from '@/lib/reminders/types';
import { ReminderToast } from './reminder-toast';

export function RemindersRealtimeProvider() {
  const [queue, setQueue] = useState<Reminder[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      setUserId(data.user.id);

      // Pull any already-fired reminders the user hasn't acted on yet.
      const { data: fired } = await supabase
        .from('reminders')
        .select('*')
        .eq('target_user_id', data.user.id)
        .eq('status', 'fired')
        .order('fired_at', { ascending: true });
      if (fired && fired.length) setQueue(fired as Reminder[]);

      channel = supabase
        .channel('reminders-realtime')
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'reminders',
            filter: `target_user_id=eq.${data.user.id}`,
          },
          (payload) => {
            const row = payload.new as Reminder;
            if (row.status === 'fired' && row.channels.in_app) {
              setQueue((q) => (q.some((r) => r.id === row.id) ? q : [...q, row]));
            } else {
              // row was acked/snoozed/dismissed from another device — drop from queue.
              setQueue((q) => q.filter((r) => r.id !== row.id));
            }
          }
        )
        .subscribe();
    })();

    return () => {
      if (channel) channel.unsubscribe();
    };
  }, []);

  const callAction = useCallback(
    async (id: string, body: Record<string, unknown>) => {
      await fetch(`/api/reminders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setQueue((q) => q.filter((r) => r.id !== id));
    },
    []
  );

  const onAck = useCallback((id: string) => callAction(id, { action: 'acknowledge' }), [callAction]);
  const onDismiss = useCallback((id: string) => callAction(id, { action: 'dismiss' }), [callAction]);
  const onSnooze = useCallback(
    (id: string, until: string) => callAction(id, { action: 'snooze', snooze_until: until }),
    [callAction]
  );

  if (!userId || queue.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {queue.map((r) => (
        <ReminderToast
          key={r.id}
          reminder={r}
          onAck={onAck}
          onDismiss={onDismiss}
          onSnooze={onSnooze}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Mount the provider in the root layout**

Edit `src/app/layout.tsx` and add the import + mount inside the existing body wrapper (after children or wherever a globally-mounted component makes sense in the current layout — read the file first to pick the correct spot):

```tsx
import { RemindersRealtimeProvider } from '@/components/reminders/reminders-realtime-provider';
// ... inside <body>, next to any other global providers:
<RemindersRealtimeProvider />
```

Do NOT add on the `/login` page (gate inside the component — it already short-circuits when no user is logged in, so no explicit route check needed).

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Smoke-test**

- Dev server running.
- Logged in as yourself in a browser tab.
- From a second terminal, manually flip a reminder row (one with `channels.in_app=true` and `target_user_id` = your user) to `status='fired'` + `fired_at=now()` in the Supabase table editor.
- Expected: within a second, the toast appears bottom-right of your browser tab. Click "Done" → toast disappears, row's `status` flips to `acknowledged` in DB.

- [ ] **Step 6: Commit**

```
git add src/components/reminders/reminder-toast.tsx src/components/reminders/reminders-realtime-provider.tsx src/app/layout.tsx
git commit -m "feat(reminders): realtime toast provider + in-app popup"
```

---

## Task 11: Sidebar — list view

**Files:**
- Create: `src/components/reminders/reminder-row.tsx`
- Create: `src/components/reminders/reminders-sidebar.tsx`

- [ ] **Step 1: Write `src/components/reminders/reminder-row.tsx`**

```tsx
'use client';

import type { Reminder } from '@/lib/reminders/types';

function relativeTime(iso: string): string {
  const now = Date.now();
  const t = new Date(iso).getTime();
  const diff = t - now;
  const abs = Math.abs(diff);
  const minutes = Math.round(abs / 60000);
  const hours = Math.round(abs / 3600000);
  const days = Math.round(abs / 86400000);
  const prefix = diff < 0 ? '' : 'in ';
  const suffix = diff < 0 ? ' ago' : '';
  if (minutes < 60) return `${prefix}${minutes}m${suffix}`;
  if (hours < 48) return `${prefix}${hours}h${suffix}`;
  return `${prefix}${days}d${suffix}`;
}

type Props = {
  reminder: Reminder;
  onDelete?: (id: string) => void;
};

export function ReminderRow({ reminder, onDelete }: Props) {
  return (
    <div className="group flex items-start gap-2 py-2 border-b border-neutral-100 last:border-b-0">
      <div className="w-16 shrink-0 text-xs text-neutral-500 pt-0.5">
        {relativeTime(reminder.fire_at)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-neutral-900 truncate">{reminder.note}</div>
        {reminder.claim_id && (
          <a
            href={`/claims/${reminder.claim_id}`}
            className="mt-0.5 inline-block text-[11px] text-blue-600 hover:underline"
          >
            → claim
          </a>
        )}
      </div>
      {onDelete && (
        <button
          onClick={() => onDelete(reminder.id)}
          className="opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-red-600 text-xs"
          aria-label="Delete"
        >
          ×
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write `src/components/reminders/reminders-sidebar.tsx`**

```tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import type { Reminder } from '@/lib/reminders/types';
import { ReminderRow } from './reminder-row';
import { CreateReminderSheet } from './create-reminder-sheet';

function groupUpcoming(items: Reminder[]): { label: string; items: Reminder[] }[] {
  const now = new Date();
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const endOfTomorrow = new Date(endOfToday);
  endOfTomorrow.setDate(endOfTomorrow.getDate() + 1);
  const endOfWeek = new Date(endOfToday);
  endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfToday.getDay()));

  const buckets: Record<string, Reminder[]> = { Today: [], Tomorrow: [], 'This week': [], Later: [] };
  for (const r of items) {
    const t = new Date(r.fire_at).getTime();
    if (t <= endOfToday.getTime()) buckets.Today.push(r);
    else if (t <= endOfTomorrow.getTime()) buckets.Tomorrow.push(r);
    else if (t <= endOfWeek.getTime()) buckets['This week'].push(r);
    else buckets.Later.push(r);
  }
  return Object.entries(buckets)
    .filter(([, arr]) => arr.length > 0)
    .map(([label, items]) => ({ label, items }));
}

type Tab = 'upcoming' | 'sent' | 'done';

export function RemindersSidebar() {
  const [tab, setTab] = useState<Tab>('upcoming');
  const [items, setItems] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);

  const load = useCallback(async (which: Tab) => {
    setLoading(true);
    const res = await fetch(`/api/reminders?tab=${which}`);
    const data = await res.json();
    setItems(data.reminders ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(tab); }, [tab, load]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('Delete this reminder?')) return;
    await fetch(`/api/reminders/${id}`, { method: 'DELETE' });
    setItems((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const upcomingCount = tab === 'upcoming' ? items.length : null;

  return (
    <aside className="w-64 shrink-0 rounded-xl border border-neutral-200 bg-white p-3">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold flex items-center gap-1">
          🔔 Reminders
          {upcomingCount !== null && upcomingCount > 0 && (
            <span className="text-xs bg-amber-100 text-amber-900 rounded-full px-1.5">
              {upcomingCount}
            </span>
          )}
        </h2>
        <Button size="sm" onClick={() => setSheetOpen(true)}>+ New</Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList className="grid grid-cols-3 w-full h-8">
          <TabsTrigger value="upcoming" className="text-xs">Upcoming</TabsTrigger>
          <TabsTrigger value="sent" className="text-xs">Sent</TabsTrigger>
          <TabsTrigger value="done" className="text-xs">Done</TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="mt-2">
          {loading ? (
            <div className="text-xs text-neutral-500 py-4 text-center">Loading…</div>
          ) : items.length === 0 ? (
            <div className="text-xs text-neutral-500 py-4 text-center">Nothing upcoming.</div>
          ) : (
            groupUpcoming(items).map((g) => (
              <div key={g.label} className="mt-2">
                <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">
                  {g.label}
                </div>
                {g.items.map((r) => (
                  <ReminderRow key={r.id} reminder={r} onDelete={handleDelete} />
                ))}
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="sent" className="mt-2">
          {loading ? (
            <div className="text-xs text-neutral-500 py-4 text-center">Loading…</div>
          ) : items.length === 0 ? (
            <div className="text-xs text-neutral-500 py-4 text-center">Nothing sent.</div>
          ) : (
            items.map((r) => <ReminderRow key={r.id} reminder={r} onDelete={handleDelete} />)
          )}
        </TabsContent>

        <TabsContent value="done" className="mt-2">
          {loading ? (
            <div className="text-xs text-neutral-500 py-4 text-center">Loading…</div>
          ) : items.length === 0 ? (
            <div className="text-xs text-neutral-500 py-4 text-center">Nothing done yet.</div>
          ) : (
            items.map((r) => <ReminderRow key={r.id} reminder={r} />)
          )}
        </TabsContent>
      </Tabs>

      <CreateReminderSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onCreated={() => load(tab)}
      />
    </aside>
  );
}
```

- [ ] **Step 3: Type-check (expected to fail — `CreateReminderSheet` not yet defined)**

Run: `npx tsc --noEmit`
Expected: error "Cannot find module './create-reminder-sheet'". We fix that in Task 12 — proceed anyway for now.

- [ ] **Step 4: Commit (does not pass tsc yet — commit anyway to keep the plan task-sized; Task 12 fixes it)**

```
git add src/components/reminders/reminder-row.tsx src/components/reminders/reminders-sidebar.tsx
git commit -m "feat(reminders): dashboard sidebar list — WIP, CreateReminderSheet pending"
```

---

## Task 12: Create reminder sheet

**Files:**
- Create: `src/components/reminders/create-reminder-sheet.tsx`

- [ ] **Step 1: Write `src/components/reminders/create-reminder-sheet.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { ReminderChannels, ReminderRecurrence } from '@/lib/reminders/types';

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
};

type UserOption = { id: string; full_name: string | null; role: string };
type ClaimOption = { id: string; label: string };

function toIsoLocal(d: Date): string {
  // Formats a Date as the value expected by <input type="datetime-local">
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function presetTime(preset: 'in1h' | 'in4h' | 'tomorrow9' | 'nextMon9'): Date {
  const d = new Date();
  if (preset === 'in1h') d.setHours(d.getHours() + 1);
  else if (preset === 'in4h') d.setHours(d.getHours() + 4);
  else if (preset === 'tomorrow9') {
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
  } else if (preset === 'nextMon9') {
    const day = d.getDay();
    const diff = (8 - day) % 7 || 7; // next Monday (even if today is Monday)
    d.setDate(d.getDate() + diff);
    d.setHours(9, 0, 0, 0);
  }
  return d;
}

export function CreateReminderSheet({ open, onClose, onCreated }: Props) {
  const [me, setMe] = useState<UserOption | null>(null);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [targets, setTargets] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [fireLocal, setFireLocal] = useState(toIsoLocal(presetTime('in1h')));
  const [claims, setClaims] = useState<ClaimOption[]>([]);
  const [claimId, setClaimId] = useState<string | null>(null);
  const [channels, setChannels] = useState<ReminderChannels>({
    in_app: true,
    push: false,
    email: false,
  });
  const [recurrence, setRecurrence] = useState<ReminderRecurrence | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load current user + target options when the sheet opens.
  useEffect(() => {
    if (!open) return;
    (async () => {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('is_active', true)
        .order('full_name');
      const list = (profiles ?? []) as UserOption[];
      const myProfile = list.find((u) => u.id === userData.user!.id) ?? null;
      setMe(myProfile);
      // Appraisers: self + admins only. Admins: everyone.
      if (myProfile?.role === 'admin') {
        setUsers(list);
      } else {
        setUsers(list.filter((u) => u.id === myProfile?.id || u.role === 'admin'));
      }
      if (myProfile) setTargets([myProfile.id]);

      const { data: claimRows } = await supabase
        .from('acv_history')
        .select('id, ma_number, claim')
        .limit(500);
      const claimOpts: ClaimOption[] = (claimRows ?? []).map((c) => {
        const insured =
          (c as { claim?: { insuredName?: string } }).claim?.insuredName ?? '';
        const ma = (c as { ma_number?: string }).ma_number ?? '';
        return { id: (c as { id: string }).id, label: `${ma || c.id} · ${insured}` };
      });
      setClaims(claimOpts);
    })();
  }, [open]);

  const toggleTarget = (id: string) => {
    setTargets((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  };

  const applyPreset = (preset: 'in1h' | 'in4h' | 'tomorrow9' | 'nextMon9') => {
    setFireLocal(toIsoLocal(presetTime(preset)));
  };

  const submit = async () => {
    setError(null);
    if (targets.length === 0) return setError('Pick at least one recipient.');
    if (!note.trim()) return setError('Note required.');
    if (!channels.in_app && !channels.push && !channels.email) {
      return setError('Pick at least one delivery channel.');
    }
    setSubmitting(true);
    const fireAt = new Date(fireLocal).toISOString();
    const res = await fetch('/api/reminders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_user_ids: targets,
        note,
        fire_at: fireAt,
        claim_id: claimId,
        recurrence,
        channels,
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'request failed' }));
      setError(body.error ?? 'request failed');
      return;
    }
    // Reset the form and close.
    setNote('');
    setClaimId(null);
    setRecurrence(null);
    setChannels({ in_app: true, push: false, email: false });
    onCreated();
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-96 bg-white shadow-xl p-4 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">New reminder</h2>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-900">×</button>
        </div>

        <label className="block text-xs font-medium mb-1">Who</label>
        <div className="max-h-40 overflow-y-auto border rounded-md p-2 mb-3 text-sm">
          {users.map((u) => (
            <label key={u.id} className="flex items-center gap-2 py-0.5 cursor-pointer">
              <input
                type="checkbox"
                checked={targets.includes(u.id)}
                onChange={() => toggleTarget(u.id)}
              />
              <span>
                {u.id === me?.id ? 'Myself' : u.full_name || '(unnamed)'}
                {u.role === 'admin' && u.id !== me?.id && (
                  <span className="ml-1 text-[10px] text-neutral-500">admin</span>
                )}
              </span>
            </label>
          ))}
        </div>

        <label className="block text-xs font-medium mb-1">What</label>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. follow up on 3964743 Lord Explorer DV"
          rows={3}
          maxLength={1000}
          className="mb-3"
        />

        <label className="block text-xs font-medium mb-1">When</label>
        <div className="flex flex-wrap gap-1 mb-2">
          <button type="button" className="text-xs px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200" onClick={() => applyPreset('in1h')}>In 1h</button>
          <button type="button" className="text-xs px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200" onClick={() => applyPreset('in4h')}>In 4h</button>
          <button type="button" className="text-xs px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200" onClick={() => applyPreset('tomorrow9')}>Tomorrow 9am</button>
          <button type="button" className="text-xs px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200" onClick={() => applyPreset('nextMon9')}>Next Mon 9am</button>
        </div>
        <Input
          type="datetime-local"
          value={fireLocal}
          onChange={(e) => setFireLocal(e.target.value)}
          className="mb-3"
        />

        <label className="block text-xs font-medium mb-1">Repeat</label>
        <select
          className="w-full border rounded-md px-2 py-1 text-sm mb-3"
          value={recurrence?.freq ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) setRecurrence(null);
            else setRecurrence({ freq: v as 'daily' | 'weekly' | 'monthly', interval: 1, end_at: null });
          }}
        >
          <option value="">None</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>

        <label className="block text-xs font-medium mb-1">Link to claim (optional)</label>
        <select
          className="w-full border rounded-md px-2 py-1 text-sm mb-3"
          value={claimId ?? ''}
          onChange={(e) => setClaimId(e.target.value || null)}
        >
          <option value="">— no claim —</option>
          {claims.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>

        <label className="block text-xs font-medium mb-1">Channels</label>
        <div className="flex flex-col gap-1 mb-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={channels.in_app}
              onChange={(e) => setChannels({ ...channels, in_app: e.target.checked })}
            />
            In-app popup
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={channels.push}
              onChange={async (e) => {
                if (e.target.checked && typeof window !== 'undefined' && 'Notification' in window) {
                  const perm = await Notification.requestPermission();
                  if (perm !== 'granted') {
                    alert('Browser push requires notification permission.');
                    return;
                  }
                }
                setChannels({ ...channels, push: e.target.checked });
              }}
            />
            Browser push
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={channels.email}
              onChange={(e) => setChannels({ ...channels, email: e.target.checked })}
            />
            Email
          </label>
        </div>

        {error && <div className="text-sm text-red-600 mb-2">{error}</div>}

        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? 'Creating…' : 'Create reminder'}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors remaining from Task 11.

- [ ] **Step 3: Smoke-test the create flow**

Dev server + logged in. On `/`, you don't see the sidebar yet (Task 13 wires that up). Instead, in a scratch page or via the browser console, mount `<CreateReminderSheet open onClose={...} onCreated={...}/>`. Or wait for Task 13 and smoke-test both together.

- [ ] **Step 4: Commit**

```
git add src/components/reminders/create-reminder-sheet.tsx
git commit -m "feat(reminders): create-reminder sheet"
```

---

## Task 13: Mount the sidebar on the dashboard

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Read the current `src/app/page.tsx`**

The dashboard currently renders `<DashboardTabs>` above `<ClaimsTable>`. We want to wrap the tabs + table in a flex row and put the sidebar on the right.

- [ ] **Step 2: Edit `src/app/page.tsx`**

Add the import:

```tsx
import { RemindersSidebar } from '@/components/reminders/reminders-sidebar';
```

Wrap the existing main content in a flex row (approximate structure — adapt to the actual file):

```tsx
<div className="flex gap-4">
  <div className="flex-1 min-w-0">
    {/* existing dashboard-tabs + claims-table + whatever else was here */}
  </div>
  <RemindersSidebar />
</div>
```

Add a responsive breakpoint: at viewports narrower than lg (`<1024px`), the sidebar should drop below:

```tsx
<div className="flex flex-col lg:flex-row gap-4">
  {/* ... */}
</div>
```

- [ ] **Step 3: Smoke-test**

Dev server. Visit `/` while logged in. Expected: sidebar visible on the right with "Nothing upcoming." Click `+ New`. Fill in the form (recipient: Myself, note: "test", time: In 1h, channels: in-app only, no recurrence, no claim). Submit. Sidebar refreshes and shows the new reminder under "Later" (depending on how far "In 1h" is from midnight). Reload the page — reminder persists.

- [ ] **Step 4: Smoke-test the toast end-to-end**

Create another reminder with fire time 1 min from now, channels in_app only. Wait. Manually trigger the cron tick (`curl -i -X POST http://localhost:3000/api/reminders/tick -H "x-cron-secret: <secret>"`) or wait for the deployed cron if testing against prod. Expected: toast appears in the browser. Click Done → toast disappears, sidebar shows the row under Done tab.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`

- [ ] **Step 6: Commit**

```
git add src/app/page.tsx
git commit -m "feat(reminders): mount sidebar on dashboard"
```

---

## Task 14: Service worker registration + push opt-in

**Files:**
- Modify: `src/components/reminders/reminders-realtime-provider.tsx` (to add SW registration on mount)

- [ ] **Step 1: Add registration code to the realtime provider**

Inside the useEffect in `reminders-realtime-provider.tsx`, after the user is loaded, also register the service worker if supported:

```tsx
// register the push service worker (idempotent — browser dedupes)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch((err) => {
    // non-fatal — reminders still work via in-app toast
    console.warn('reminder sw registration failed', err);
  });
}
```

- [ ] **Step 2: Subscribe to push when the user grants permission**

Still inside the useEffect, after the SW is registered:

```tsx
if (
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  Notification.permission === 'granted'
) {
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!existing && vapid) {
    try {
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(vapid),
      });
      const json = sub.toJSON();
      await fetch('/api/reminders/push-subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
    } catch (err) {
      console.warn('push subscribe failed', err);
    }
  }
}
```

Add the helper function in the same file (top-level, before the component):

```tsx
function urlB64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
```

- [ ] **Step 3: Smoke-test**

Dev server + logged in. In the create-reminder sheet, check `Browser push`. Browser prompts for permission. Allow. Reload the page. In devtools → Application → Service Workers, you should see `/sw.js` registered. In Application → Push Messaging (or similar), you should see a subscription. In the Supabase table editor, `push_subscriptions` should have a row for your user.

- [ ] **Step 4: Smoke-test an actual push**

Create a reminder with fire time 1 min from now, channels push only (uncheck in_app). Wait + trigger the cron tick manually. Expected: a native browser notification appears (even if the HamsPortal tab is in the background).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`

- [ ] **Step 6: Commit**

```
git add src/components/reminders/reminders-realtime-provider.tsx
git commit -m "feat(reminders): register SW + subscribe to push on permission grant"
```

---

## Task 15: Final build + email smoke-test + deploy

**Files:**
- No code changes. This task is verification + ship.

- [ ] **Step 1: Full type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Full build**

Run: `npm run build`
Expected: build completes without errors.

- [ ] **Step 3: Email smoke-test**

In the dev server, create a reminder targeting yourself, channels email only, fire time 1 min from now. Trigger cron tick. Expected: email arrives in your inbox from the Resend sender.

- [ ] **Step 4: Pre-deploy inspect**

Run: `npx vercel inspect modern-tools-rho.vercel.app --scope henry-as-projects-88caed67`
Capture the current deploy id — this is your rollback target.

- [ ] **Step 5: Deploy**

Run: `npx vercel --prod --scope henry-as-projects-88caed67 --yes`

- [ ] **Step 6: Post-deploy verify**

Run: `npx vercel inspect modern-tools-rho.vercel.app --scope henry-as-projects-88caed67`
Expected: alias flipped to the new deploy id, status `● Ready`.

- [ ] **Step 7: Prod smoke-test**

Visit the live site. Create a reminder for 2 min out, channels in_app + push + email. Wait. All three should fire. Reload the page — Done tab shows the row.

- [ ] **Step 8: End-of-session SESSIONS.md entry**

Prepend a new entry to `docs/SESSIONS.md` summarizing the reminders feature per the standard format.

- [ ] **Step 9: Commit the SESSIONS.md entry**

```
git add docs/SESSIONS.md
git commit -m "docs: SESSIONS entry for reminders feature"
```

---

## Self-review (plan author — fill in before handing off)

**1. Spec coverage** — every section of the spec has a task:

- Spec §1 (sidebar) → Task 11, 13
- Spec §2 (create sheet) → Task 12
- Spec §3 (admin management via Sent tab) → covered by Task 11's Sent tab
- Spec §4 (data model + RLS) → Task 1
- Spec §5 (firing worker) → Task 9
- Spec §6 (browser push) → Tasks 6, 7, 14
- Spec §7 (email) → Tasks 8, 9
- Spec §8 (file layout) → matches Tasks 1-14
- Spec §9 (env vars) → Pre-flight

**2. Placeholder scan** — none found; every step shows the code it writes.

**3. Type consistency** — `Reminder`, `ReminderChannels`, `ReminderRecurrence`, `ReminderCreateInput`, `ReminderActionInput`, `ReminderUpdateInput` are defined in Task 2 and used identically in Tasks 4, 5, 9, 10, 12, 14. The `createClient()` helper from `@/lib/supabase/server` is used consistently in API routes. The service-role client is from `@/lib/supabase/service` as defined in `src/lib/supabase/service.ts`.

**4. Known gaps** —

- Task 11's commit intentionally leaves `tsc` broken (missing `CreateReminderSheet`). Task 12 fixes it before Task 13. Flagged in the task body so the executor doesn't panic.
- The admin broadcast groups ("All appraisers" / "All admins") are not in the create-sheet UI as explicit chips. Appraisers already see only self + admins, and admins see every user — admins can multi-select the full list to replicate a broadcast. If the explicit group chip is desired, add it as a follow-up (not blocking).
- Vercel Cron's current auth pattern may use `Authorization: Bearer <CRON_SECRET>` instead of `x-cron-secret`. Task 9 Step 2 notes this; adjust the tick route's header check if the current Vercel docs say so.

---

**Plan complete and saved to `docs/superpowers/plans/2026-10-03-dashboard-reminders.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
