-- =========================================================================
-- HamsPortal — Umpire → orange (2026-10-10 follow-up)
--
-- After the first palette repaint, Henry noted Umpire (amber-50) and Court
-- Appointed Umpire (yellow-50) read as basically the same pale yellow. Shift
-- Umpire to a distinct orange so the two chips are unmistakable.
--
-- Requires the 'orange' entry added to phaseColorClasses in the same deploy.
-- Idempotent — safe to re-run.
-- =========================================================================

update public.status_phase_configs
   set color = 'orange',
       updated_at = now()
 where code = 'umpire'
   and color <> 'orange';

select code, label, color, sort_order, archived
  from public.status_phase_configs
 order by sort_order;
