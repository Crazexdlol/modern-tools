-- =========================================================================
-- Modern Tools — Completed phase ROLLBACK
-- Reverses migration-completed-phase.sql.
--
-- Note: rolling this back also requires reverting the server-side changes
-- to submit/send-back/reassign/reopen. Otherwise those routes will keep
-- writing status_phase='completed' but the config row is gone and phase
-- lookups (via status_phase_configs) will show a bare code with no label.
-- =========================================================================

-- 1. Clear the phase from any row that has it set (so rows aren't left
--    referencing a soon-to-be-deleted config code).
update public.acv_history
   set status_phase = null,
       status_phase_set_at = null
 where status_phase = 'completed';

-- 2. Delete the config row.
delete from public.status_phase_configs where code = 'completed';
