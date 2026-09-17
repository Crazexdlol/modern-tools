-- =========================================================================
-- Modern Tools — Phase color refresh ROLLBACK (2026-09-12)
-- Reverses migration-phase-color-refresh.sql.
-- Run in the Supabase SQL Editor (Dashboard -> SQL Editor).
--
-- Restores prior colors: pending_payment=green, hold=blue, dv_response=blue,
-- completed=blue. Leaves rush and umpire alone (unchanged in the forward
-- migration).
--
-- Idempotent — safe to re-run.
-- =========================================================================

update public.status_phase_configs set color = 'green', updated_at = now() where code = 'pending_payment' and color <> 'green';
update public.status_phase_configs set color = 'blue',  updated_at = now() where code = 'hold'            and color <> 'blue';
update public.status_phase_configs set color = 'blue',  updated_at = now() where code = 'dv_response'     and color <> 'blue';
update public.status_phase_configs set color = 'blue',  updated_at = now() where code = 'completed'       and color <> 'blue';

select code, label, color, sort_order
  from public.status_phase_configs
 where archived = false
 order by sort_order;
