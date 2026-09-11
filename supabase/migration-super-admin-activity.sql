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
