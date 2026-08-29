-- =========================================================================
-- ROLLBACK for supabase/migration-appraiser-profiles.sql
-- Restores site_settings rows to their pre-migration values (edit the
-- INSERT below before running to match what was live at the time).
-- Storage bucket 'appraiser-documents' must be removed manually via the
-- Supabase Dashboard.
-- =========================================================================

-- 1. Restore site_settings rows (EDIT these values to match your pre-migration state)
insert into public.site_settings (key, value)
  values
    ('allow_regular_create_claims', 'true'::jsonb),   -- <- SET to your prior value
    ('auto_status_requests_enabled', 'false'::jsonb)  -- <- SET to your prior value
  on conflict (key) do nothing;

-- 2. Drop tables (cascades drop policies + indexes)
drop table if exists public.appraiser_documents cascade;
drop table if exists public.appraiser_licenses cascade;
drop table if exists public.appraiser_fees cascade;
drop table if exists public.fee_catalog cascade;

-- 3. Drop profile columns
alter table public.profiles
  drop column if exists phone,
  drop column if exists address_street,
  drop column if exists address_city,
  drop column if exists address_state,
  drop column if exists address_zip,
  drop column if exists is_active;

-- Note: the permission backfill is NOT reversible without a snapshot of prior
-- per-user values. If you need to undo it, restore from your Supabase backup.
