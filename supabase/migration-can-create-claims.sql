-- =========================================================================
-- Modern Tools — Per-appraiser can_create_claims permission (2026-08-27)
-- Run in the Supabase SQL Editor (Dashboard -> SQL Editor).
-- Spec: docs/superpowers/specs/2026-08-27-create-claims-permission-design.md
-- Rollback: supabase/migration-can-create-claims-rollback.sql
--
-- Adds a per-user grant column on top of the existing site-wide master
-- switch (site_settings.allow_regular_create_claims). Effective rule for
-- a non-admin: create is allowed only when BOTH the master is ON AND
-- the caller's profiles.can_create_claims is TRUE. Admins bypass both.
-- =========================================================================

-- 1. New column: per-user grant. Default false = strict by default.
alter table public.profiles
  add column if not exists can_create_claims boolean not null default false;

-- 2. Replace the acv_history INSERT policy so non-admins also need the grant.
--    Original policy is in supabase/migration-roles.sql:131-140.
drop policy if exists acv_insert on public.acv_history;

create policy acv_insert on public.acv_history for insert
  with check (
    (public.is_admin() and user_id = auth.uid())
    or (
      not public.is_admin()
      and coalesce(
        (select (value #>> '{}')::boolean from public.site_settings
         where key = 'allow_regular_create_claims'),
        true
      )
      and exists (
        select 1 from public.profiles
        where id = auth.uid() and can_create_claims = true
      )
      and user_id = auth.uid()
      and (assigned_to is null or assigned_to = auth.uid())
    )
  );

-- 3. Verification
select 'profiles.can_create_claims column' as label,
       count(*) as value
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'profiles'
    and column_name = 'can_create_claims'
union all
select 'acv_history INSERT policies' as label,
       count(*) as value
  from pg_policies
  where schemaname = 'public'
    and tablename = 'acv_history'
    and cmd = 'INSERT';
