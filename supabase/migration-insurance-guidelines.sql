-- =========================================================================
-- Modern Tools — Insurance Guidelines migration (2026-08-26)
-- Run in the Supabase SQL Editor (Dashboard -> SQL Editor).
--
-- Adds a directory of per-insurance-company guidelines. Admins manage the
-- content (add/edit/delete + CSV import); everyone with access to a claim
-- can read the guidelines for that claim's insurer via the workspace tab.
--
-- Matching: `name_key` (lowercased name) is unique, used to look up the
-- guideline row for a claim's insurance company. Duplicate detection uses
-- the same key so case/whitespace variations are treated as the same
-- company on import.
-- =========================================================================

create table if not exists public.insurance_guidelines (
  id text primary key,
  name text not null,
  name_key text not null unique,
  guidelines text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

create index if not exists insurance_guidelines_name_key_idx
  on public.insurance_guidelines(name_key);

alter table public.insurance_guidelines enable row level security;

drop policy if exists insurance_guidelines_read  on public.insurance_guidelines;
drop policy if exists insurance_guidelines_write on public.insurance_guidelines;

-- Every signed-in user can read guidelines (they need them while working claims).
create policy insurance_guidelines_read on public.insurance_guidelines for select
  using (auth.role() = 'authenticated');

-- Only admins can write (create/update/delete).
create policy insurance_guidelines_write on public.insurance_guidelines for all
  using (public.is_admin())
  with check (public.is_admin());

-- Verification
select 'insurance_guidelines table exists' as label,
       count(*) filter (where table_name = 'insurance_guidelines') as value
  from information_schema.tables where table_schema = 'public'
union all
select 'insurance_guidelines policies',
       count(*) from pg_policies where schemaname = 'public' and tablename = 'insurance_guidelines';
