-- =========================================================================
-- HamsPortal — Negotiations matcher v2 (2026-10-01)
-- Adds: email_threads.matcher_version column + negotiation_muted_senders table.
-- Run in Supabase SQL Editor. Idempotent. Reversible via -rollback.sql.
-- =========================================================================

-- 1. matcher_version on email_threads. Default 0 so EVERY existing thread
--    becomes eligible for re-processing after the migration runs (the
--    matcher constant in code is set to 2).
alter table public.email_threads
  add column if not exists matcher_version smallint not null default 0;

create index if not exists email_threads_matcher_version_idx
  on public.email_threads (matcher_version)
  where status = 'unmatched';

-- 2. negotiation_muted_senders — Henry-personal state, flag-only RLS.
create table if not exists public.negotiation_muted_senders (
  id         uuid        primary key default gen_random_uuid(),
  email      text        null,
  domain     text        null,
  muted_at   timestamptz not null default now(),
  muted_by   uuid        null references public.profiles(id) on delete set null,
  note       text        null,
  constraint muted_one_of_email_or_domain check ((email is null) <> (domain is null))
);

create unique index if not exists negotiation_muted_senders_email_idx
  on public.negotiation_muted_senders (email)  where email  is not null;
create unique index if not exists negotiation_muted_senders_domain_idx
  on public.negotiation_muted_senders (domain) where domain is not null;

alter table public.negotiation_muted_senders enable row level security;

drop policy if exists nms_all on public.negotiation_muted_senders;
create policy nms_all on public.negotiation_muted_senders for all to authenticated
  using (public.has_negotiations_access())
  with check (public.has_negotiations_access());

-- 3. Verification (expect 1 for every row).
select 'email_threads.matcher_version col' as label, count(*)::int as value
  from information_schema.columns
  where table_schema='public' and column_name='matcher_version' and table_name='email_threads'
union all
select 'negotiation_muted_senders table', count(*)::int
  from information_schema.tables
  where table_schema='public' and table_name='negotiation_muted_senders'
union all
select 'nms RLS policy', count(*)::int
  from pg_policies
  where schemaname='public' and tablename='negotiation_muted_senders' and policyname='nms_all';
