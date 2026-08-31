-- Rollback for migration-audit-trigger-hardening.sql — restores the pre-hardening
-- trigger definitions from migration-roles.sql. Run in Supabase SQL editor.

-- 1. Restore original profiles_role_guard (role + email only).
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

-- 2. Drop the insert-guard trigger + function.
drop trigger if exists acv_history_appraiser_insert_guard on public.acv_history;
drop function if exists public.acv_history_appraiser_insert_guard();
