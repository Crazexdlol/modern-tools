-- Rollback for migration-storage-charges.sql. Drops the storage column.
-- Idempotent.

alter table public.acv_history
  drop column if exists storage;
