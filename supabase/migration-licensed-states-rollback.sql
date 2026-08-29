-- =========================================================================
-- ROLLBACK for supabase/migration-licensed-states.sql
-- =========================================================================

alter table public.appraiser_licenses
  drop constraint if exists appraiser_licenses_status_check;

alter table public.appraiser_licenses
  drop column if exists status,
  drop column if exists issued_date;

drop table if exists public.licensed_states cascade;
