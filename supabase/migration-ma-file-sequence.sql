-- ============================================================
-- HamsPortal — Modern Appraisers MA# auto-sequence (2026-10-10)
-- Run in the Supabase SQL Editor.
-- Reversible via migration-ma-file-sequence-rollback.sql.
--
-- Purpose:
--   Every NEW Modern Appraisers claim gets an auto-assigned MA# starting
--   at 55501 and incrementing forever. Existing claims (and existing
--   blank/null MA#s) are untouched — zero backfill. 55501 is a 5-digit
--   value sitting below the live 6-digit MA# space (which Henry's team
--   has already pushed past 555000), so the new sequence doesn't collide
--   with anything historical. We still verify this in step 1 and refuse
--   to create the sequence if any live MA# falls in the 55501–99999
--   range.
--
--   Guarantees:
--     * `nextval()` is atomic — two simultaneous inserts can never collide
--     * UNIQUE index on ma_number (where not null + not blank) prevents
--       duplicates from EVERY path: cron, script, admin override, future
--       feature. Any attempt to insert a dup fails loudly.
--     * BEFORE INSERT trigger as a safety net — if a new claim arrives
--       with no ma_number (e.g. a script that forgot to call the frontend
--       auto-fill), the trigger assigns one from the right sequence
--       (ma_file_seq for MA, eagleview_file_seq for EV).
--
--   Mirrors migration-eagleview-file-sequence.sql — same shape, different
--   starting number. Shares the auto-assign trigger with EV.
--
--   Idempotent — safe to re-run.
-- ============================================================

-- 1. Pre-flight: fail LOUDLY if any existing MA# falls in the sequence's
-- range (55501..99999). Only numeric-only MA#s matter — free-text ones
-- like "MA-12345" or "25-00987" can't collide. The upper bound 99999 is
-- because the sequence will take roughly 44,000 fires (plenty of
-- headroom) before crossing 100000; once it does, we're back in the
-- 6-digit space the legacy numbers live in, so we need to make sure the
-- sequence has advanced past the legacy max by then. The simplest
-- defense is the UNIQUE index in step 5 — if a future nextval() lands
-- on an occupied value, the INSERT fails and the sequence advances on
-- the next attempt. For the one-time starting check we just need to
-- confirm the opening slot is clear.
do $$
declare
  n int;
begin
  select count(*) into n from public.acv_history
    where ma_number ~ '^[0-9]+$'
      and ma_number::bigint between 55501 and 99999;
  if n > 0 then
    raise exception 'Found % existing claim(s) with numeric ma_number between 55501 and 99999. Resolve those first.', n;
  end if;
end $$;

-- 2. Pre-flight: fail LOUDLY if any existing ma_number duplicates exist.
-- The UNIQUE index in step 5 would fail anyway; failing here surfaces the
-- problem with a clear message.
do $$
declare
  n int;
begin
  select count(*) into n from (
    select ma_number from public.acv_history
      where ma_number is not null and btrim(ma_number) <> ''
      group by ma_number having count(*) > 1
  ) d;
  if n > 0 then
    raise exception 'Found % duplicate ma_number value(s) in acv_history. Resolve those first.', n;
  end if;
end $$;

-- 3. Create the MA sequence starting at 55501.
create sequence if not exists public.ma_file_seq
  start with 55501
  increment by 1
  no maxvalue
  no cycle;

grant usage on sequence public.ma_file_seq to authenticated;

-- 4. RPC — Supabase-js can't call nextval() directly. Security-definer
-- so any authenticated MA user (or admin) can reserve a number via .rpc().
create or replace function public.nextval_public_ma_file_seq()
  returns table(value bigint)
  language sql
  volatile
  security definer
  set search_path = public
as $$
  select nextval('public.ma_file_seq') as value;
$$;

grant execute on function public.nextval_public_ma_file_seq() to authenticated;

-- 5. UNIQUE index — primary defense against duplicates. Partial index
-- (where ma_number is not null + not blank) so historical NULL/blank rows
-- stay allowed.
create unique index if not exists acv_history_ma_number_unique
  on public.acv_history(ma_number)
  where ma_number is not null and btrim(ma_number) <> '';

-- 6. Safety-net trigger — if a new claim gets inserted without an
-- ma_number (frontend bug, direct SQL insert, script that forgot to call
-- the API), the trigger assigns one from the company's sequence. If the
-- frontend already fetched a number via the API, the trigger sees it set
-- and no-ops.
create or replace function public.assign_ma_number_if_missing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  company_slug text;
begin
  -- Explicit value provided — nothing to do.
  if new.ma_number is not null and btrim(new.ma_number) <> '' then
    return new;
  end if;

  -- No value — try to pick the right sequence from the claim's company.
  if new.company_id is not null then
    select slug into company_slug from public.companies where id = new.company_id;
  end if;

  if company_slug = 'modern-appraisers' then
    new.ma_number := nextval('public.ma_file_seq')::text;
  elsif company_slug = 'eagleview' then
    new.ma_number := nextval('public.eagleview_file_seq')::text;
  else
    -- Pre-multi-company rows or unknown company — default to MA sequence
    -- so we never leave a new claim without an MA#. If this misfires for
    -- some edge case, the UNIQUE constraint still prevents duplicates.
    new.ma_number := nextval('public.ma_file_seq')::text;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_assign_ma_number_if_missing on public.acv_history;
create trigger trg_assign_ma_number_if_missing
  before insert on public.acv_history
  for each row
  execute function public.assign_ma_number_if_missing();

-- 7. Verification. Expected output:
--   ma_file_seq current value: 555001 (or whatever was last reserved + 1)
--   ma_file_seq is_called:     f (false) if never fired, t (true) if fired
--   unique index installed:    1
--   assign trigger installed:  1
--   nextval RPC installed:     1
select 'ma_file_seq last_value' as label, last_value::text as value from public.ma_file_seq
union all
select 'ma_file_seq is_called', is_called::text from public.ma_file_seq
union all
select 'ma_number unique index installed', count(*)::text from pg_indexes where indexname = 'acv_history_ma_number_unique'
union all
select 'assign-ma-number trigger installed', count(*)::text from pg_trigger where tgname = 'trg_assign_ma_number_if_missing'
union all
select 'nextval_public_ma_file_seq RPC installed', count(*)::text from pg_proc where proname = 'nextval_public_ma_file_seq';

-- If you accidentally burn 55501 via a verification nextval(), reset with:
--   select setval('public.ma_file_seq', 55500, true);
-- Then the next real claim picks up 55501.
