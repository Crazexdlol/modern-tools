-- Rollback — restores the strict admin-only guard on clientName / client_id.
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

  if new.client_id is distinct from old.client_id then
    raise exception 'not allowed to change client_id';
  end if;
  if new.claim->>'handlingAppraiser' is distinct from old.claim->>'handlingAppraiser' then
    raise exception 'not allowed to change handlingAppraiser';
  end if;
  if new.claim->>'clientName' is distinct from old.claim->>'clientName' then
    raise exception 'not allowed to change clientName';
  end if;

  return new;
end;
$$;
