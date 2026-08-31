-- =========================================================================
-- Modern Tools — Per-user "Can edit claim information" permission (2026-08-26)
-- Run in the Supabase SQL Editor (Dashboard -> SQL Editor).
--
-- Adds a per-user permission that unlocks the Claim Info form for a
-- non-admin. Admins are always allowed. The form is otherwise read-only
-- (Handling Appraiser stays editable for anyone since it feeds downstream
-- tools like Award and Closing Notes).
-- =========================================================================

alter table public.profiles
  add column if not exists can_edit_claim_info boolean not null default false;

-- Verification
select 'profiles.can_edit_claim_info' as label,
       count(*) filter (where column_name = 'can_edit_claim_info') as value
  from information_schema.columns
  where table_schema = 'public' and table_name = 'profiles';
