-- Rollback for migration-close-reason.sql. Drops the close_reason column
-- from acv_history. Idempotent.

alter table public.acv_history
  drop column if exists close_reason;
