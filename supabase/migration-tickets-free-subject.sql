-- Migration: allow free-text ticket subjects (drop the fixed-enum CHECK).
-- Henry 2026-10-15: ticket subject should be whatever the user types, not a
-- dropdown with 7 options.
-- Rollback: migration-tickets-free-subject-rollback.sql

-- Drop whatever CHECK constraint currently restricts subject to the enum.
-- The constraint was unnamed in the original migration, so Postgres
-- auto-generated the name — iterate to catch whichever name it got.
do $$
declare r record;
begin
  for r in
    select conname
      from pg_constraint
     where conrelid = 'public.tickets'::regclass
       and contype  = 'c'
       and pg_get_constraintdef(oid) ilike '%subject%in%'
  loop
    execute format('alter table public.tickets drop constraint %I', r.conname);
  end loop;
end$$;

-- Replace with a length guard (keeps "" and 10 KB rants out, but no fixed list).
alter table public.tickets
  drop constraint if exists tickets_subject_length;
alter table public.tickets
  add  constraint tickets_subject_length check (char_length(subject) between 1 and 120);

-- Verification
select 'subject constraints remaining' as label, count(*)::int as value
  from pg_constraint
 where conrelid = 'public.tickets'::regclass
   and contype  = 'c'
   and pg_get_constraintdef(oid) ilike '%subject%';
