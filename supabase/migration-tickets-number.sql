-- Migration: tickets.number — short, user-visible ticket number
-- so users can track / phone-reference a ticket without quoting its UUID.
-- Run in the Supabase SQL editor. Rollback: migration-tickets-number-rollback.sql

-- 1. Add the column (nullable first so backfill can land before NOT NULL).
alter table public.tickets add column if not exists number bigint;

-- 2. Backfill in creation order so #1 is the oldest ticket.
with ordered as (
  select id, row_number() over (order by created_at) as rn
    from public.tickets
   where number is null
)
update public.tickets t
   set number = o.rn
  from ordered o
 where t.id = o.id;

-- 3. Sequence advances past whatever the backfill reached so new inserts
--    continue the numbering cleanly.
create sequence if not exists public.tickets_number_seq;
select setval(
  'public.tickets_number_seq',
  coalesce((select max(number) from public.tickets), 0),
  true
);

-- 4. Hook the sequence up as the column default and lock it NOT NULL + UNIQUE.
alter table public.tickets
  alter column number set default nextval('public.tickets_number_seq');
alter table public.tickets alter column number set not null;

-- Uniqueness guard. If a prior run partially added it, drop + re-add is safe
-- because the backfill above makes the data unique.
alter table public.tickets drop constraint if exists tickets_number_unique;
alter table public.tickets add constraint tickets_number_unique unique (number);

-- Verification (does NOT advance the sequence — just peeks).
select 'tickets with number' as label, count(*)::int as value from public.tickets where number is not null
union all
select 'tickets missing number', count(*)::int from public.tickets where number is null
union all
select 'sequence last_value', last_value::int from public.tickets_number_seq;
