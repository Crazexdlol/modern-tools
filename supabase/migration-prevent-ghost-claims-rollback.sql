-- Rollback for migration-prevent-ghost-claims.sql
alter table public.acv_history drop constraint if exists acv_history_identifiable_check;
