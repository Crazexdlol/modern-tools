-- =========================================================================
-- Modern Tools — License Type migration (2026-08-29)
-- Run in the Supabase SQL Editor (Dashboard -> SQL Editor).
--
-- Adds an optional `license_type` text column to appraiser_licenses so
-- admins can note WHAT KIND of license each row represents (e.g.
-- "Independent Adjuster", "Public Adjuster", "Motor Vehicle Damage
-- Appraiser"). Purely internal — never surfaced in the claim workspace.
-- =========================================================================

alter table public.appraiser_licenses
  add column if not exists license_type text;

select 'appraiser_licenses.license_type' as label,
       count(*) filter (where column_name = 'license_type')::int as value
  from information_schema.columns
  where table_schema = 'public' and table_name = 'appraiser_licenses';
