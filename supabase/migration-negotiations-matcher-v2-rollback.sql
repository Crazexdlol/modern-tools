-- Rollback for migration-negotiations-matcher-v2.sql.
-- Removes the matcher_version column and the muted-senders table.

drop policy if exists nms_all on public.negotiation_muted_senders;
drop table if exists public.negotiation_muted_senders;

drop index if exists public.email_threads_matcher_version_idx;
alter table public.email_threads drop column if exists matcher_version;
