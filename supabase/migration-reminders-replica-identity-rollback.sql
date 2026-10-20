-- Rollback for migration-reminders-replica-identity.sql.
alter table public.reminders replica identity default;
