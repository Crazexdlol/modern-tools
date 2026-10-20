-- =========================================================================
-- HamsPortal — Negotiations perf migration (2026-09-18)
-- Adds denormalized latest_* + has_draft columns on email_threads so the
-- inbox list becomes ONE indexed query instead of a full scan + N message
-- fetches. Backfills from existing data. Idempotent — safe to re-run.
-- =========================================================================

alter table public.email_threads
  add column if not exists latest_from_addr       text,
  add column if not exists latest_from_name       text,
  add column if not exists latest_subject         text,
  add column if not exists latest_snippet         text,
  add column if not exists latest_sent_at         timestamptz,
  add column if not exists latest_has_attachments boolean not null default false,
  add column if not exists has_draft              boolean not null default false;

-- Backfill: for every thread, pull the newest message's key fields.
with latest as (
  select distinct on (thread_id)
    thread_id,
    from_addr,
    from_name,
    subject,
    text_body,
    sent_at,
    has_attachments
  from public.email_messages
  order by thread_id, sent_at desc
)
update public.email_threads t
set
  latest_from_addr = l.from_addr,
  latest_from_name = l.from_name,
  latest_subject = l.subject,
  latest_snippet = substring(
    regexp_replace(coalesce(l.text_body, ''), '\s+', ' ', 'g'),
    1, 240
  ),
  latest_sent_at = l.sent_at,
  latest_has_attachments = coalesce(l.has_attachments, false)
from latest l
where t.id = l.thread_id
  and (t.latest_sent_at is null or t.latest_sent_at <> l.sent_at);

-- has_draft: true iff there's a negotiation_drafts row for this thread's case.
update public.email_threads t
set has_draft = exists (
  select 1
  from public.negotiation_drafts d
  where d.case_id = t.negotiation_case_id
);

-- Composite index for the primary inbox query: filter by status + order by
-- newest first. NULLS LAST keeps threads without messages at the bottom.
create index if not exists email_threads_status_latest_at_idx
  on public.email_threads (status, latest_sent_at desc nulls last);

-- Also useful for the has_draft indicator when filtering unmatched w/ draft.
create index if not exists email_threads_has_draft_idx
  on public.email_threads (has_draft) where has_draft = true;
