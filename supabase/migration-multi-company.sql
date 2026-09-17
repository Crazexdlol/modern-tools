-- ============================================================
-- HamsPortal — Multi-company Phase 1 (2026-09-16)
-- Run in the Supabase SQL Editor. Reversible via
-- migration-multi-company-rollback.sql.
--
-- Purpose:
--   Retrofit the codebase for multi-company data isolation
--   (Modern Appraisers + Eagleview). Every claim-scoped table
--   gets company_id NOT NULL, backfilled to Modern Appraisers
--   for existing rows. RLS policies get a company predicate.
--   A trigger makes company_id immutable on acv_history —
--   claims never move between companies.
--
--   This migration runs as one transaction so failure rolls
--   back cleanly. Guarded with `if not exists` / conditional
--   updates so re-runs are safe. Verification counts at bottom.
-- ============================================================

begin;

-- ============================================================
-- 1. companies (global)
-- ============================================================
create table if not exists public.companies (
  id             uuid primary key default gen_random_uuid(),
  slug           text unique not null,
  name           text not null,
  logo_path      text not null,
  brand_color    text not null default '#1e40af',
  feature_flags  jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

insert into public.companies (slug, name, logo_path, feature_flags)
values
  ('modern-appraisers', 'Modern Appraisers', '/companies/modern-appraisers/logo.png',
   '{"acv":true,"dv":true,"award":true,"notes":true,"invoice":true,"storage":true,"estimate_dispute":true,"marketing":true}'::jsonb),
  ('eagleview',        'Eagleview',         '/companies/eagleview/logo.png',
   '{"acv":true,"dv":true,"award":true,"notes":true,"invoice":true,"storage":true,"estimate_dispute":true,"marketing":true}'::jsonb)
on conflict (slug) do nothing;

alter table public.companies enable row level security;
drop policy if exists companies_select on public.companies;
create policy companies_select on public.companies
  for select to authenticated using (true);
-- No insert/update/delete policies — writes are super-admin only via service client.

-- ============================================================
-- 2. user_companies (join)
-- ============================================================
create table if not exists public.user_companies (
  user_id          uuid not null references public.profiles(id) on delete cascade,
  company_id       uuid not null references public.companies(id) on delete restrict,
  email_in_company text,
  role_in_company  text,
  granted_by       uuid references public.profiles(id) on delete set null,
  granted_at       timestamptz not null default now(),
  primary key (user_id, company_id)
);
create index if not exists user_companies_company_id_idx on public.user_companies(company_id);

alter table public.user_companies enable row level security;
drop policy if exists user_companies_select_self on public.user_companies;
create policy user_companies_select_self on public.user_companies
  for select to authenticated using (user_id = auth.uid());
drop policy if exists user_companies_admin_all on public.user_companies;
create policy user_companies_admin_all on public.user_companies
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================
-- 3. profiles.active_company_id (nullable — set by app on first login for new users)
-- ============================================================
alter table public.profiles
  add column if not exists active_company_id uuid references public.companies(id) on delete set null;

-- ============================================================
-- 4. Backfill: every existing profile → Modern Appraisers active + granted access
-- ============================================================
do $$
declare
  ma_id uuid;
begin
  select id into ma_id from public.companies where slug = 'modern-appraisers';

  insert into public.user_companies (user_id, company_id, granted_at)
  select p.id, ma_id, now()
  from public.profiles p
  where not exists (
    select 1 from public.user_companies uc
    where uc.user_id = p.id and uc.company_id = ma_id
  );

  update public.profiles
    set active_company_id = ma_id
    where active_company_id is null;
end $$;

-- ============================================================
-- 5. Add company_id to every claim-scoped and CRM table.
--    Nullable → backfill → NOT NULL, per table.
-- ============================================================
do $$
declare
  ma_id uuid;
begin
  select id into ma_id from public.companies where slug = 'modern-appraisers';

  -- acv_history (root)
  alter table public.acv_history add column if not exists company_id uuid references public.companies(id);
  update public.acv_history set company_id = ma_id where company_id is null;
  alter table public.acv_history alter column company_id set not null;

  -- messages (denormalized for RLS convenience)
  alter table public.messages add column if not exists company_id uuid references public.companies(id);
  update public.messages set company_id = ma_id where company_id is null;
  alter table public.messages alter column company_id set not null;

  -- message_reads
  alter table public.message_reads add column if not exists company_id uuid references public.companies(id);
  update public.message_reads set company_id = ma_id where company_id is null;
  alter table public.message_reads alter column company_id set not null;

  -- user_claim_views
  alter table public.user_claim_views add column if not exists company_id uuid references public.companies(id);
  update public.user_claim_views set company_id = ma_id where company_id is null;
  alter table public.user_claim_views alter column company_id set not null;

  -- estimate_history (legacy tool)
  alter table public.estimate_history add column if not exists company_id uuid references public.companies(id);
  update public.estimate_history set company_id = ma_id where company_id is null;
  alter table public.estimate_history alter column company_id set not null;

  -- clients (marketing CRM)
  alter table public.clients add column if not exists company_id uuid references public.companies(id);
  update public.clients set company_id = ma_id where company_id is null;
  alter table public.clients alter column company_id set not null;

  -- client_contacts
  alter table public.client_contacts add column if not exists company_id uuid references public.companies(id);
  update public.client_contacts set company_id = ma_id where company_id is null;
  alter table public.client_contacts alter column company_id set not null;

  -- client_marketing_log
  alter table public.client_marketing_log add column if not exists company_id uuid references public.companies(id);
  update public.client_marketing_log set company_id = ma_id where company_id is null;
  alter table public.client_marketing_log alter column company_id set not null;

  -- insurance_guidelines (per-company per Henry's ask)
  alter table public.insurance_guidelines add column if not exists company_id uuid references public.companies(id);
  update public.insurance_guidelines set company_id = ma_id where company_id is null;
  alter table public.insurance_guidelines alter column company_id set not null;
end $$;

-- ============================================================
-- 6. Indexes for the hot query paths (composite with company_id first)
-- ============================================================
create index if not exists acv_history_company_status_idx     on public.acv_history(company_id, status);
create index if not exists acv_history_company_assigned_idx   on public.acv_history(company_id, assigned_to);
create index if not exists messages_company_claim_idx         on public.messages(company_id, claim_id);
create index if not exists user_claim_views_company_user_idx  on public.user_claim_views(company_id, user_id);
create index if not exists clients_company_id_idx             on public.clients(company_id);
create index if not exists insurance_guidelines_company_idx   on public.insurance_guidelines(company_id);

-- ============================================================
-- 7. Isolation helper functions (used by RLS)
-- ============================================================
create or replace function public.active_company_id()
  returns uuid
  language sql
  stable
  security definer
  set search_path = public
as $$
  select active_company_id from public.profiles where id = auth.uid()
$$;

create or replace function public.has_company_access(cid uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select exists (
    select 1 from public.user_companies
    where user_id = auth.uid() and company_id = cid
  )
$$;

grant execute on function public.active_company_id() to authenticated;
grant execute on function public.has_company_access(uuid) to authenticated;

-- ============================================================
-- 8. Rewrite RLS on acv_history with company predicate.
-- ============================================================
drop policy if exists acv_select on public.acv_history;
create policy acv_select on public.acv_history for select to authenticated
  using (
    public.active_company_id() = company_id
    and public.has_company_access(company_id)
    and (
      public.is_admin()
      or assigned_to = auth.uid()
      or user_id = auth.uid()
    )
  );

drop policy if exists acv_insert on public.acv_history;
create policy acv_insert on public.acv_history for insert to authenticated
  with check (
    public.active_company_id() = company_id
    and public.has_company_access(company_id)
    and user_id = auth.uid()
  );

drop policy if exists acv_update on public.acv_history;
create policy acv_update on public.acv_history for update to authenticated
  using (
    public.active_company_id() = company_id
    and public.has_company_access(company_id)
    and (
      public.is_admin()
      or assigned_to = auth.uid()
    )
  )
  with check (
    public.active_company_id() = company_id
    and public.has_company_access(company_id)
  );

drop policy if exists acv_delete on public.acv_history;
create policy acv_delete on public.acv_history for delete to authenticated
  using (
    public.active_company_id() = company_id
    and public.has_company_access(company_id)
    and public.is_admin()
  );

-- ============================================================
-- 9. Messages RLS
-- ============================================================
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated
  using (
    public.active_company_id() = company_id
    and public.has_company_access(company_id)
    and exists (
      select 1 from public.acv_history a
      where a.id = messages.claim_id
        and (public.is_admin() or a.assigned_to = auth.uid())
    )
  );

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated
  with check (
    public.active_company_id() = company_id
    and public.has_company_access(company_id)
    and exists (
      select 1 from public.acv_history a
      where a.id = messages.claim_id
        and (public.is_admin() or a.assigned_to = auth.uid())
    )
  );

-- ============================================================
-- 10. message_reads RLS — user-scoped + company
-- ============================================================
drop policy if exists message_reads_self on public.message_reads;
create policy message_reads_self on public.message_reads for all to authenticated
  using (
    user_id = auth.uid()
    and public.active_company_id() = company_id
  )
  with check (
    user_id = auth.uid()
    and public.active_company_id() = company_id
  );

-- ============================================================
-- 11. user_claim_views RLS — user-scoped + company
-- ============================================================
drop policy if exists user_claim_views_self on public.user_claim_views;
create policy user_claim_views_self on public.user_claim_views for all to authenticated
  using (
    user_id = auth.uid()
    and public.active_company_id() = company_id
  )
  with check (
    user_id = auth.uid()
    and public.active_company_id() = company_id
  );

-- ============================================================
-- 12. Clients + satellites RLS — layered on top of has_marketing_access()
-- ============================================================
drop policy if exists clients_read on public.clients;
create policy clients_read on public.clients for select to authenticated
  using (
    public.active_company_id() = company_id
    and public.has_company_access(company_id)
    and public.has_marketing_access()
  );

drop policy if exists clients_write on public.clients;
create policy clients_write on public.clients for all to authenticated
  using (
    public.active_company_id() = company_id
    and public.has_company_access(company_id)
    and public.has_marketing_access()
  )
  with check (
    public.active_company_id() = company_id
    and public.has_company_access(company_id)
    and public.has_marketing_access()
  );

drop policy if exists client_contacts_all on public.client_contacts;
create policy client_contacts_all on public.client_contacts for all to authenticated
  using (
    public.active_company_id() = company_id
    and public.has_company_access(company_id)
    and public.has_marketing_access()
  )
  with check (
    public.active_company_id() = company_id
    and public.has_company_access(company_id)
    and public.has_marketing_access()
  );

drop policy if exists client_marketing_log_all on public.client_marketing_log;
create policy client_marketing_log_all on public.client_marketing_log for all to authenticated
  using (
    public.active_company_id() = company_id
    and public.has_company_access(company_id)
    and public.has_marketing_access()
  )
  with check (
    public.active_company_id() = company_id
    and public.has_company_access(company_id)
    and public.has_marketing_access()
  );

-- ============================================================
-- 13. Insurance guidelines RLS — now per-company
-- ============================================================
drop policy if exists insurance_guidelines_read on public.insurance_guidelines;
create policy insurance_guidelines_read on public.insurance_guidelines for select to authenticated
  using (
    public.active_company_id() = company_id
    and public.has_company_access(company_id)
  );

drop policy if exists insurance_guidelines_write on public.insurance_guidelines;
create policy insurance_guidelines_write on public.insurance_guidelines for all to authenticated
  using (
    public.active_company_id() = company_id
    and public.has_company_access(company_id)
    and public.is_admin()
  )
  with check (
    public.active_company_id() = company_id
    and public.has_company_access(company_id)
    and public.is_admin()
  );

-- ============================================================
-- 14. estimate_history RLS — user-scoped + company (legacy)
-- ============================================================
drop policy if exists estimate_history_own on public.estimate_history;
create policy estimate_history_own on public.estimate_history for all to authenticated
  using (
    user_id = auth.uid()
    and public.active_company_id() = company_id
  )
  with check (
    user_id = auth.uid()
    and public.active_company_id() = company_id
  );

-- ============================================================
-- 15. Extend acv_history_appraiser_guard trigger to make company_id immutable.
--     CRITICAL ORDERING: company_id check runs BEFORE service_role bypass so
--     nothing (not even service-role callers) can move claims between companies.
-- ============================================================
create or replace function public.acv_history_appraiser_guard()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  -- FIRST: company_id is immutable for EVERYONE — service_role, admin,
  -- appraiser alike. This check runs BEFORE any bypass. Correcting a
  -- mis-filed claim requires delete + recreate under the correct company.
  if old.company_id is distinct from new.company_id then
    raise exception 'company_id is immutable on acv_history — claims cannot be moved between companies';
  end if;

  -- Service role bypasses ONLY the appraiser-specific guards below.
  if auth.role() = 'service_role' then
    return new;
  end if;

  -- Existing rules preserved for non-admins.
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

-- ============================================================
-- 16. Verification
-- ============================================================
select
  (select count(*) from public.companies)::int                                    as companies_count,
  (select count(*) from public.profiles where active_company_id is not null)::int as profiles_with_active_company,
  (select count(*) from public.user_companies)::int                               as user_companies_rows,
  (select count(*) from public.acv_history)::int                                  as acv_history_total,
  (select count(*) from public.acv_history where company_id =
     (select id from public.companies where slug='modern-appraisers'))::int       as acv_history_ma,
  (select count(*) from public.acv_history where company_id =
     (select id from public.companies where slug='eagleview'))::int               as acv_history_ev,
  (select count(*) from public.messages)::int                                     as messages_total,
  (select count(*) from public.clients)::int                                      as clients_total,
  (select count(*) from public.insurance_guidelines)::int                         as guidelines_total;

commit;
