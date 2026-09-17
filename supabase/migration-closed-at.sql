-- ============================================================
-- Modern Tools — closed_at on acv_history (2026-09-16)
-- Run in the Supabase SQL Editor.
-- Reverses cleanly with migration-closed-at-rollback.sql.
--
-- Purpose:
--   Track WHEN a claim was closed so the All Claims table can show a
--   "Date Closed" column and compute the total days a closed claim was
--   open (closed_at - created_at). Set by /api/claims/[id]/approve when
--   the claim is closed, cleared by /api/claims/[id]/reopen.
--
--   Backfill: existing closed rows get closed_at = submitted_at
--   (best-effort — most closed claims went submit→approve, so this is
--   close to when they actually closed). Rows without submitted_at
--   remain null and show '—' in the UI.
--
--   Idempotent — safe to re-run.
-- ============================================================

alter table public.acv_history
  add column if not exists closed_at timestamptz;

-- One-time backfill for pre-migration closed rows only. Guarded by
-- `closed_at is null` so re-running is a no-op after the first run.
update public.acv_history
  set closed_at = submitted_at
  where status = 'closed'
    and closed_at is null
    and submitted_at is not null;

-- Verification: expect three counts —
--   backfilled: closed rows that now have closed_at
--   still_null: closed rows still missing closed_at (legacy no-submit)
--   total_closed: total closed rows
select
  (select count(*) from public.acv_history where status = 'closed' and closed_at is not null)::int as backfilled,
  (select count(*) from public.acv_history where status = 'closed' and closed_at is null)::int     as still_null,
  (select count(*) from public.acv_history where status = 'closed')::int                            as total_closed;
