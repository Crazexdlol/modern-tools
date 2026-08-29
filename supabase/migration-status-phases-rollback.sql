-- =========================================================================
-- ROLLBACK for supabase/migration-status-phases.sql
-- =========================================================================

drop table if exists public.status_phase_configs cascade;

alter table public.acv_history
  drop column if exists status_phase,
  drop column if exists status_phase_set_at;

drop index if exists public.acv_history_status_phase_idx;
