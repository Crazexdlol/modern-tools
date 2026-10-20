-- =========================================================================
-- HamsPortal — Phase palette repaint (2026-10-10)
--
-- Henry sent a reference image showing the final chip colors he wants for
-- every orthogonal status phase. This migration overwrites the color on
-- each active row to match. Idempotent — safe to re-run.
--
-- Final palette:
--   rush                  → red     (unchanged)
--   umpire                → amber   (unchanged — orange-brown)
--   hold                  → green   (was teal)
--   dv_response           → purple  (was fuchsia; renders as violet-50)
--   pending_repairs       → gray    (was purple; renders as slate-100)
--   court_umpire          → yellow  (was fuchsia; distinct bright gold,
--                                     new color added to phaseColorClasses)
--   pending_information   → teal    (was blue)
--
-- Rows that no longer surface (pending_payment / completed, archived by the
-- workflow-stages migration) are left untouched — the UI filters archived.
-- =========================================================================

update public.status_phase_configs set color = 'red',    updated_at = now() where code = 'rush'                and color <> 'red';
-- Umpire moved from 'amber' → 'orange' in the follow-up migration-umpire-orange-2026-10-10.sql
-- so it isn't visually adjacent to Court Appointed Umpire's yellow. This file
-- was updated after Henry ran it; re-running is still safe.
update public.status_phase_configs set color = 'orange', updated_at = now() where code = 'umpire'              and color <> 'orange';
update public.status_phase_configs set color = 'green',  updated_at = now() where code = 'hold'                and color <> 'green';
update public.status_phase_configs set color = 'purple', updated_at = now() where code = 'dv_response'         and color <> 'purple';
update public.status_phase_configs set color = 'gray',   updated_at = now() where code = 'pending_repairs'     and color <> 'gray';
update public.status_phase_configs set color = 'yellow', updated_at = now() where code = 'court_umpire'        and color <> 'yellow';
update public.status_phase_configs set color = 'teal',   updated_at = now() where code = 'pending_information' and color <> 'teal';

-- Verification
select code, label, color, sort_order, archived
  from public.status_phase_configs
 order by sort_order;
