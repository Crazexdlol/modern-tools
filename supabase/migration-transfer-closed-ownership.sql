-- =========================================================================
-- HamsPortal — Transfer closed-claim ownership to super-admin (2026-10-03)
--
-- When a claim is closed, auto-reassign its acv_history.user_id to the
-- super-admin account. This keeps historical claims safe from the FK
-- cascade when an appraiser's account is later deleted:
--
--   acv_history.user_id → profiles.id   ON DELETE CASCADE
--
-- Without this trigger, deleting an appraiser who closed 50 claims over
-- 3 years would nuke all 50 claim rows. With it, user_id has already been
-- reassigned to the super-admin at the moment each claim closed, so the
-- cascade affects zero rows.
--
-- Open claims STILL point to the original creator — the user-delete
-- endpoint keeps blocking on those so active work isn't silently
-- orphaned. This trigger is for the historical / audit case only.
--
-- Idempotent — safe to re-run.
-- =========================================================================

-- 1. Trigger function. Looks up the super-admin dynamically on each fire
--    so this stays correct if the super-admin flag ever moves.
create or replace function public.transfer_closed_claim_ownership() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  super_admin_id uuid;
begin
  -- Fire only when the row TRANSITIONS to closed, not on every update of
  -- an already-closed row.
  if NEW.status = 'closed' and (OLD.status is distinct from 'closed') then
    select id into super_admin_id
      from public.profiles
      where is_super_admin = true
      order by created_at asc
      limit 1;
    if super_admin_id is not null then
      NEW.user_id := super_admin_id;
    end if;
  end if;
  return NEW;
end;
$$;

grant execute on function public.transfer_closed_claim_ownership() to authenticated;

-- 2. Attach as a BEFORE UPDATE trigger so NEW.user_id is written back.
drop trigger if exists transfer_ownership_on_close on public.acv_history;
create trigger transfer_ownership_on_close
  before update on public.acv_history
  for each row execute function public.transfer_closed_claim_ownership();

-- 3. One-time backfill: every currently-closed claim gets its user_id
--    rewritten to the super-admin.
--
--    The existing acv_history_appraiser_guard trigger blocks user_id
--    changes when auth.role() is not 'service_role' and the caller isn't
--    admin. Supabase SQL Editor runs as 'postgres' (not service_role),
--    so without this bypass the backfill would fail with:
--      ERROR: appraisers cannot change user_id
--
--    Disable the guard trigger for the backfill, then re-enable. The
--    ownership-transfer trigger from step 2 still fires but its condition
--    (OLD.status is distinct from 'closed') is false for already-closed
--    rows, so it no-ops.
alter table public.acv_history disable trigger acv_history_appraiser_guard;

update public.acv_history
   set user_id = (
     select id from public.profiles
     where is_super_admin = true
     order by created_at asc
     limit 1
   )
 where status = 'closed'
   and user_id is distinct from (
     select id from public.profiles
     where is_super_admin = true
     order by created_at asc
     limit 1
   );

alter table public.acv_history enable trigger acv_history_appraiser_guard;

-- 4. Verification
select 'trigger installed'          as label, count(*)::int as value
  from pg_trigger
  where tgname = 'transfer_ownership_on_close' and not tgisinternal
union all
select 'super-admin exists', count(*)::int from public.profiles where is_super_admin = true
union all
select 'closed claims now owned by super-admin',
       (select count(*)::int
          from public.acv_history
         where status = 'closed'
           and user_id = (select id from public.profiles where is_super_admin = true order by created_at asc limit 1));
