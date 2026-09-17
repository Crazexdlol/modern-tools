-- ============================================================
-- Modern Tools — Guideline Library ROLLBACK (2026-09-12)
-- Reverses migration-guideline-library.sql.
-- Run in the Supabase SQL Editor.
--
-- WARNING: this deletes uploaded guideline PDFs from the bucket as well.
-- ============================================================

drop policy if exists "Admin delete guideline files"       on storage.objects;
drop policy if exists "Admin update guideline files"       on storage.objects;
drop policy if exists "Admin upload guideline files"       on storage.objects;
drop policy if exists "Authenticated read guideline files" on storage.objects;

-- Empty the bucket before dropping (bucket delete fails if it has objects).
delete from storage.objects where bucket_id = 'guideline-library';
delete from storage.buckets where id = 'guideline-library';

drop policy if exists "Admin write guideline_documents"           on public.guideline_documents;
drop policy if exists "Authenticated read guideline_documents"    on public.guideline_documents;

drop table if exists public.guideline_documents;
