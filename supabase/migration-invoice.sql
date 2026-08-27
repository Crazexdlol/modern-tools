-- ============================================================
-- Modern Tools — Invoice (Reports tab) Migration (2026-07-20)
-- Run in the Supabase SQL Editor (project ektglhdstobaipdqssjx).
-- Safe to re-run. Required for the claim workspace's Reports tab.
-- ============================================================

alter table acv_history add column if not exists invoice jsonb;

-- Verify:
--   select column_name from information_schema.columns
--   where table_name = 'acv_history' and column_name = 'invoice';
