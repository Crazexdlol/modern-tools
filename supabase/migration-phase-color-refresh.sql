-- =========================================================================
-- Modern Tools — Phase color refresh (2026-09-12)
-- Run in the Supabase SQL Editor (Dashboard -> SQL Editor).
-- Reverses cleanly with migration-phase-color-refresh-rollback.sql.
--
-- Purpose:
--   Give every configured phase a visually distinct color. Prior state had
--   hold / dv_response / completed all rendering blue. Also moves
--   pending_payment off green so completed can own green (per Henry's rule
--   that completed = green).
--
-- Palette after this migration (matches src/lib/supabase/status-phase-configs.ts):
--   pending_payment  purple    (was green)
--   rush             red       (unchanged)
--   umpire           amber     (unchanged)
--   hold             teal      (was blue)
--   dv_response      fuchsia   (was blue)
--   completed        green     (was blue)
--
-- Requires: migration-status-phases.sql, migration-phase-configs-hold.sql,
-- and migration-completed-phase.sql must all have been run so every code
-- referenced below already exists in status_phase_configs.
--
-- Idempotent — safe to re-run.
-- =========================================================================

update public.status_phase_configs set color = 'purple',  updated_at = now() where code = 'pending_payment' and color <> 'purple';
update public.status_phase_configs set color = 'teal',    updated_at = now() where code = 'hold'            and color <> 'teal';
update public.status_phase_configs set color = 'fuchsia', updated_at = now() where code = 'dv_response'     and color <> 'fuchsia';
update public.status_phase_configs set color = 'green',   updated_at = now() where code = 'completed'       and color <> 'green';

-- Verification: expect exactly the six rows above with their new colors.
select code, label, color, sort_order
  from public.status_phase_configs
 where archived = false
 order by sort_order;
