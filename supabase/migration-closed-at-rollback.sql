-- Rollback for migration-closed-at.sql. Drops the closed_at column.
-- After rollback, /api/claims/[id]/approve and /reopen quietly skip the
-- column (their 42703 fallback paths handle it), so the app still works.

alter table public.acv_history
  drop column if exists closed_at;
