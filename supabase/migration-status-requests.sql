-- =========================================================================
-- Modern Tools — Auto Status Requests migration (2026-08-26)
-- Run in the Supabase SQL Editor (Dashboard -> SQL Editor).
--
-- Adds:
--   * messages.is_auto_request       — flags system-generated status requests
--   * acv_history.assigned_at        — when the current assignee was set
--   * acv_history.last_status_request_at — last time the cron sent a nag
--   * site_settings row 'auto_status_requests_enabled' seeded to FALSE
-- Backfills:
--   * assigned_at ← date column for any claim currently assigned (best-effort)
-- =========================================================================

-- 1. messages.is_auto_request
alter table public.messages
  add column if not exists is_auto_request boolean not null default false;

create index if not exists messages_auto_request_idx
  on public.messages(claim_id, is_auto_request);

-- 2. acv_history timestamps
alter table public.acv_history
  add column if not exists assigned_at timestamptz;

alter table public.acv_history
  add column if not exists last_status_request_at timestamptz;

-- 3. Backfill assigned_at for existing claims that already have an assignee.
-- Uses created_at as a best-effort approximation — we have no assignment-
-- change history. This just gives the cron a reference point on first pass
-- so already-assigned old claims don't all fire immediately.
update public.acv_history
  set assigned_at = created_at
  where assigned_to is not null and assigned_at is null;

-- 4. Seed the site setting to disabled — admin must explicitly turn it on.
insert into public.site_settings (key, value)
  values ('auto_status_requests_enabled', 'false'::jsonb)
  on conflict (key) do nothing;

-- 5. Verification (inspect the returned rows manually)
select 'messages.is_auto_request' as label,
       count(*) filter (where column_name = 'is_auto_request') as value
  from information_schema.columns
  where table_schema = 'public' and table_name = 'messages'
union all
select 'acv_history.assigned_at',
       count(*) filter (where column_name = 'assigned_at')
  from information_schema.columns
  where table_schema = 'public' and table_name = 'acv_history'
union all
select 'acv_history.last_status_request_at',
       count(*) filter (where column_name = 'last_status_request_at')
  from information_schema.columns
  where table_schema = 'public' and table_name = 'acv_history'
union all
select 'auto_status_requests_enabled seeded',
       count(*) from public.site_settings where key = 'auto_status_requests_enabled'
union all
select 'assigned_at backfilled rows',
       count(*) from public.acv_history where assigned_at is not null;
