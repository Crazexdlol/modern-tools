-- =========================================================================
-- HamsPortal — Reminders (2026-10-03)
-- Adds: reminders table + push_subscriptions table + RLS + indexes.
-- Run in Supabase SQL Editor. Idempotent. Reversible via -rollback.sql.
-- =========================================================================

-- 1. reminders table
create table if not exists public.reminders (
  id              uuid primary key default gen_random_uuid(),
  created_by      uuid not null references public.profiles(id) on delete cascade,
  target_user_id  uuid not null references public.profiles(id) on delete cascade,
  note            text not null check (char_length(note) between 1 and 1000),
  fire_at         timestamptz not null,
  claim_id        text null references public.acv_history(id) on delete set null,
  recurrence      jsonb null,
  -- channels: API always writes {in_app, push, email} with all 3 keys. CHECK enforces all keys present AND at least one true.
  channels        jsonb not null
                    check (
                      (channels ? 'in_app' and channels ? 'push' and channels ? 'email')
                      and ((channels->>'in_app')::bool
                           or (channels->>'push')::bool
                           or (channels->>'email')::bool)
                    ),
  status          text not null default 'scheduled'
                    check (status in ('scheduled','fired','acknowledged','snoozed','dismissed')),
  fired_at        timestamptz null,
  acknowledged_at timestamptz null,
  snoozed_until   timestamptz null,
  created_at      timestamptz not null default now()
);

create index if not exists reminders_target_status_fire_at_idx
  on public.reminders (target_user_id, status, fire_at);

create index if not exists reminders_due_idx
  on public.reminders (fire_at)
  where status = 'scheduled';

create index if not exists reminders_created_by_idx
  on public.reminders (created_by);

alter table public.reminders enable row level security;

-- INSERT guard: appraisers can only target self or admins; admins target anyone.
-- Implemented as a trigger so we can look up profiles.role of the target.
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

drop trigger if exists reminders_insert_guard_trigger on public.reminders;
create trigger reminders_insert_guard_trigger
  before insert on public.reminders
  for each row execute function public.reminders_insert_guard();

drop policy if exists reminders_select on public.reminders;
create policy reminders_select on public.reminders for select to authenticated
  using (target_user_id = auth.uid() or created_by = auth.uid());

drop policy if exists reminders_insert on public.reminders;
create policy reminders_insert on public.reminders for insert to authenticated
  with check (true);  -- the trigger does the real check

drop policy if exists reminders_update_recipient on public.reminders;
create policy reminders_update_recipient on public.reminders for update to authenticated
  using (target_user_id = auth.uid())
  with check (target_user_id = auth.uid());

drop policy if exists reminders_update_creator on public.reminders;
create policy reminders_update_creator on public.reminders for update to authenticated
  using (created_by = auth.uid() and status = 'scheduled')
  with check (created_by = auth.uid() and status = 'scheduled');

drop policy if exists reminders_delete on public.reminders;
create policy reminders_delete on public.reminders for delete to authenticated
  using (created_by = auth.uid() or public.is_admin());

-- 2. push_subscriptions table
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  endpoint    text not null,
  p256dh      text not null,
  auth        text not null,
  user_agent  text null,
  created_at  timestamptz not null default now(),
  unique (user_id, endpoint)
);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subs_all on public.push_subscriptions;
create policy push_subs_all on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 3. Realtime publication: enable so the dashboard can subscribe.
alter publication supabase_realtime add table public.reminders;

-- 4. Verification (expect 1 for each)
select 'reminders table' as label, count(*)::int as value
  from information_schema.tables
  where table_schema='public' and table_name='reminders'
union all
select 'push_subscriptions table', count(*)::int
  from information_schema.tables
  where table_schema='public' and table_name='push_subscriptions'
union all
select 'reminders_insert_guard trigger', count(*)::int
  from information_schema.triggers
  where event_object_schema='public' and event_object_table='reminders'
    and trigger_name='reminders_insert_guard_trigger';
