-- ============================================================
-- Modern Tools — Help Articles migration (2026-09-12)
-- Run in the Supabase SQL Editor (Dashboard → SQL Editor).
-- Reverses cleanly with migration-help-articles-rollback.sql.
--
-- Purpose:
--   Backs the /help Q&A feature. Admins curate question/answer pairs in
--   /admin/settings/help. Users search them at /help; anything the FAQ
--   doesn't cover falls through to the "Ask Henry" AI endpoint
--   (/api/help/ask), which uses these same articles as retrieval context.
--
-- Idempotent — safe to re-run.
-- ============================================================

create table if not exists public.help_articles (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  tags text[] not null default '{}',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived boolean not null default false
);

create index if not exists help_articles_active_idx
  on public.help_articles(archived, updated_at desc);

alter table public.help_articles enable row level security;

drop policy if exists "Authenticated read help_articles" on public.help_articles;
create policy "Authenticated read help_articles"
  on public.help_articles for select
  using (auth.role() = 'authenticated');

drop policy if exists "Admin write help_articles" on public.help_articles;
create policy "Admin write help_articles"
  on public.help_articles for all
  using (public.is_admin())
  with check (public.is_admin());

-- Verification
select 'help_articles table' as label, count(*)::int as value
  from information_schema.tables
  where table_schema = 'public' and table_name = 'help_articles';
