-- =========================================================================
-- Modern Tools — Handling-appraiser list flag ROLLBACK
-- Reverses migration-handling-appraiser-flag.sql.
--
-- Note: this does NOT revert the "Fabian Barahona" profile insert. That
-- happens in the CSV sync script (scripts/sync-claims-from-csv.mjs) as a
-- one-time bootstrap, not in this migration. If you need to remove Fabian
-- after the sync has run, first reassign his claims elsewhere, then delete
-- from auth.users (profiles cascades via ON DELETE CASCADE).
-- =========================================================================

-- 1. Revert Vahan rename.
update public.profiles
   set name = 'Vahan Zurnachnyan',
       updated_at = now()
 where id = '085f94af-1584-4bfa-8d07-bf71d9bf5028'
   and name = 'Vahan Zurnachyan';

-- 2. Restore profiles_role_guard to the pre-2026-09-11 shape
--    (matches the tail of migration-audit-trigger-hardening.sql).
create or replace function public.profiles_role_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'service_role' then return new; end if;
  if public.is_admin() then return new; end if;
  if new.role  is distinct from old.role  then raise exception 'not allowed to change role'; end if;
  if new.email is distinct from old.email then raise exception 'not allowed to change email'; end if;
  if coalesce((to_jsonb(new)->>'can_reassign_claims'),      '') is distinct from coalesce((to_jsonb(old)->>'can_reassign_claims'),      '') then raise exception 'not allowed to change can_reassign_claims';      end if;
  if coalesce((to_jsonb(new)->>'can_edit_claim_info'),      '') is distinct from coalesce((to_jsonb(old)->>'can_edit_claim_info'),      '') then raise exception 'not allowed to change can_edit_claim_info';      end if;
  if coalesce((to_jsonb(new)->>'can_create_claims'),        '') is distinct from coalesce((to_jsonb(old)->>'can_create_claims'),        '') then raise exception 'not allowed to change can_create_claims';        end if;
  if coalesce((to_jsonb(new)->>'auto_status_requests_override'), '') is distinct from coalesce((to_jsonb(old)->>'auto_status_requests_override'), '') then raise exception 'not allowed to change auto_status_requests_override'; end if;
  if coalesce((to_jsonb(new)->>'is_active'),                '') is distinct from coalesce((to_jsonb(old)->>'is_active'),                '') then raise exception 'not allowed to change is_active';                end if;
  return new;
end;
$$;

-- 3. Drop the column. This also removes the false-flag data set in the
--    migration for Arthur/Wendy/Maeli, so the dropdown will show them again.
alter table public.profiles
  drop column if exists show_in_handling_appraiser_list;
