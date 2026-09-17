-- ============================================================
-- Rollback for migration-multi-company.sql (2026-09-16).
-- Reverses ALL changes. Run only to fully undo multi-company
-- support and return to single-tenant behavior.
--
-- Safe to re-run — guarded with `if exists` throughout.
-- ============================================================

begin;

-- Reverse step 15: restore original acv_history_appraiser_guard (no company check).
create or replace function public.acv_history_appraiser_guard()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
  if not public.is_admin() then
    if old.assigned_to is distinct from new.assigned_to then
      raise exception 'appraisers cannot change assigned_to';
    end if;
    if old.status is distinct from new.status then
      raise exception 'appraisers cannot change status';
    end if;
    if old.submitted_at is distinct from new.submitted_at then
      raise exception 'appraisers cannot change submitted_at';
    end if;
    if old.submitted_by is distinct from new.submitted_by then
      raise exception 'appraisers cannot change submitted_by';
    end if;
    if old.user_id is distinct from new.user_id then
      raise exception 'appraisers cannot change user_id';
    end if;
  end if;
  return new;
end;
$$;

-- Drop company-aware RLS policies.
drop policy if exists acv_select                    on public.acv_history;
drop policy if exists acv_insert                    on public.acv_history;
drop policy if exists acv_update                    on public.acv_history;
drop policy if exists acv_delete                    on public.acv_history;
drop policy if exists messages_select               on public.messages;
drop policy if exists messages_insert               on public.messages;
drop policy if exists message_reads_self            on public.message_reads;
drop policy if exists user_claim_views_self         on public.user_claim_views;
drop policy if exists clients_read                  on public.clients;
drop policy if exists clients_write                 on public.clients;
drop policy if exists client_contacts_all           on public.client_contacts;
drop policy if exists client_marketing_log_all      on public.client_marketing_log;
drop policy if exists insurance_guidelines_read     on public.insurance_guidelines;
drop policy if exists insurance_guidelines_write    on public.insurance_guidelines;
drop policy if exists estimate_history_own          on public.estimate_history;

-- Re-create original pre-multi-company acv_history policies.
create policy acv_select on public.acv_history for select to authenticated
  using (public.is_admin() or assigned_to = auth.uid() or user_id = auth.uid());
create policy acv_insert on public.acv_history for insert to authenticated
  with check (user_id = auth.uid());
create policy acv_update on public.acv_history for update to authenticated
  using (public.is_admin() or assigned_to = auth.uid());
create policy acv_delete on public.acv_history for delete to authenticated
  using (public.is_admin());

-- Re-create original messages policies (read/insert scoped to claim access).
create policy messages_select on public.messages for select to authenticated
  using (
    exists (
      select 1 from public.acv_history a
      where a.id = messages.claim_id
        and (public.is_admin() or a.assigned_to = auth.uid())
    )
  );
create policy messages_insert on public.messages for insert to authenticated
  with check (
    exists (
      select 1 from public.acv_history a
      where a.id = messages.claim_id
        and (public.is_admin() or a.assigned_to = auth.uid())
    )
  );

-- Re-create original message_reads policy (user-scoped).
create policy message_reads_self on public.message_reads for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Re-create original user_claim_views policy (user-scoped).
create policy user_claim_views_self on public.user_claim_views for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Re-create original clients / satellites policies (marketing_access only, no company gate).
create policy clients_read on public.clients for select to authenticated
  using (public.has_marketing_access());
create policy clients_write on public.clients for all to authenticated
  using (public.has_marketing_access())
  with check (public.has_marketing_access());
create policy client_contacts_all on public.client_contacts for all to authenticated
  using (public.has_marketing_access())
  with check (public.has_marketing_access());
create policy client_marketing_log_all on public.client_marketing_log for all to authenticated
  using (public.has_marketing_access())
  with check (public.has_marketing_access());

-- Re-create original insurance_guidelines policies (global read, admin write).
create policy insurance_guidelines_read on public.insurance_guidelines for select to authenticated
  using (true);
create policy insurance_guidelines_write on public.insurance_guidelines for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Re-create original estimate_history policy (own rows only).
create policy estimate_history_own on public.estimate_history for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Drop helper functions.
drop function if exists public.active_company_id();
drop function if exists public.has_company_access(uuid);

-- Drop composite indexes.
drop index if exists public.acv_history_company_status_idx;
drop index if exists public.acv_history_company_assigned_idx;
drop index if exists public.messages_company_claim_idx;
drop index if exists public.user_claim_views_company_user_idx;
drop index if exists public.clients_company_id_idx;
drop index if exists public.insurance_guidelines_company_idx;

-- Drop company_id from every table.
alter table public.acv_history           drop column if exists company_id;
alter table public.messages              drop column if exists company_id;
alter table public.message_reads         drop column if exists company_id;
alter table public.user_claim_views      drop column if exists company_id;
alter table public.estimate_history      drop column if exists company_id;
alter table public.clients               drop column if exists company_id;
alter table public.client_contacts       drop column if exists company_id;
alter table public.client_marketing_log  drop column if exists company_id;
alter table public.insurance_guidelines  drop column if exists company_id;

-- Drop profiles.active_company_id.
alter table public.profiles drop column if exists active_company_id;

-- Drop join + companies tables.
drop table if exists public.user_companies;
drop table if exists public.companies;

commit;
