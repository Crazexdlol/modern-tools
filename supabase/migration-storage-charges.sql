-- ============================================================
-- Modern Tools — Storage Charges tool (2026-09-15)
-- Run in the Supabase SQL Editor.
-- Reverses cleanly with migration-storage-charges-rollback.sql.
--
-- Purpose:
--   Adds a `storage` jsonb column to acv_history, matching the pattern used
--   by other per-claim tool blobs (dv, estimate, invoice, documents). Shape
--   lives in src/lib/acv/types.ts (StorageState).
--
--   Idempotent — safe to re-run. Existing claims fall through with NULL,
--   which the client treats as an empty StorageState.
-- ============================================================

alter table public.acv_history
  add column if not exists storage jsonb;

-- Verification (should return 1 if column now exists):
select 'storage column' as label, count(*)::int as value
  from information_schema.columns
  where table_schema = 'public' and table_name = 'acv_history' and column_name = 'storage';
