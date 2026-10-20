-- Rollback for migration-cycle-times.sql. Drops the event ledger entirely.
-- The API routes guard every write with a try/catch on 42P01 (undefined_table),
-- so dropping this table does NOT break any claim workflow — events just stop
-- being recorded until the migration is re-applied.

drop table if exists public.claim_stage_events cascade;
