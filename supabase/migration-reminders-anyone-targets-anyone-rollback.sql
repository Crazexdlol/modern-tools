-- Rollback: restore the original appraiser-can-only-target-self-or-admin guard.

create or replace function public.reminders_insert_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  target_role text;
begin
  if auth.role() = 'service_role' then return new; end if;
  if new.created_by is distinct from auth.uid() then
    raise exception 'created_by must equal auth.uid()';
  end if;
  if public.is_admin() then return new; end if;
  if new.target_user_id = auth.uid() then return new; end if;
  select role into target_role from public.profiles where id = new.target_user_id;
  if target_role = 'admin' then return new; end if;
  raise exception 'appraisers may only target themselves or admins';
end;
$$;
