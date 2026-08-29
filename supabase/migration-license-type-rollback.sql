-- Rollback for supabase/migration-license-type.sql
alter table public.appraiser_licenses
  drop column if exists license_type;
