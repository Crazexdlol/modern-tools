-- ============================================================
-- HamsPortal — claim reopen labels (supplement/revision) (2026-10-12)
-- Run in the Supabase SQL Editor.
-- Reverses cleanly with migration-claim-labels-rollback.sql.
--
-- Purpose:
--   Two row-level descriptors on acv_history that pair with the reopen
--   flow. Both are shown as pills next to the Open/Submitted status chip.
--
--     supplement_count  int   -- increments every time a closed claim
--                              is reopened "as a supplement". Pill
--                              shows "Supp N" when >= 1.
--     is_revision       bool  -- one-time flag: set when a closed
--                              claim is reopened "as a revision".
--                              Idempotent — repeat revision-reopens
--                              don't change anything else.
--
--   Both are written ONLY by /api/claims/[id]/reopen (so the autosave
--   path can never regress the counter).
--
--   NOTE: "Specialty" is NOT a column here — it's a chip inside the
--   existing claim.claimTypes jsonb array (the ClaimType union gained
--   a 'specialty' value on 2026-10-12). No DB change needed for it.
--
--   Idempotent — safe to re-run. No backfill needed; defaults suffice
--   for all existing rows.
-- ============================================================

alter table public.acv_history
  add column if not exists supplement_count integer not null default 0,
  add column if not exists is_revision      boolean not null default false;

-- Verification: expect zero rows with non-default values on first run
-- (because both columns were just added with defaults).
select
  (select count(*) from public.acv_history where supplement_count > 0)::int as rows_with_supp,
  (select count(*) from public.acv_history where is_revision)::int           as rows_revision,
  (select count(*) from public.acv_history)::int                              as total_rows;
