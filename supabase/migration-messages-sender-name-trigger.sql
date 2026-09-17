-- Security fix: messages.sender_name is spoofable via direct browser Supabase
-- writes. RLS messages_insert only checks sender_id = auth.uid(), not the
-- name string. Any user could insert a row with sender_id = self and
-- sender_name = "Henry Aleksanyan" to impersonate someone.
--
-- Add a BEFORE INSERT trigger that (a) for service-role, admin and matching
-- authenticated callers overrides sender_name from profiles, (b) leaves it
-- alone only for the service-role path (used by auto-message which pins the
-- name to 'Modern Tools (Auto)' explicitly).
--
-- The API route already sets sender_name correctly. This trigger just
-- prevents a direct browser bypass.

create or replace function public.messages_sender_name_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  profile_name text;
begin
  -- Service role writes trust the caller (auto-message route etc.).
  if auth.role() = 'service_role' then return new; end if;

  -- For authenticated callers, force sender_name from profiles.
  -- (sender_id was already validated by RLS to equal auth.uid().)
  select coalesce(nullif(name, ''), email, 'Unknown')
    into profile_name
    from public.profiles
    where id = new.sender_id;

  if profile_name is not null then
    new.sender_name := profile_name;
  end if;

  return new;
end;
$$;

drop trigger if exists messages_sender_name_guard on public.messages;
create trigger messages_sender_name_guard
  before insert on public.messages
  for each row execute function public.messages_sender_name_guard();

-- Verification: expect 1 (trigger present).
select count(*) from pg_trigger
where tgname = 'messages_sender_name_guard' and tgrelid = 'public.messages'::regclass;
