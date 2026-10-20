-- Rollback: restore the fixed-enum CHECK on tickets.subject
-- Note: this will fail if any ticket has a subject outside the enum (which
-- is the whole point of migration-tickets-free-subject). Clean up subjects
-- first, or widen this list, before rolling back.

alter table public.tickets drop constraint if exists tickets_subject_length;

alter table public.tickets
  add constraint tickets_subject_check check (subject in (
    'ACV Report','Diminished Value','Estimate Review',
    'Dashboard','Claim Info','Documents','Other'
  ));
