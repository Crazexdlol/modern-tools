-- Rollback for migration-negotiations-perf.sql
drop index if exists public.email_threads_status_latest_at_idx;
drop index if exists public.email_threads_has_draft_idx;

alter table public.email_threads
  drop column if exists latest_from_addr,
  drop column if exists latest_from_name,
  drop column if exists latest_subject,
  drop column if exists latest_snippet,
  drop column if exists latest_sent_at,
  drop column if exists latest_has_attachments,
  drop column if exists has_draft;
