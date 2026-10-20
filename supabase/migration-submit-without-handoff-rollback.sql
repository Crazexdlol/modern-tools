-- Rollback for migration-submit-without-handoff.sql.
-- Drops the per-user "bypass handoff" flag. The ClaimWorkspace UI treats a
-- missing column as false (no bypass), so this is safe to run even while
-- the frontend code still references the flag.

alter table public.profiles
  drop column if exists can_submit_without_handoff;
