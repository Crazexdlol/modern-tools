-- Reminders realtime filter fix.
-- The reminders table is in the supabase_realtime publication, but Postgres's
-- default REPLICA IDENTITY only sends the primary key on UPDATE events. That
-- means the realtime server can't evaluate filters like `target_user_id=eq.X`
-- against the row, so the per-user toast subscription in
-- src/components/reminders/reminders-realtime-provider.tsx never fires on live
-- UPDATEs — users had to refresh the page to pull the already-fired reminder.
--
-- REPLICA IDENTITY FULL causes Postgres to log every column on UPDATE, which
-- is what the realtime filter needs.
alter table public.reminders replica identity full;

select 'reminders replica identity' as label,
       (select relreplident from pg_class where oid = 'public.reminders'::regclass) as value;
-- expected: value = 'f' (full)
