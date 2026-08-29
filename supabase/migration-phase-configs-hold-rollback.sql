-- Rollback for supabase/migration-phase-configs-hold.sql
delete from public.status_phase_configs where code = 'hold';
update public.status_phase_configs set color = 'red' where code = 'umpire';
