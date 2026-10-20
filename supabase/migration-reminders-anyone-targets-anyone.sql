-- 2026-10-04: loosen reminders insert guard so any authenticated user may
-- target any other user. Original guard let appraisers only target self /
-- admins; Henry wants appraisers able to remind teammates (e.g. "Remind
-- Melissa to send the storage invoice at 3pm"). Still keeps the
-- created_by = auth.uid() integrity check so one user can't ghost-write
-- reminders as someone else.
--
-- Rollback: supabase/migration-reminders-anyone-targets-anyone-rollback.sql

create or replace function public.reminders_insert_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'service_role' then return new; end if;
  if new.created_by is distinct from auth.uid() then
    raise exception 'created_by must equal auth.uid()';
  end if;
  return new;
end;
$$;

-- Smoke test — confirm the trigger is still bound.
select 'reminders_insert_guard trigger', count(*)::int
  from information_schema.triggers
  where event_object_schema='public' and event_object_table='reminders'
    and trigger_name='reminders_insert_guard_trigger';
