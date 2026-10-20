-- =========================================================================
-- HamsPortal — Activity ticks + sessions (2026-10-15)
-- Run in the Supabase SQL Editor. Rollback: migration-activity-ticks-and-sessions-rollback.sql
--
-- Extends the super-admin activity tracking (2026-09-11) with hourly
-- resolution + session boundary detection. Henry's ask: see WHEN during
-- the day someone was active, not just daily totals, and compute average
-- session length.
--
-- What this does:
--
--  1. Creates user_activity_ticks — one row per (user, minute). The heartbeat
--     endpoint already dedups via last_tick_minute on user_activity_daily;
--     this table stores every tick so the UI can draw per-hour / per-session
--     timelines without discarding earlier ticks of the day.
--
--  2. Creates user_sessions — a derived view of ticks grouped into sessions.
--     A session is a run of consecutive ticks with gaps <= 5 minutes.
--     The heartbeat endpoint upserts the latest open session on every tick:
--     extends ended_at if within 5 min, else closes the prior and opens a
--     new session row.
--
--  3. RLS: both tables SELECT-only for super-admins (matches
--     user_activity_daily). Writes done by service role.
-- =========================================================================

-- 1. Ticks.
create table if not exists public.user_activity_ticks (
  user_id      uuid        not null references auth.users(id) on delete cascade,
  tick_minute  timestamptz not null,
  primary key (user_id, tick_minute)
);

create index if not exists user_activity_ticks_user_time_idx
  on public.user_activity_ticks (user_id, tick_minute desc);

-- 2. Sessions.
create table if not exists public.user_sessions (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users(id) on delete cascade,
  started_at      timestamptz not null,
  ended_at        timestamptz not null,
  active_seconds  integer     not null,
  created_at      timestamptz not null default now()
);

create index if not exists user_sessions_user_started_idx
  on public.user_sessions (user_id, started_at desc);

-- 3. RLS.
alter table public.user_activity_ticks enable row level security;
alter table public.user_sessions       enable row level security;

drop policy if exists user_activity_ticks_select_super_admin on public.user_activity_ticks;
create policy user_activity_ticks_select_super_admin on public.user_activity_ticks
  for select
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.is_super_admin = true
    )
  );

drop policy if exists user_sessions_select_super_admin on public.user_sessions;
create policy user_sessions_select_super_admin on public.user_sessions
  for select
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.is_super_admin = true
    )
  );

-- No INSERT/UPDATE/DELETE policies — authenticated role is blocked; service
-- role bypasses RLS and does all writes from /api/activity/heartbeat.

-- 4. Verification.
select 'user_activity_ticks table exists' as label, count(*) as value
  from information_schema.tables
 where table_schema = 'public' and table_name = 'user_activity_ticks'
union all
select 'user_sessions table exists', count(*)
  from information_schema.tables
 where table_schema = 'public' and table_name = 'user_sessions'
union all
select 'RLS enabled on user_activity_ticks', count(*)
  from pg_tables
 where schemaname = 'public' and tablename = 'user_activity_ticks' and rowsecurity = true
union all
select 'RLS enabled on user_sessions', count(*)
  from pg_tables
 where schemaname = 'public' and tablename = 'user_sessions' and rowsecurity = true;
