-- =========================================================================
-- HamsPortal — Reminders subject column (2026-10-05)
-- Adds a `subject` field to reminders. The API now requires `subject` on
-- create and treats the longer `note` as optional body text.
-- Idempotent; reversible via migration-reminders-subject-rollback.sql.
-- =========================================================================

alter table public.reminders
  add column if not exists subject text;

alter table public.reminders
  drop constraint if exists reminders_subject_length_check;
alter table public.reminders
  add constraint reminders_subject_length_check
    check (subject is null or char_length(subject) between 1 and 200);

-- Backfill a subject for every pre-existing row so the UI has something to
-- show. We take the first ~80 chars of the note and strip trailing space.
update public.reminders
   set subject = regexp_replace(left(note, 80), '\s+$', '')
 where subject is null and note is not null and length(note) > 0;

-- Verify
select 'reminders.subject column' as label,
       count(*)::int as value
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'reminders'
   and column_name = 'subject';
-- expected: value = 1
