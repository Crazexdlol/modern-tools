-- ============================================================
-- Modern Tools — Help Articles ROLLBACK (2026-09-12)
-- ============================================================

drop policy if exists "Admin write help_articles"       on public.help_articles;
drop policy if exists "Authenticated read help_articles" on public.help_articles;

drop table if exists public.help_articles;
