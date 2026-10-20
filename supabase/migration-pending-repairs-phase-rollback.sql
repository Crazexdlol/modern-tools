-- Rollback — Pending Repairs phase (2026-10-09)
--
-- Archives (not deletes) the Pending Repairs row so any claim that was tagged
-- with it keeps its historical phase value, but the chip stops rendering in
-- the admin phase list / dashboard chip bar.
update public.status_phase_configs
   set archived = true,
       updated_at = now()
 where code = 'pending_repairs';
