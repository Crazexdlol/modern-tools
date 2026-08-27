-- =========================================================================
-- Modern Tools — Rollback: per-appraiser can_create_claims (2026-08-27)
-- Run in the Supabase SQL Editor to undo migration-can-create-claims.sql.
-- Restores the acv_history INSERT policy from migration-roles.sql and
-- drops the profiles.can_create_claims column.
-- =========================================================================

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
      and user_id = auth.uid()
      and (assigned_to is null or assigned_to = auth.uid())
    )
  );

alter table public.profiles drop column if exists can_create_claims;

select 'acv_history INSERT policies' as label,
       count(*) as value
  from pg_policies
  where schemaname = 'public' and tablename = 'acv_history' and cmd = 'INSERT';
