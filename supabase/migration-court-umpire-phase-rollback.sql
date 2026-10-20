-- Rollback — archives Court Appointed Umpire so claims tagged with it keep
-- their historical value but the chip stops rendering in the picker + chip bar.
update public.status_phase_configs
   set archived = true,
       updated_at = now()
 where code = 'court_umpire';
