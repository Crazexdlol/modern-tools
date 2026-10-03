-- Rollback for migration-reminders.sql
alter publication supabase_realtime drop table if exists public.reminders;
drop trigger if exists reminders_insert_guard_trigger on public.reminders;
drop function if exists public.reminders_insert_guard();
drop table if exists public.push_subscriptions;
drop table if exists public.reminders;
