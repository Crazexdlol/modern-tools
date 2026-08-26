-- =========================================================================
-- Rollback for supabase-migration-roles.sql
-- Restores authenticated-wide RLS on acv_history and drops everything the
-- migration added. No data on acv_history is lost (only new columns removed).
-- =========================================================================

-- Storage bucket policies -> restore permissive
drop policy if exists claim_docs_view   on storage.objects;
drop policy if exists claim_docs_upload on storage.objects;
drop policy if exists claim_docs_update on storage.objects;
drop policy if exists claim_docs_delete on storage.objects;

create policy "Authenticated users can view claim-documents"
  on storage.objects for select
  using (bucket_id = 'claim-documents' and auth.role() = 'authenticated');
create policy "Authenticated users can upload claim-documents"
  on storage.objects for insert
  with check (bucket_id = 'claim-documents' and auth.role() = 'authenticated');
create policy "Authenticated users can update claim-documents"
  on storage.objects for update
  using (bucket_id = 'claim-documents' and auth.role() = 'authenticated');
create policy "Authenticated users can delete claim-documents"
  on storage.objects for delete
  using (bucket_id = 'claim-documents' and auth.role() = 'authenticated');

-- site_settings
drop table if exists public.site_settings;

-- acv_history: restore authenticated-wide policies + drop new columns
drop trigger if exists acv_history_appraiser_guard on public.acv_history;
drop function if exists public.acv_history_appraiser_guard();

drop policy if exists acv_select on public.acv_history;
drop policy if exists acv_insert on public.acv_history;
drop policy if exists acv_update on public.acv_history;
drop policy if exists acv_delete on public.acv_history;

create policy "Authenticated users can view all acv_history"
  on public.acv_history for select using (auth.role() = 'authenticated');
create policy "Authenticated users can insert acv_history"
  on public.acv_history for insert with check (auth.uid() = user_id);
create policy "Authenticated users can update acv_history"
  on public.acv_history for update using (auth.role() = 'authenticated');
create policy "Authenticated users can delete acv_history"
  on public.acv_history for delete using (auth.role() = 'authenticated');

alter table public.acv_history drop column if exists submitted_by;
alter table public.acv_history drop column if exists submitted_at;
alter table public.acv_history drop column if exists assigned_to;

-- profiles
drop trigger if exists profiles_role_guard on public.profiles;
drop function if exists public.profiles_role_guard();
drop policy if exists profiles_select      on public.profiles;
drop policy if exists profiles_update_self on public.profiles;
drop policy if exists profiles_admin_all   on public.profiles;
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop function if exists public.is_admin();
drop table if exists public.profiles;
