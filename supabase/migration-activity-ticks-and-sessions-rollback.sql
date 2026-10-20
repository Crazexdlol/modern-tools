-- Rollback for migration-activity-ticks-and-sessions.sql (2026-10-15).
-- Drops the tick + session tables + their RLS policies. Leaves
-- user_activity_daily untouched (that one has its own migration).

drop policy if exists user_sessions_select_super_admin on public.user_sessions;
drop policy if exists user_activity_ticks_select_super_admin on public.user_activity_ticks;

drop table if exists public.user_sessions;
drop table if exists public.user_activity_ticks;
