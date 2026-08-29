-- =========================================================================
-- ROLLBACK for supabase/migration-forbidden-states.sql
-- =========================================================================

-- Remove the MA seed if it was inserted by the up migration (keeps MA if
-- it was already there before with a different state).
delete from public.licensed_states
  where state = 'MA'
    and notes = 'Modern Appraisers cannot handle Massachusetts claims — reassign or decline immediately.';

alter table public.licensed_states
  drop column if exists forbidden;
