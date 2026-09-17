-- =========================================================================
-- Modern Tools — Marketing / CRM rollback
-- Undoes migration-marketing.sql.
-- Idempotent — safe to re-run.
-- =========================================================================

-- Drop FK first (so tables can be dropped).
alter table public.acv_history
  drop column if exists client_id;

-- Drop marketing tables.
drop table if exists public.client_marketing_log cascade;
drop table if exists public.client_contacts      cascade;
drop table if exists public.clients              cascade;

-- Drop helper predicate.
drop function if exists public.has_marketing_access();

-- Restore profiles_role_guard WITHOUT the marketing_access clause. Keep every
-- other clause (is_super_admin, permission columns, etc.) intact so admins
-- and other trigger-guarded flags keep behaving.
create or replace function public.profiles_role_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() <> 'service_role' then
    if coalesce((to_jsonb(new)->>'is_super_admin'), '') is distinct from coalesce((to_jsonb(old)->>'is_super_admin'), '') then
      raise exception 'not allowed to change is_super_admin';
    end if;
  end if;
  if auth.role() = 'service_role' then return new; end if;
  if public.is_admin() then return new; end if;
  if new.role  is distinct from old.role  then raise exception 'not allowed to change role'; end if;
  if new.email is distinct from old.email then raise exception 'not allowed to change email'; end if;
  if coalesce((to_jsonb(new)->>'can_reassign_claims'),      '') is distinct from coalesce((to_jsonb(old)->>'can_reassign_claims'),      '') then raise exception 'not allowed to change can_reassign_claims';      end if;
  if coalesce((to_jsonb(new)->>'can_edit_claim_info'),      '') is distinct from coalesce((to_jsonb(old)->>'can_edit_claim_info'),      '') then raise exception 'not allowed to change can_edit_claim_info';      end if;
  if coalesce((to_jsonb(new)->>'can_create_claims'),        '') is distinct from coalesce((to_jsonb(old)->>'can_create_claims'),        '') then raise exception 'not allowed to change can_create_claims';        end if;
  if coalesce((to_jsonb(new)->>'auto_status_requests_override'), '') is distinct from coalesce((to_jsonb(old)->>'auto_status_requests_override'), '') then raise exception 'not allowed to change auto_status_requests_override'; end if;
  if coalesce((to_jsonb(new)->>'is_active'),                '') is distinct from coalesce((to_jsonb(old)->>'is_active'),                '') then raise exception 'not allowed to change is_active';                end if;
  if coalesce((to_jsonb(new)->>'show_in_handling_appraiser_list'), '') is distinct from coalesce((to_jsonb(old)->>'show_in_handling_appraiser_list'), '') then raise exception 'not allowed to change show_in_handling_appraiser_list'; end if;
  return new;
end;
$$;

-- Drop the flag column last.
alter table public.profiles
  drop column if exists marketing_access;

-- pg_trgm is left in place — cheap, no side effects, may be used by other features.
