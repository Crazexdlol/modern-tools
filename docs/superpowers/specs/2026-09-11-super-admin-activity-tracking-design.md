# Super-admin activity tracking — design

**Date:** 2026-09-11
**Author:** Claude (session with Henry)
**Status:** Approved for implementation

## Goal

Two coupled deliverables, requested together:

1. **Create a Henry Admin account** (`henryaleksanyan@gmail.com` / `Hratch33!`) that is the sole "super admin" for Modern Tools. Same permissions as a regular admin plus one extra capability: viewing app-usage analytics.
2. **Track per-user active time on Modern Tools** and expose totals for four windows — today, this week, this month, last 6 months — visible only to the super admin. Regular admins and appraisers are tracked but see no UI change.

## Non-goals

- No per-page / per-tool breakdown (e.g. "hours in ACV tab" vs "hours in Documents"). Only total app time.
- No live-presence indicators anywhere else in the app.
- No exports (CSV/PDF) of activity data in v1.
- No cross-tenant / multi-org support — Modern Tools has one company, one office timezone.
- No client-side retry/queueing for heartbeats — dropped ticks are acceptable.

## Super-admin model

Additive boolean flag on `profiles`, not a new role.

- Add `profiles.is_super_admin BOOLEAN NOT NULL DEFAULT false`.
- `Role` type stays `'admin' | 'appraiser'`. Every existing `role === 'admin'` check in the codebase (in `require-admin.ts`, `AdminGuard`, and any RLS policy) continues to work unchanged.
- The super admin's `role` is `'admin'`. They inherit every regular-admin permission automatically.
- `is_super_admin` gates exactly one thing in v1: visibility of the Activity settings page and its API routes.
- The existing `profiles_role_guard` trigger (introduced in `migration-handling-appraiser-flag.sql`) is extended to reject any UPDATE that flips `is_super_admin` from `false` → `true` unless the change is made via the service role. This makes the flag impossible to escalate through the admin UI.

### The Henry Admin account

Created by a one-shot bootstrap script (`scripts/bootstrap-henry-admin.mjs`) that runs off-Vercel via `node` against the Supabase service role, mirroring the pattern of `sync-claims-from-csv.mjs`.

1. `auth.admin.createUser({ email: 'henryaleksanyan@gmail.com', password: 'Hratch33!', email_confirm: true })`.
2. Insert into `profiles`:
   - `name`: `Henry Admin`
   - `email`: `henryaleksanyan@gmail.com`
   - `role`: `admin`
   - `is_super_admin`: `true`
   - `is_active`: `true`
   - `show_in_handling_appraiser_list`: `false` (system account — never a real handling appraiser on a claim)
   - All permission booleans (`can_reassign_claims`, `can_edit_claim_info`, `can_create_claims`): `true`
3. Idempotent: if the auth user already exists (script re-run), read its id and upsert the profile; do not overwrite an existing profile's `name`.

Script prints the created user id + email so Henry can confirm. Never logs the password.

## Client-side heartbeat

A React hook `useActivityHeartbeat()` mounted once at the root layout for every authenticated user.

### Detection

A tick counts only when all three conditions hold:

- `document.visibilityState === 'visible'` (tab is foreground)
- `document.hasFocus()` (browser window has focus)
- Last `mousemove` / `keydown` / `click` / `scroll` / `pointerdown` was less than **2 minutes** ago

The last-interaction timestamp is stored in a `useRef` inside the hook, updated by passive event listeners attached at mount and cleaned up at unmount.

### Firing

- Interval: every **60 seconds** while conditions hold.
- Transport: `navigator.sendBeacon('/api/activity/heartbeat', new Blob([], { type: 'application/json' }))`.
  - Falls back to `fetch(..., { keepalive: true })` if `sendBeacon` is unavailable (older browsers).
- No response body is read. Silent failure — no retry, no local buffer.

### Multi-tab

The hook fires from every tab. Dedup is server-side (see below), so opening the app in five tabs does not multiply the count.

### Where mounted

`src/app/layout.tsx` — an `<ActivityHeartbeat />` client component that renders nothing but calls the hook. Mounted inside the auth boundary (the middleware already redirects unauthed sessions to `/login`, so the layout only renders for authed users). If the user has no session, the hook does nothing on mount.

## Server side

### New table

```sql
create table user_activity_daily (
  user_id          uuid        not null references auth.users(id) on delete cascade,
  activity_date    date        not null,
  active_seconds   integer     not null default 0,
  last_tick_minute timestamptz null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (user_id, activity_date)
);

create index user_activity_daily_date_idx on user_activity_daily (activity_date);
```

- `activity_date` is a calendar date in `America/Los_Angeles`.
- `last_tick_minute` is a UTC timestamp truncated to the minute; used to dedup heartbeats across concurrent tabs.
- `on delete cascade` on the FK: if an auth user is ever deleted, their activity rows go with them (consistent with the existing pattern on `acv_history.user_id`).

### RLS

- **SELECT:** allowed when the caller's profile row has `is_super_admin = true`.
- **INSERT / UPDATE / DELETE:** denied for all authenticated callers. All writes go through the service role in `POST /api/activity/heartbeat`.

Policy sketch:

```sql
alter table user_activity_daily enable row level security;

create policy user_activity_daily_select_super_admin on user_activity_daily
  for select using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.is_super_admin = true
    )
  );
-- no other policies -> INSERT/UPDATE/DELETE denied for authenticated role
-- service role bypasses RLS as usual
```

### POST /api/activity/heartbeat

Node runtime. The middleware already skips `/api/*` for the login redirect, so the route is responsible for its own auth check.

1. Read caller via `@supabase/ssr`. If no user, return `204` silently (no error — a logged-out client should not spam logs).
2. Compute:
   - `activity_date` = current date in `America/Los_Angeles`, formatted `YYYY-MM-DD`.
   - `tick_minute` = current UTC time truncated to the minute.
3. Upsert via service role:
   ```sql
   INSERT INTO user_activity_daily (user_id, activity_date, active_seconds, last_tick_minute)
   VALUES ($uid, $date, 60, $minute)
   ON CONFLICT (user_id, activity_date) DO UPDATE
     SET active_seconds   = user_activity_daily.active_seconds + 60,
         last_tick_minute = EXCLUDED.last_tick_minute,
         updated_at       = now()
     WHERE user_activity_daily.last_tick_minute IS NULL
        OR user_activity_daily.last_tick_minute < EXCLUDED.last_tick_minute;
   ```
   The `WHERE` clause on the UPDATE is the dedup: if any other tab already credited this minute, the row's `last_tick_minute` is already `>=` ours and the UPDATE affects zero rows.
4. Return `204 No Content` on success. All errors logged and swallowed; never `4xx` / `5xx` back to the client.

### GET /api/activity/summary

Guarded by a new `requireSuperAdmin()` helper in `src/lib/auth/require-admin.ts` (parallel to `requireAdmin()`). Returns 403 for non-super-admins.

Single aggregation query grouped by `user_id`, joined to `profiles` for names and `isActive`:

```sql
select
  p.id, p.name, p.email, p.is_active,
  sum(case when d.activity_date = $today then d.active_seconds else 0 end)    as today_seconds,
  sum(case when d.activity_date >= $weekStart then d.active_seconds else 0 end) as week_seconds,
  sum(case when d.activity_date >= $monthStart then d.active_seconds else 0 end) as month_seconds,
  sum(case when d.activity_date >= $sixMonthsStart then d.active_seconds else 0 end) as six_months_seconds,
  max(d.last_tick_minute) as last_active_at
from profiles p
left join user_activity_daily d on d.user_id = p.id
group by p.id, p.name, p.email, p.is_active
order by max(d.last_tick_minute) desc nulls last;
```

Boundaries (all in `America/Los_Angeles`):
- `today` = current LA calendar date.
- `weekStart` = most recent Monday, LA calendar.
- `monthStart` = 1st of current LA calendar month.
- `sixMonthsStart` = `today - 180 days` (rolling window, not calendar 6 months).

Response shape:
```json
{
  "users": [
    {
      "userId": "uuid",
      "name": "Vahan Zurnachyan",
      "email": "vahan@...",
      "isActive": true,
      "today": 15120,
      "thisWeek": 79680,
      "thisMonth": 315660,
      "last6Months": 1843380,
      "lastActiveAt": "2026-09-11T18:04:00Z"
    }
  ]
}
```
All time values in seconds — the client formats.

### GET /api/activity/summary/[userId]

Same `requireSuperAdmin()` gate. Returns the raw last-180-days daily rows for one user:

```json
{
  "userId": "uuid",
  "name": "...",
  "days": [
    { "date": "2026-09-11", "activeSeconds": 15120, "lastTickAt": "..." },
    { "date": "2026-09-10", "activeSeconds": 24660, "lastTickAt": "..." }
  ]
}
```

Days with zero activity are omitted (the UI fills in gaps).

## UI

### Sidebar

`src/app/admin/settings/_settings-nav.tsx` gets a 7th item `{ href: '/admin/settings/activity', label: 'Activity', Icon: Activity }` (`Activity` from lucide-react).

The nav is a client component that already uses `useCurrentProfile()`; the Activity item is filtered out of the rendered list unless `profile.isSuperAdmin === true`. Regular admins never see the link.

### /admin/settings/activity — landing page

Server component. First-line guard: `<SuperAdminGuard />` (parallel to `AdminGuard`) which calls `notFound()` unless `profile.isSuperAdmin`.

Below the standard settings-nav layout, the page renders a client component that:

1. Fetches `GET /api/activity/summary` on mount.
2. Renders a table:

   | User | Today | This Week | This Month | Last 6 Months | Last Active |
   |---|---|---|---|---|---|

   - Rows sorted by `lastActiveAt` desc by default. Column headers clickable to re-sort.
   - Time values formatted as `Xh Ym` (e.g. `4h 12m`). Zero shown as `—`.
   - "Last Active" as relative time ("2 min ago", "3 hours ago", "yesterday", "5 days ago", "never").
   - Only `isActive === true` profiles by default. A "Show inactive" checkbox at the top toggles inactive profiles into the list (shown greyed).
   - Rows are clickable; each `<tr>` navigates to `/admin/settings/activity/[userId]`.
3. Loading state: skeleton rows.
4. Error state: red banner with retry button.

### /admin/settings/activity/[userId] — per-user drilldown

Server component with the same `SuperAdminGuard`.

Layout:
- **Header:** user name, email, "back to Activity" link.
- **Summary cards row:** four cards showing Today / This Week / This Month / Last 6 Months (same formatting as the table).
- **30-day bar chart:** one bar per day, oldest on left, today on right. Height = active seconds that day, normalized to the tallest bar. Days with zero data render as a thin base line. Hover shows date + `Xh Ym`. Pure Tailwind + divs — no chart library.
- **Monthly totals table:** last 6 months, columns Month / Active time. Months in LA calendar (`Aug 2026`, `Jul 2026`, ...).

Data fetch: `GET /api/activity/summary/[userId]` on mount.

## Migration

New file: `supabase/migration-super-admin-activity.sql` (+ `migration-super-admin-activity-rollback.sql`). Consistent with the pattern used by the recent completed-phase and handling-appraiser migrations.

Contents:
1. `alter table profiles add column is_super_admin boolean not null default false;`
2. Extend the `profiles_role_guard` trigger to also block `is_super_admin` UPDATE unless coming from service role.
3. Create `user_activity_daily` table + index + RLS policy.

Rollback:
1. Drop RLS policy, drop table.
2. Revert trigger to previous version.
3. `alter table profiles drop column is_super_admin;`

Henry runs the migration manually in the Supabase SQL editor before the bootstrap script and before the code deploy, in that order:
1. Migration
2. `node scripts/bootstrap-henry-admin.mjs` (creates the Henry Admin account with `is_super_admin = true`)
3. `vercel --prod` (ships the heartbeat + Activity UI)

Order matters only in that the bootstrap script needs the column to exist. If someone deploys the code before running the migration, heartbeats silently fail (which is fine per spec), and the Activity page shows an empty list (no rows in the missing table would 500 the query — see risk below).

## Risks and edge cases

- **Migration not yet run + code deployed:** the `user_activity_daily` table wouldn't exist. Heartbeats would 500 (swallowed silently by the route), and the Activity summary query would 500 too. Mitigation: the summary route catches "relation does not exist" (Postgres error `42P01`) and returns an empty user list with a warning header. Same defense pattern as `history.ts` uses for missing jsonb columns. This lets us ship the code before running the migration, and prevents a broken Activity page if the rollback is run without also reverting the code.
- **Clock skew between client and server:** the server assigns the minute bucket, so client clock drift can't inflate totals. Clients can only fire more/less often — they can't tell the server "I was active in the past."
- **User has clock way off / tab open across DST transition:** activity_date is computed server-side in `America/Los_Angeles`, so DST handles automatically. A tick fired at 01:59 PDT and one at 01:59 PST (an hour later) get different `last_tick_minute` values (UTC differs), so no dedup collision.
- **Multi-tab, same minute:** dedup'd server-side by the `last_tick_minute` UPDATE-WHERE clause. Verified: N tabs firing simultaneously credit exactly one 60s tick.
- **Same user opens app on laptop AND desktop at the same time:** same dedup applies. Only one tick credited per minute regardless of device count. This is intentional — we're measuring "how much time did the user spend using the app" not "how many devices."
- **What if Henry wants to see his own activity?** He can — Henry Admin appears in the user table like anyone else.
- **What about auto-status-request emails / server-driven actions that don't require the user to be present?** Not counted. Activity tracking is purely client-driven from a focused, interacting session.
- **`sendBeacon` blocked by content blockers / privacy extensions:** best-effort fallback to `fetch({ keepalive: true })`. If both are blocked, we lose that user's data — acceptable, since Modern Tools is an internal tool and no employee has a reason to block their own analytics.

## Testing

No test framework is configured in the repo (per `CLAUDE.md`). Verification is manual:

1. `npx tsc --noEmit` clean.
2. `npm run build` clean.
3. Run migration in a scratch Supabase project first (or on prod with confidence — it's additive).
4. Run bootstrap script; verify Henry Admin can log in with the given credentials and lands on Dashboard like a regular admin.
5. Verify a regular admin does NOT see the Activity nav item and gets 404 on `/admin/settings/activity`.
6. Verify Henry Admin sees the Activity nav item and lands on the summary table.
7. Verify a heartbeat request from a focused, interacting tab increments `active_seconds` by 60 in `user_activity_daily` (check via Supabase SQL editor).
8. Verify walking away for 2+ minutes stops the heartbeat.
9. Verify opening two tabs does NOT double-count (same-minute dedup).
10. Verify Activity page numbers match manual SQL aggregation for a known user.

## Files touched (implementation summary)

- `supabase/migration-super-admin-activity.sql` (new) + rollback.
- `scripts/bootstrap-henry-admin.mjs` (new).
- `src/lib/supabase/profiles.ts` — add `isSuperAdmin` to `Profile`; map from row column.
- `src/lib/auth/require-admin.ts` — add `requireSuperAdmin()`; extend `getCaller()` to also select `is_super_admin`.
- `src/app/admin/_guard.tsx` — export `SuperAdminGuard()`.
- `src/app/admin/settings/_settings-nav.tsx` — conditional Activity item.
- `src/app/admin/settings/activity/page.tsx` (new).
- `src/app/admin/settings/activity/activity-client.tsx` (new).
- `src/app/admin/settings/activity/[userId]/page.tsx` (new).
- `src/app/admin/settings/activity/[userId]/user-activity-client.tsx` (new).
- `src/app/api/activity/heartbeat/route.ts` (new).
- `src/app/api/activity/summary/route.ts` (new).
- `src/app/api/activity/summary/[userId]/route.ts` (new).
- `src/components/activity-heartbeat.tsx` (new client component, mounted in root layout).
- `src/app/layout.tsx` — mount `<ActivityHeartbeat />`.
