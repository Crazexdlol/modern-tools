-- =========================================================================
-- Modern Tools — Role-Based Access migration (2026-08-26)
-- Run in the Supabase SQL Editor (Dashboard -> SQL Editor).
-- Spec: docs/superpowers/specs/2026-08-26-role-based-access-design.md
-- Reverses cleanly with supabase-migration-roles-rollback.sql.
-- =========================================================================

-- 1. profiles table + trigger to seed on auth.users insert
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null default '',
  role text not null default 'appraiser' check (role in ('admin', 'appraiser')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles(role);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', ''), 'appraiser')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. Seed every existing auth.users row as admin (Henry confirmed only one
--    account exists today; walking auth.users is safer than hardcoding email).
insert into public.profiles (id, email, name, role)
select id, email, coalesce(raw_user_meta_data->>'name', ''), 'admin'
from auth.users
on conflict (id) do update set role = 'admin';

-- 3. is_admin() helper (used by every RLS policy that checks role)
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;

-- 4. profiles RLS
alter table public.profiles enable row level security;

drop policy if exists profiles_select       on public.profiles;
drop policy if exists profiles_update_self  on public.profiles;
drop policy if exists profiles_admin_all    on public.profiles;

create policy profiles_select on public.profiles for select
  using (auth.role() = 'authenticated');

create policy profiles_update_self on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

create policy profiles_admin_all on public.profiles for all
  using (public.is_admin())
  with check (public.is_admin());

-- Column-guard trigger: non-admins can update their own row's name only.
create or replace function public.profiles_role_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'service_role' then return new; end if;
  if public.is_admin() then return new; end if;
  if new.role  is distinct from old.role  then raise exception 'not allowed to change role'; end if;
  if new.email is distinct from old.email then raise exception 'not allowed to change email'; end if;
  return new;
end;
$$;

drop trigger if exists profiles_role_guard on public.profiles;
create trigger profiles_role_guard
  before update on public.profiles
  for each row execute function public.profiles_role_guard();

-- 5. acv_history: new columns
alter table public.acv_history add column if not exists assigned_to  uuid references auth.users(id) on delete set null;
alter table public.acv_history add column if not exists submitted_at timestamptz;
alter table public.acv_history add column if not exists submitted_by uuid references auth.users(id) on delete set null;

create index if not exists acv_history_assigned_to_idx  on public.acv_history(assigned_to);
create index if not exists acv_history_submitted_at_idx on public.acv_history(submitted_at) where submitted_at is not null;

-- 6. site_settings table (referenced by the acv_insert policy below, so create first)
create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.site_settings enable row level security;

drop policy if exists site_settings_read  on public.site_settings;
drop policy if exists site_settings_write on public.site_settings;

create policy site_settings_read on public.site_settings for select
  using (auth.role() = 'authenticated');

create policy site_settings_write on public.site_settings for all
  using (public.is_admin())
  with check (public.is_admin());

insert into public.site_settings (key, value)
values ('allow_regular_create_claims', 'true'::jsonb)
on conflict (key) do nothing;

-- 7. acv_history: replace authenticated-wide policies with role-aware policies
drop policy if exists "Authenticated users can view all acv_history"   on public.acv_history;
drop policy if exists "Authenticated users can insert acv_history"     on public.acv_history;
drop policy if exists "Authenticated users can update acv_history"     on public.acv_history;
drop policy if exists "Authenticated users can delete acv_history"     on public.acv_history;
drop policy if exists acv_select on public.acv_history;
drop policy if exists acv_insert on public.acv_history;
drop policy if exists acv_update on public.acv_history;
drop policy if exists acv_delete on public.acv_history;

create policy acv_select on public.acv_history for select
  using (
    public.is_admin()
    or assigned_to = auth.uid()
  );

create policy acv_insert on public.acv_history for insert
  with check (
    (public.is_admin() and user_id = auth.uid())
    or (
      not public.is_admin()
      and coalesce((select (value #>> '{}')::boolean from public.site_settings where key = 'allow_regular_create_claims'), true)
      and user_id = auth.uid()
      and (assigned_to is null or assigned_to = auth.uid())
    )
  );

create policy acv_update on public.acv_history for update
  using (
    public.is_admin()
    or (assigned_to = auth.uid() and submitted_at is null)
  )
  with check (
    public.is_admin()
    or (assigned_to = auth.uid() and submitted_at is null)
  );

create policy acv_delete on public.acv_history for delete
  using (public.is_admin());

-- 8. Column-guard trigger for acv_history: appraisers can't change protected columns.
--    Service-role bypasses (used by workflow API routes to set status/submitted/etc).
create or replace function public.acv_history_appraiser_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'service_role' then return new; end if;
  if public.is_admin() then return new; end if;
  if new.assigned_to  is distinct from old.assigned_to  then raise exception 'not allowed to change assigned_to';  end if;
  if new.status       is distinct from old.status       then raise exception 'not allowed to change status';       end if;
  if new.submitted_at is distinct from old.submitted_at then raise exception 'not allowed to change submitted_at'; end if;
  if new.submitted_by is distinct from old.submitted_by then raise exception 'not allowed to change submitted_by'; end if;
  if new.user_id      is distinct from old.user_id      then raise exception 'not allowed to change user_id';      end if;
  return new;
end;
$$;

drop trigger if exists acv_history_appraiser_guard on public.acv_history;
create trigger acv_history_appraiser_guard
  before update on public.acv_history
  for each row execute function public.acv_history_appraiser_guard();

-- 9. Storage bucket policies for claim-documents — scope by assignment.
--    Path convention set by uploadClaimDocument(): "<claimId>/<timestamp>-<name>".
drop policy if exists "Authenticated users can view claim-documents"   on storage.objects;
drop policy if exists "Authenticated users can upload claim-documents" on storage.objects;
drop policy if exists "Authenticated users can update claim-documents" on storage.objects;
drop policy if exists "Authenticated users can delete claim-documents" on storage.objects;
drop policy if exists claim_docs_view   on storage.objects;
drop policy if exists claim_docs_upload on storage.objects;
drop policy if exists claim_docs_update on storage.objects;
drop policy if exists claim_docs_delete on storage.objects;

create policy claim_docs_view on storage.objects for select using (
  bucket_id = 'claim-documents'
  and exists (
    select 1 from public.acv_history c
    where c.id = split_part(name, '/', 1)
      and (public.is_admin() or c.assigned_to = auth.uid())
  )
);

create policy claim_docs_upload on storage.objects for insert with check (
  bucket_id = 'claim-documents'
  and exists (
    select 1 from public.acv_history c
    where c.id = split_part(name, '/', 1)
      and (public.is_admin() or c.assigned_to = auth.uid())
  )
);

create policy claim_docs_update on storage.objects for update using (
  bucket_id = 'claim-documents'
  and exists (
    select 1 from public.acv_history c
    where c.id = split_part(name, '/', 1)
      and (public.is_admin() or c.assigned_to = auth.uid())
  )
);

create policy claim_docs_delete on storage.objects for delete using (
  bucket_id = 'claim-documents'
  and exists (
    select 1 from public.acv_history c
    where c.id = split_part(name, '/', 1)
      and (public.is_admin() or c.assigned_to = auth.uid())
  )
);

-- 10. Verification (informational — inspect the returned rows manually)
select 'acv_history rows' as label, count(*) as value from public.acv_history
union all
select 'admin profiles' as label, count(*) as value from public.profiles where role = 'admin'
union all
select 'site_settings rows' as label, count(*) as value from public.site_settings;
