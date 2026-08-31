-- =========================================================================
-- Modern Tools — Audit trigger hardening (2026-08-30)
-- Run in the Supabase SQL Editor (Dashboard -> SQL Editor).
-- Reverses cleanly with migration-audit-trigger-hardening-rollback.sql.
--
-- Closes two escalation gaps found in the 2026-08-30 security audit:
--
--  S6 (profiles_role_guard): the existing trigger blocks role/email changes
--      for non-admins but doesn't cover the per-user permission columns
--      added by later migrations. Because profiles_update_self allows a
--      user to UPDATE their own row from the browser (`id = auth.uid()`),
--      any appraiser could self-grant can_reassign_claims, can_edit_claim_info,
--      can_create_claims, auto_status_requests_override, or flip is_active.
--      This migration extends the guard to reject writes to those columns
--      unless the caller is admin or the service role.
--
--  S7 (acv_history_appraiser_guard): the existing trigger runs on BEFORE
--      UPDATE only. On INSERT there's no guard, so an appraiser's Supabase
--      insert can set status='closed', submitted_at, submitted_by, or
--      assigned_to != auth.uid() (as long as RLS acv_insert's WITH CHECK
--      allows it, which it does for assigned_to = auth.uid()). This
--      migration adds a matching BEFORE INSERT trigger that force-nulls
--      the workflow columns and force-sets user_id = auth.uid() for
--      non-admin, non-service-role inserts.
-- =========================================================================

-- 1. Extend profiles_role_guard to cover permission columns.
create or replace function public.profiles_role_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'service_role' then return new; end if;
  if public.is_admin() then return new; end if;
  if new.role  is distinct from old.role  then raise exception 'not allowed to change role'; end if;
  if new.email is distinct from old.email then raise exception 'not allowed to change email'; end if;
  -- Permission columns (added by later migrations — guard is idempotent w/
  -- `to_jsonb(new/old)->>` so missing columns don't fail the trigger).
  if coalesce((to_jsonb(new)->>'can_reassign_claims'),      '') is distinct from coalesce((to_jsonb(old)->>'can_reassign_claims'),      '') then raise exception 'not allowed to change can_reassign_claims';      end if;
  if coalesce((to_jsonb(new)->>'can_edit_claim_info'),      '') is distinct from coalesce((to_jsonb(old)->>'can_edit_claim_info'),      '') then raise exception 'not allowed to change can_edit_claim_info';      end if;
  if coalesce((to_jsonb(new)->>'can_create_claims'),        '') is distinct from coalesce((to_jsonb(old)->>'can_create_claims'),        '') then raise exception 'not allowed to change can_create_claims';        end if;
  if coalesce((to_jsonb(new)->>'auto_status_requests_override'), '') is distinct from coalesce((to_jsonb(old)->>'auto_status_requests_override'), '') then raise exception 'not allowed to change auto_status_requests_override'; end if;
  if coalesce((to_jsonb(new)->>'is_active'),                '') is distinct from coalesce((to_jsonb(old)->>'is_active'),                '') then raise exception 'not allowed to change is_active';                end if;
  return new;
end;
$$;

-- 2. Add BEFORE INSERT guard to acv_history for the workflow columns.
--    Idempotent: uses new function name so the existing UPDATE trigger keeps
--    working, and creates a separate INSERT trigger.
create or replace function public.acv_history_appraiser_insert_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'service_role' then return new; end if;
  if public.is_admin() then return new; end if;
  -- Force workflow columns to safe defaults on any appraiser insert. These
  -- transitions are only permitted through the dedicated API routes (which
  -- run under service role); the client-side insert path in saveACVHistory
  -- should never set them.
  new.status       := 'open';
  new.submitted_at := null;
  new.submitted_by := null;
  new.user_id      := auth.uid();
  -- Appraiser inserts are allowed to leave assigned_to null OR set it to
  -- themselves (matches acv_insert RLS policy). Reject any other value.
  if new.assigned_to is not null and new.assigned_to <> auth.uid() then
    raise exception 'not allowed to assign a new claim to another user on insert';
  end if;
  return new;
end;
$$;

drop trigger if exists acv_history_appraiser_insert_guard on public.acv_history;
create trigger acv_history_appraiser_insert_guard
  before insert on public.acv_history
  for each row execute function public.acv_history_appraiser_insert_guard();

-- 3. Verification (informational — inspect the returned rows manually)
select 'triggers on acv_history' as label,
       count(*) as value
  from pg_trigger
  where tgrelid = 'public.acv_history'::regclass
    and not tgisinternal
union all
select 'triggers on profiles' as label,
       count(*) as value
  from pg_trigger
  where tgrelid = 'public.profiles'::regclass
    and not tgisinternal;
