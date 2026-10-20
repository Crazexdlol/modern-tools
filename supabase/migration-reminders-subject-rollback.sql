-- Rollback for migration-reminders-subject.sql
alter table public.reminders drop constraint if exists reminders_subject_length_check;
alter table public.reminders drop column if exists subject;
