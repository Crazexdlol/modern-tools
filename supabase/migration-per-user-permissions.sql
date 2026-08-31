-- =========================================================================
-- Modern Tools — Per-User Permissions migration (2026-08-26)
-- Run in the Supabase SQL Editor (Dashboard -> SQL Editor).
--
-- Adds two per-user toggles to profiles so admins can grant granular
-- permissions without promoting the user to full admin:
--
--   * can_reassign_claims (bool, default false)
--       When true + the claim is currently assigned to this user, they
--       can reassign it (still enforced server-side by the /assign API).
--   * auto_status_requests_override (bool, nullable)
--       Per-user override for the 48h auto-status-request cron.
--       null  = follow the global auto_status_requests_enabled setting
--       true  = force ON  for this user (overrides global)
--       false = force OFF for this user (overrides global)
--
-- Both are additive — no data migration needed.
-- =========================================================================

alter table public.profiles
  add column if not exists can_reassign_claims boolean not null default false;

alter table public.profiles
  add column if not exists auto_status_requests_override boolean;

-- Verification
select 'profiles.can_reassign_claims' as label,
       count(*) filter (where column_name = 'can_reassign_claims') as value
  from information_schema.columns
  where table_schema = 'public' and table_name = 'profiles'
union all
select 'profiles.auto_status_requests_override',
       count(*) filter (where column_name = 'auto_status_requests_override')
  from information_schema.columns
  where table_schema = 'public' and table_name = 'profiles';
