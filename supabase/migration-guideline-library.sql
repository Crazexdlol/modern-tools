-- ============================================================
-- Modern Tools — Guideline Library migration (2026-09-12)
-- Run in the Supabase SQL Editor (Dashboard → SQL Editor).
-- Reverses cleanly with migration-guideline-library-rollback.sql.
--
-- Purpose:
--   Adds a shared library of repair-procedure / P-page / position-statement /
--   guideline reference documents that appraisers can attach to any Estimate
--   Review. Docs live in a dedicated storage bucket; metadata lives in a new
--   table.
--
-- Adds:
--   * public.guideline_documents table (id, title, notes, storage_path, ...)
--   * storage bucket 'guideline-library' (private)
--   * RLS: authenticated read; admin-only write (both table + storage)
--
-- Idempotent — safe to re-run.
-- ============================================================

-- 1. Table
create table if not exists public.guideline_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  notes text,
  storage_path text not null,
  file_size_bytes int,
  content_type text,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived boolean not null default false
);

create index if not exists guideline_documents_active_idx
  on public.guideline_documents(archived, created_at desc);

alter table public.guideline_documents enable row level security;

drop policy if exists "Authenticated read guideline_documents" on public.guideline_documents;
create policy "Authenticated read guideline_documents"
  on public.guideline_documents for select
  using (auth.role() = 'authenticated');

drop policy if exists "Admin write guideline_documents" on public.guideline_documents;
create policy "Admin write guideline_documents"
  on public.guideline_documents for all
  using (public.is_admin())
  with check (public.is_admin());

-- 2. Storage bucket + RLS (mirrors the claim-documents pattern but restricts
--    writes to admins). Reads are team-wide so any appraiser can pull the
--    docs into a review.
insert into storage.buckets (id, name, public)
values ('guideline-library', 'guideline-library', false)
on conflict (id) do nothing;

drop policy if exists "Authenticated read guideline files"   on storage.objects;
drop policy if exists "Admin upload guideline files"         on storage.objects;
drop policy if exists "Admin update guideline files"         on storage.objects;
drop policy if exists "Admin delete guideline files"         on storage.objects;

create policy "Authenticated read guideline files"
  on storage.objects for select
  using (bucket_id = 'guideline-library' and auth.role() = 'authenticated');

create policy "Admin upload guideline files"
  on storage.objects for insert
  with check (bucket_id = 'guideline-library' and public.is_admin());

create policy "Admin update guideline files"
  on storage.objects for update
  using (bucket_id = 'guideline-library' and public.is_admin());

create policy "Admin delete guideline files"
  on storage.objects for delete
  using (bucket_id = 'guideline-library' and public.is_admin());

-- 3. Verification
select 'guideline_documents table' as label, count(*)::int as value
  from information_schema.tables
  where table_schema = 'public' and table_name = 'guideline_documents'
union all
select 'guideline-library bucket', count(*)::int
  from storage.buckets
  where id = 'guideline-library';
