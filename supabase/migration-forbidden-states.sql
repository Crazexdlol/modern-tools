-- =========================================================================
-- Modern Tools — Forbidden States migration (2026-08-29)
-- Run in the Supabase SQL Editor (Dashboard -> SQL Editor).
--
-- Extends licensed_states with a `forbidden` column. A forbidden state is
-- one Modern Appraisers cannot handle at all, regardless of licensing.
-- Seeds MA as forbidden.
--
-- Requires: supabase/migration-licensed-states.sql must have been run.
-- =========================================================================

alter table public.licensed_states
  add column if not exists forbidden boolean not null default false;

-- Seed Massachusetts as forbidden. Uses upsert so re-running is safe.
insert into public.licensed_states (state, required, forbidden, notes)
values ('MA', true, true, 'Modern Appraisers cannot handle Massachusetts claims — reassign or decline immediately.')
on conflict (state) do update
  set forbidden = true,
      notes = coalesce(public.licensed_states.notes, excluded.notes);

-- Verification
select 'licensed_states.forbidden' as label,
       count(*) filter (where column_name = 'forbidden')::int as value
  from information_schema.columns
  where table_schema = 'public' and table_name = 'licensed_states'
union all select 'MA forbidden = true', count(*)::int
  from public.licensed_states where state = 'MA' and forbidden = true;
