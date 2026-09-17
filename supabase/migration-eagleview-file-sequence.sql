-- ============================================================
-- HamsPortal — Eagleview file-number auto-sequence (2026-09-17)
-- Run in the Supabase SQL Editor.
-- Reversible via migration-eagleview-file-sequence-rollback.sql.
--
-- Purpose:
--   Every new Eagleview claim gets an auto-generated file number starting
--   at 222001 and incrementing by 1 forever. Modern Appraisers is unchanged
--   (users enter the MA# from the assignment PDF as they always have).
--
--   The sequence is atomic — two simultaneous EV claim creations can't
--   collide on the same number. If a claim is cancelled after fetching a
--   number, that number is skipped (acceptable — sequences aren't
--   guaranteed gap-free by design).
--
--   Idempotent — safe to re-run. If the sequence already exists it is
--   left alone (existing value preserved).
-- ============================================================

create sequence if not exists public.eagleview_file_seq
  start with 222001
  increment by 1
  no maxvalue
  no cycle;

grant usage on sequence public.eagleview_file_seq to authenticated;

-- RPC that reserves the next file number. Supabase-js can't call nextval()
-- directly, so we expose it as a security-definer function that any
-- authenticated Eagleview user (or admin) can invoke via .rpc().
create or replace function public.nextval_public_eagleview_file_seq()
  returns table(value bigint)
  language sql
  volatile
  security definer
  set search_path = public
as $$
  select nextval('public.eagleview_file_seq') as value;
$$;

grant execute on function public.nextval_public_eagleview_file_seq() to authenticated;

-- Verification: reserving one value proves both the sequence and the RPC
-- work end-to-end. Expect a single row like { value: 222001 } the first
-- time you run this. Subsequent runs increment.
select value as reserved_next_for_verify
  from public.nextval_public_eagleview_file_seq();

-- If you want to reset the starting value (e.g. because the verification
-- SELECT above burned 222001), run:
--   select setval('public.eagleview_file_seq', 222000, true);
-- Then the next real EV claim will pick up 222001.
