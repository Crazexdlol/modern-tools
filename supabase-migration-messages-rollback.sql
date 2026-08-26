-- =========================================================================
-- Rollback for supabase-migration-messages.sql
-- Drops both new tables + their policies. No other tables touched.
-- =========================================================================

drop policy if exists message_reads_self_all on public.message_reads;
drop table if exists public.message_reads;

drop policy if exists messages_select on public.messages;
drop policy if exists messages_insert on public.messages;
drop table if exists public.messages;
