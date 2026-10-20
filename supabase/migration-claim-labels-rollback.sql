-- Rollback for migration-claim-labels.sql. Drops the two reopen-label
-- columns. After rollback, src/lib/supabase/history.ts and the
-- /api/claims/[id]/reopen handler both quietly skip these columns (their
-- 42703 fallback paths handle it), so the app still works — labels just
-- aren't persisted until the migration is re-applied.

alter table public.acv_history
  drop column if exists supplement_count,
  drop column if exists is_revision;
