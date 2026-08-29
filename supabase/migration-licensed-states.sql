-- =========================================================================
-- Modern Tools — Licensed States migration (2026-08-29)
-- Run in the Supabase SQL Editor (Dashboard -> SQL Editor).
--
-- Adds:
--   * licensed_states table (admin-editable list of states that require an
--     appraiser license). Small, ~10-50 rows tops.
--   * appraiser_licenses gets two new columns:
--       - status ('active' | 'expired' | 'pending', default 'active')
--       - issued_date (date, nullable)
--
-- Semantics: a license is "valid" only if status = 'active' AND
--   expiration_date > today. Everything else is not-licensed.
-- =========================================================================

-- 1. licensed_states
create table if not exists public.licensed_states (
  state text primary key,          -- 2-char USPS state code (uppercase)
  required boolean not null default true,
  notes text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.licensed_states enable row level security;

drop policy if exists "Authenticated read licensed_states" on public.licensed_states;
create policy "Authenticated read licensed_states"
  on public.licensed_states for select
  using (auth.role() = 'authenticated');

drop policy if exists "Admin write licensed_states" on public.licensed_states;
create policy "Admin write licensed_states"
  on public.licensed_states for all
  using (public.is_admin())
  with check (public.is_admin());

-- 2. appraiser_licenses extensions
alter table public.appraiser_licenses
  add column if not exists status text not null default 'active',
  add column if not exists issued_date date;

-- Optional check constraint to keep status sane.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'appraiser_licenses_status_check'
  ) then
    alter table public.appraiser_licenses
      add constraint appraiser_licenses_status_check
      check (status in ('active', 'expired', 'pending'));
  end if;
end
$$;

-- 3. Verification
select 'licensed_states table exists' as label,
       count(*)::int as value
  from information_schema.tables
  where table_schema = 'public' and table_name = 'licensed_states'
union all select 'appraiser_licenses.status', count(*) filter (where column_name = 'status')
  from information_schema.columns
  where table_schema = 'public' and table_name = 'appraiser_licenses'
union all select 'appraiser_licenses.issued_date', count(*) filter (where column_name = 'issued_date')
  from information_schema.columns
  where table_schema = 'public' and table_name = 'appraiser_licenses';
