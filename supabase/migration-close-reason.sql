-- ============================================================
-- Modern Tools — close_reason on acv_history (2026-09-15)
-- Run in the Supabase SQL Editor.
-- Reverses cleanly with migration-close-reason-rollback.sql.
--
-- Purpose:
--   Split the single "Close Claim" admin action into two variants:
--     'completed' — the claim ran its normal course and was closed.
--     'cancelled' — the claim was pulled (client withdrew, wrong appraiser
--                   assigned, duplicate, etc.) and did not run to closure.
--
--   Both end up as status='closed'; the reason lets admins filter/report on
--   the two buckets in the Closed Claims list without conflating them.
--
--   Older rows that were closed before this migration ran do NOT get
--   backfilled with a reason — leaving them NULL means "closed, reason
--   unknown / pre-migration" which is honest. The UI treats NULL the same
--   as 'completed' for display fallback but the filter can distinguish.
--
--   Idempotent — safe to re-run.
-- ============================================================

alter table public.acv_history
  add column if not exists close_reason text
  check (close_reason in ('completed', 'cancelled') or close_reason is null);

-- Verification: expect '1' if the column now exists.
select 'close_reason column' as label, count(*)::int as value
  from information_schema.columns
  where table_schema = 'public' and table_name = 'acv_history' and column_name = 'close_reason';
