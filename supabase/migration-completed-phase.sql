-- =========================================================================
-- Modern Tools — Completed phase (2026-09-11)
-- Run in the Supabase SQL Editor (Dashboard -> SQL Editor).
-- Reverses cleanly with migration-completed-phase-rollback.sql.
--
-- Purpose:
--   Convert the "Completed Assignments" queue (a separate route filtered by
--   submitted_at) into a first-class status_phase called "completed", so
--   submitted claims stay visible on the dashboard with the rest of the
--   book and admins filter to them via the same phase-filter UI used by
--   Pending Payment / Umpire / Hold / etc.
--
-- What this does:
--
--   1. Adds a "completed" row to status_phase_configs (blue, sort_order=6).
--
--   2. Backfills status_phase='completed' + status_phase_set_at=submitted_at
--      for every currently-submitted OPEN row whose status_phase is NULL.
--      Rows whose phase is already something else (e.g. someone flagged it
--      Umpire while it was submitted) are left alone — the phase they have
--      is more specific than "completed".
--
-- Server-side companion (shipped in the same session):
--   - /api/claims/[id]/submit    — also sets status_phase='completed'
--   - /api/claims/[id]/send-back — clears status_phase if it's 'completed'
--   - /api/claims/[id]/assign    — clears status_phase if it's 'completed'
--   - /api/claims/[id]/reopen    — clears status_phase if it's 'completed'
--   These keep the phase in sync with the submitted state.
-- =========================================================================

-- 1. Phase config. Idempotent — safe to re-run.
insert into public.status_phase_configs (code, label, color, sort_order) values
  ('completed', 'Completed', 'blue', 6)
on conflict (code) do update set
  label = excluded.label,
  color = excluded.color,
  sort_order = excluded.sort_order,
  archived = false,
  updated_at = now();

-- 2. Backfill for existing submitted-and-still-open claims.
update public.acv_history
   set status_phase = 'completed',
       status_phase_set_at = submitted_at
 where status = 'open'
   and submitted_at is not null
   and status_phase is null;

-- 3. Verification (informational)
select 'completed phase config exists' as label,
       count(*) as value
  from public.status_phase_configs
 where code = 'completed'
union all
select 'open+submitted rows now phased completed' as label,
       count(*) as value
  from public.acv_history
 where status = 'open'
   and submitted_at is not null
   and status_phase = 'completed'
union all
select 'open+submitted rows still without a phase' as label,
       count(*) as value
  from public.acv_history
 where status = 'open'
   and submitted_at is not null
   and status_phase is null;

-- Expected: 1, N, 0  (N depends on current book state).
