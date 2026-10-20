-- =========================================================================
-- HamsPortal — Status-Request Lockout migration (2026-10-10)
-- Run in the Supabase SQL Editor (Dashboard -> SQL Editor).
--
-- Extends the auto status-request feature with a lockout step:
--
--   anchor = latest non-auto message from the assigned appraiser (or
--            acv_history.assigned_at if they've never posted).
--
--   Day 3 business days silent  → 1st nag  (status_request_count = 1)
--   Day 4 business days silent  → 2nd nag  (status_request_count = 2)
--   Day 5 business days silent  → LOCKOUT  (status_lockout_at = now())
--
-- When locked, the appraiser is blocked from the dashboard and from every
-- claim EXCEPT the overdue one(s). Posting a non-auto message on an
-- overdue claim clears the lockout for that claim via trigger.
--
-- Changes:
--   * acv_history.status_request_count int  (0 = never nagged)
--   * acv_history.status_lockout_at timestamptz
--   * profiles.auto_status_requests_override default flipped FALSE → TRUE
--     and all existing rows backfilled to TRUE (opt-in → opt-out model).
--   * trigger: clear status_lockout_at + status_request_count when the
--     assigned appraiser posts a non-auto message
--   * trigger: clear status_lockout_at + status_request_count when a claim
--     is reassigned (so the new assignee doesn't inherit the old lockout)
-- =========================================================================

-- 1. New columns on acv_history
alter table public.acv_history
  add column if not exists status_request_count int not null default 0;

alter table public.acv_history
  add column if not exists status_lockout_at timestamptz;

create index if not exists acv_history_status_lockout_idx
  on public.acv_history(assigned_to, status)
  where status_lockout_at is not null;

-- 2. Backfill status_request_count for already-nagged claims.
-- We don't know how many nags were sent historically, but we know AT LEAST
-- one was sent (last_status_request_at is set). Treating it as count=1 means
-- those claims get one more nag then lockout — cleaner than instant-locking
-- on deploy.
update public.acv_history
  set status_request_count = 1
  where last_status_request_at is not null
    and status_request_count = 0;

-- 3. Flip profiles.auto_status_requests_override default to TRUE and
-- backfill every existing user to TRUE. Admins can still opt specific
-- users out via the admin UI.
--
-- The appraiser guard trigger blocks appraiser self-grants on this column,
-- but service_role (which this SQL Editor session is NOT) and admin bypass
-- it. SQL Editor connects as `postgres`, which isn't `service_role` — so
-- temporarily disable the role guard around the backfill, same pattern as
-- the 2026-10-10 seed migration.
alter table public.profiles
  alter column auto_status_requests_override set default true;

alter table public.profiles disable trigger profiles_role_guard;
update public.profiles
  set auto_status_requests_override = true
  where auto_status_requests_override is distinct from true;
alter table public.profiles enable trigger profiles_role_guard;

-- 4. Trigger: on message insert, if the sender is the claim's current
-- assigned appraiser AND it's not an auto-request, clear lockout state
-- on that claim.
create or replace function public.clear_status_lockout_on_appraiser_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_auto_request is true then return new; end if;
  if new.sender_id is null then return new; end if;

  update public.acv_history
    set status_lockout_at   = null,
        status_request_count = 0,
        last_status_request_at = null
    where id = new.claim_id
      and assigned_to = new.sender_id
      and (status_lockout_at is not null or status_request_count > 0);

  return new;
end;
$$;

drop trigger if exists trg_clear_status_lockout_on_appraiser_message on public.messages;
create trigger trg_clear_status_lockout_on_appraiser_message
  after insert on public.messages
  for each row
  execute function public.clear_status_lockout_on_appraiser_message();

-- 5. Trigger: on acv_history update where assigned_to changes, clear
-- lockout state. The new assignee shouldn't inherit the old assignee's
-- debt. (If the new assignee goes silent, the cron will re-establish the
-- clock from the new assigned_at.)
create or replace function public.clear_status_lockout_on_reassign()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.assigned_to is distinct from old.assigned_to then
    new.status_lockout_at    := null;
    new.status_request_count := 0;
    new.last_status_request_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_clear_status_lockout_on_reassign on public.acv_history;
create trigger trg_clear_status_lockout_on_reassign
  before update on public.acv_history
  for each row
  when (new.assigned_to is distinct from old.assigned_to)
  execute function public.clear_status_lockout_on_reassign();

-- 6. Verification
select 'acv_history.status_request_count exists' as label,
       count(*) filter (where column_name = 'status_request_count') as value
  from information_schema.columns
  where table_schema = 'public' and table_name = 'acv_history'
union all
select 'acv_history.status_lockout_at exists',
       count(*) filter (where column_name = 'status_lockout_at')
  from information_schema.columns
  where table_schema = 'public' and table_name = 'acv_history'
union all
select 'profiles opted in (should equal total profiles)',
       count(*) from public.profiles where auto_status_requests_override = true
union all
select 'profiles total',
       count(*) from public.profiles
union all
select 'claims with status_request_count > 0 (backfilled from prior nags)',
       count(*) from public.acv_history where status_request_count > 0
union all
select 'claim-message clear-lockout trigger installed',
       count(*) from pg_trigger where tgname = 'trg_clear_status_lockout_on_appraiser_message'
union all
select 'reassign clear-lockout trigger installed',
       count(*) from pg_trigger where tgname = 'trg_clear_status_lockout_on_reassign';
