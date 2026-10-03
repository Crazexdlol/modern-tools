-- =========================================================================
-- HamsPortal — Opposing Appraisers registry (2026-10-03)
-- Run in the Supabase SQL Editor (Dashboard -> SQL Editor).
-- Reverses cleanly with migration-opposing-appraisers-rollback.sql.
--
-- What this does:
--
--  1. Ensures pg_trgm extension exists (needed for fuzzy name search).
--  2. Creates public.opposing_appraisers table with all required fields,
--     soft-delete (archived_at), trigram GIN indexes on name + company,
--     and a partial unique index to block duplicate active rows.
--  3. Enables RLS:
--     - SELECT: any authenticated user (claim pickers need this).
--     - INSERT / UPDATE / DELETE: admin only (public.is_admin()).
--  4. Creates a local updated_at auto-bump trigger.
--  5. Verification SELECTs at the end (each should return 1).
--
-- Idempotent — safe to re-run.
-- =========================================================================

-- 1. Trigram extension (idempotent).
create extension if not exists pg_trgm;

-- 2. Table.
create table if not exists public.opposing_appraisers (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  company     text        null,
  phone       text        null,
  email       text        null,
  notes       text        null,
  archived_at timestamptz null,
  created_by  uuid        null references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 3. Trigram GIN indexes for fuzzy search.
create index if not exists opposing_appraisers_name_trgm_idx
  on public.opposing_appraisers using gin (name gin_trgm_ops);

create index if not exists opposing_appraisers_company_trgm_idx
  on public.opposing_appraisers using gin (company gin_trgm_ops)
  where company is not null;

-- 4. Unique partial index: no two active rows with same (lower(name), lower(company)).
--    Two people at the same company are different rows; the guard is name+company
--    combined so "John Smith" at "Sedgwick" stays separate from "John Smith" at null.
create unique index if not exists opposing_appraisers_active_name_company_udx
  on public.opposing_appraisers (lower(name), coalesce(lower(company), ''))
  where archived_at is null;

-- 5. Enable RLS.
alter table public.opposing_appraisers enable row level security;

-- SELECT: any authenticated user.
drop policy if exists "oa_select_authenticated" on public.opposing_appraisers;
create policy "oa_select_authenticated"
  on public.opposing_appraisers for select
  to authenticated
  using (true);

-- INSERT: admin only.
drop policy if exists "oa_insert_admin" on public.opposing_appraisers;
create policy "oa_insert_admin"
  on public.opposing_appraisers for insert
  to authenticated
  with check (public.is_admin());

-- UPDATE: admin only.
drop policy if exists "oa_update_admin" on public.opposing_appraisers;
create policy "oa_update_admin"
  on public.opposing_appraisers for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- DELETE: admin only (hard-delete is blocked at the API layer for v1;
--         soft-delete via archived_at is the standard path).
drop policy if exists "oa_delete_admin" on public.opposing_appraisers;
create policy "oa_delete_admin"
  on public.opposing_appraisers for delete
  to authenticated
  using (public.is_admin());

-- 6. updated_at auto-bump trigger.
create or replace function public.opposing_appraisers_bump_updated_at()
  returns trigger
  language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists opposing_appraisers_updated_at_trigger on public.opposing_appraisers;
create trigger opposing_appraisers_updated_at_trigger
  before update on public.opposing_appraisers
  for each row execute function public.opposing_appraisers_bump_updated_at();

-- =========================================================================
-- Verification (each query should return 1).
-- =========================================================================

-- Table exists?
select count(*)::int = 1 as table_ok
from information_schema.tables
where table_schema = 'public'
  and table_name   = 'opposing_appraisers';

-- pg_trgm extension exists?
select count(*)::int = 1 as extension_ok
from pg_extension
where extname = 'pg_trgm';

-- updated_at trigger exists?
select count(*)::int = 1 as trigger_ok
from information_schema.triggers
where event_object_schema = 'public'
  and event_object_table  = 'opposing_appraisers'
  and trigger_name        = 'opposing_appraisers_updated_at_trigger';
