-- Migration: tickets table
-- Run in the Supabase SQL editor. Matching rollback: migration-tickets-rollback.sql

create table if not exists public.tickets (
  id             uuid primary key default gen_random_uuid(),
  submitted_by   uuid not null references public.profiles(id) on delete cascade,
  subject        text not null check (subject in (
                   'ACV Report','Diminished Value','Estimate Review',
                   'Dashboard','Claim Info','Documents','Other'
                 )),
  description    text not null check (char_length(description) between 1 and 4000),
  status         text not null default 'open'
                   check (status in ('open','in_progress','resolved','dismissed')),
  resolution_note text null,
  created_at     timestamptz not null default now(),
  resolved_at    timestamptz null
);

create index if not exists tickets_status_created_at_idx
  on public.tickets (status, created_at desc);

create index if not exists tickets_submitted_by_idx
  on public.tickets (submitted_by);

alter table public.tickets enable row level security;

-- Users may insert tickets as themselves and read their own tickets back.
drop policy if exists tickets_insert on public.tickets;
create policy tickets_insert on public.tickets for insert to authenticated
  with check (submitted_by = auth.uid());

drop policy if exists tickets_select_own on public.tickets;
create policy tickets_select_own on public.tickets for select to authenticated
  using (submitted_by = auth.uid());

-- Super-admin reads/writes everything.
drop policy if exists tickets_super_admin_all on public.tickets;
create policy tickets_super_admin_all on public.tickets for all to authenticated
  using ((select is_super_admin from public.profiles where id = auth.uid()) = true)
  with check ((select is_super_admin from public.profiles where id = auth.uid()) = true);

-- Verification
select 'tickets table' as label, count(*)::int as value
  from information_schema.tables
  where table_schema='public' and table_name='tickets'
union all
select 'tickets policies', count(*)::int
  from pg_policies where schemaname='public' and tablename='tickets';
