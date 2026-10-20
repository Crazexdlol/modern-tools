-- =========================================================================
-- HamsPortal — Allow canEditClaimInfo appraisers to change clientName / client_id
-- (2026-10-10)
--
-- Prior rule: only admins could change claim->>'clientName' and client_id,
-- enforced by acv_history_appraiser_guard. Henry wants appraisers who hold
-- the general edit permission (profiles.can_edit_claim_info = true) to be
-- able to fix client naming/linkage on their own files too. Admins + service
-- role still bypass via the early returns at the top of the function.
--
-- Idempotent — CREATE OR REPLACE replaces the whole function definition.
-- =========================================================================

create or replace function public.acv_history_appraiser_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  caller_can_edit boolean;
begin
  if auth.role() = 'service_role' then return new; end if;
  if public.is_admin() then return new; end if;

  -- One lookup per row — the guards below reuse this result instead of
  -- re-querying profiles for every column check.
  select coalesce(can_edit_claim_info, false)
    into caller_can_edit
    from public.profiles
   where id = auth.uid();
  caller_can_edit := coalesce(caller_can_edit, false);

  -- Existing guards — appraisers can never flip these regardless of edit flag.
  if new.assigned_to  is distinct from old.assigned_to  then raise exception 'not allowed to change assigned_to';  end if;
  if new.status       is distinct from old.status       then raise exception 'not allowed to change status';       end if;
  if new.submitted_at is distinct from old.submitted_at then raise exception 'not allowed to change submitted_at'; end if;
  if new.submitted_by is distinct from old.submitted_by then raise exception 'not allowed to change submitted_by'; end if;
  if new.user_id      is distinct from old.user_id      then raise exception 'not allowed to change user_id';      end if;

  -- Handling Appraiser stays admin-only (workflow-sensitive — picking it
  -- changes submit routing + notifications).
  if new.claim->>'handlingAppraiser' is distinct from old.claim->>'handlingAppraiser' then
    raise exception 'not allowed to change handlingAppraiser';
  end if;

  -- Client fields: admin OR an appraiser with can_edit_claim_info can edit.
  if not caller_can_edit then
    if new.client_id is distinct from old.client_id then
      raise exception 'not allowed to change client_id';
    end if;
    if new.claim->>'clientName' is distinct from old.claim->>'clientName' then
      raise exception 'not allowed to change clientName';
    end if;
  end if;

  return new;
end;
$$;

-- Verification: function replaced, trigger still present.
select proname from pg_proc where proname = 'acv_history_appraiser_guard';
select tgname from pg_trigger where tgname = 'acv_history_appraiser_guard';
