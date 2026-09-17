-- =========================================================================
-- Modern Tools — Team-wide starred flag on claims (2026-09-14)
-- Run in the Supabase SQL Editor (Dashboard -> SQL Editor).
-- Reverses cleanly with migration-star-claims-rollback.sql.
--
-- Adds acv_history.starred (bool, default false). Team-wide: any authenticated
-- user can toggle it via /api/claims/[id]/star (which uses the service client,
-- bypassing the appraiser-guard trigger that would otherwise block writes
-- to arbitrary columns). Nothing else in the workflow depends on this flag —
-- it's purely a dashboard sort/attention marker.
--
-- Idempotent — safe to re-run.
-- =========================================================================

alter table public.acv_history
  add column if not exists starred boolean not null default false;

create index if not exists acv_history_starred_idx on public.acv_history (starred) where starred = true;

-- Verification.
select 'starred column exists' as label, count(*)::int as value
  from information_schema.columns
  where table_schema='public' and table_name='acv_history' and column_name='starred';
-- Expected: 1.
