-- ============================================================
-- Modern Tools — Documents + DV Migration (2026-07-18, part 2)
-- Run in the Supabase SQL Editor (project ektglhdstobaipdqssjx).
-- Safe to re-run. Required for the Documents tab and DV tab.
-- ============================================================

-- 1) Per-claim document metadata + DV report state
alter table acv_history add column if not exists documents jsonb not null default '[]';
alter table acv_history add column if not exists dv jsonb;

-- 2) Storage bucket for claim documents (PDF copies + uploads)
insert into storage.buckets (id, name, public)
values ('claim-documents', 'claim-documents', false)
on conflict (id) do nothing;

-- 3) Storage policies: any signed-in team member can manage claim documents
drop policy if exists "Authenticated read claim documents"   on storage.objects;
drop policy if exists "Authenticated upload claim documents" on storage.objects;
drop policy if exists "Authenticated update claim documents" on storage.objects;
drop policy if exists "Authenticated delete claim documents" on storage.objects;

create policy "Authenticated read claim documents"
  on storage.objects for select
  using (bucket_id = 'claim-documents' and auth.role() = 'authenticated');

create policy "Authenticated upload claim documents"
  on storage.objects for insert
  with check (bucket_id = 'claim-documents' and auth.role() = 'authenticated');

create policy "Authenticated update claim documents"
  on storage.objects for update
  using (bucket_id = 'claim-documents' and auth.role() = 'authenticated');

create policy "Authenticated delete claim documents"
  on storage.objects for delete
  using (bucket_id = 'claim-documents' and auth.role() = 'authenticated');

-- Verify:
--   select id from storage.buckets where id = 'claim-documents';
--   select policyname from pg_policies where tablename = 'objects' and policyname like '%claim documents%';
