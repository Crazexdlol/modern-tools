-- =========================================================================
-- Rollback for migration-status-lockout.sql (2026-10-10)
-- =========================================================================

-- 1. Drop triggers + functions
drop trigger if exists trg_clear_status_lockout_on_appraiser_message on public.messages;
drop function if exists public.clear_status_lockout_on_appraiser_message();

drop trigger if exists trg_clear_status_lockout_on_reassign on public.acv_history;
drop function if exists public.clear_status_lockout_on_reassign();

-- 2. Drop index + columns
drop index if exists public.acv_history_status_lockout_idx;
alter table public.acv_history drop column if exists status_lockout_at;
alter table public.acv_history drop column if exists status_request_count;

-- 3. Restore profiles.auto_status_requests_override default to FALSE.
-- We don't un-backfill the data — leaving everyone opted in on rollback
-- is harmless (the cron still gates on the flag; if the gate flips off,
-- no nags fire).
alter table public.profiles
  alter column auto_status_requests_override set default false;
