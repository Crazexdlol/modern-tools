-- =========================================================================
-- HamsPortal — "Pending Repairs" status phase (2026-10-09, color revised
-- 2026-10-10 teal → purple because teal-50 reads too close to blue-50 on the
-- dashboard chip bar, colliding visually with Hold).
--
-- Adds a new orthogonal status phase chip ("Pending Repairs", purple). Used
-- when the vehicle is at a body shop having repairs completed while the
-- claim is otherwise open at any workflow_stage.
--
-- Idempotent — safe to re-run (the UPSERT flips the color on existing rows).
-- =========================================================================

-- Note: color 'gray' per the 2026-10-10 palette repaint (see
-- migration-phase-palette-2026-10-10.sql). Earlier draft used 'teal' and
-- 'purple'; both collided with other phases in the final palette.
insert into public.status_phase_configs (code, label, color, sort_order) values
  ('pending_repairs', 'Pending Repairs', 'gray', 5)
on conflict (code) do update set
  label = excluded.label,
  color = excluded.color,
  sort_order = excluded.sort_order;

-- Verification
select code, label, color, sort_order, archived
  from public.status_phase_configs
 order by sort_order;
