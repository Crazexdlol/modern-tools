-- =========================================================================
-- Modern Tools — Handling-appraiser list flag (2026-09-11)
-- Run in the Supabase SQL Editor (Dashboard -> SQL Editor).
-- Spec: docs/superpowers/specs/2026-09-11-csv-sync-and-handling-appraiser-list-design.md
-- Reverses cleanly with migration-handling-appraiser-flag-rollback.sql.
--
-- What this does:
--
--  1. Adds profiles.show_in_handling_appraiser_list (bool, default true).
--     Controls whether the profile appears in the Claim Info "Handling
--     Appraiser" <select>. Independent from role and is_active — a profile
--     with show_in_handling_appraiser_list=false is still fully assignable
--     via the reassign / bulk-reassign UI, they just don't appear in the
--     handling-appraiser dropdown that populates claim.handlingAppraiser
--     (the name printed on the assignment sheet / ACV signature block).
--
--  2. Sets the flag to false for Arthur Aleksanyan, Wendy Castro, and Maeli
--     Sotelo (by profile id, hardcoded from prod query on 2026-09-11 —
--     using id rather than name so a future rename doesn't undo this).
--
--  3. Renames profile "Vahan Zurnachnyan" -> "Vahan Zurnachyan" so the
--     upcoming CSV sync's name-based appraiser match resolves the 11 claims
--     that would otherwise land as unassigned.
--
--  4. Extends the existing profiles_role_guard trigger to cover the new
--     column (admin/service-role only). Matches the shape used in
--     migration-audit-trigger-hardening.sql (Batch B S6, already run).
-- =========================================================================

-- 1. Column.
alter table public.profiles
  add column if not exists show_in_handling_appraiser_list boolean not null default true;

-- 2. Turn OFF for the three profiles Henry called out. Idempotent — safe to re-run.
update public.profiles
   set show_in_handling_appraiser_list = false,
       updated_at = now()
 where id in (
   'e3a1fe04-1601-42e0-9e94-3a87a0a8db58',  -- Arthur Aleksanyan
   '3e35c7be-918d-4685-bfc3-fc1308a8cb75',  -- Wendy Castro
   '7ca0c7ab-1520-42a3-8138-c62d2fc5bc64'   -- Maeli Sotelo
 );

-- 3. Rename Vahan's profile so CSV name-matching resolves his 11 rows.
update public.profiles
   set name = 'Vahan Zurnachyan',
       updated_at = now()
 where id = '085f94af-1584-4bfa-8d07-bf71d9bf5028'
   and name = 'Vahan Zurnachnyan';

-- 4. Extend profiles_role_guard to cover show_in_handling_appraiser_list.
--    Same idempotent to_jsonb pattern as the audit-trigger-hardening migration,
--    so the guard doesn't fail if a column is later removed.
create or replace function public.profiles_role_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'service_role' then return new; end if;
  if public.is_admin() then return new; end if;
  if new.role  is distinct from old.role  then raise exception 'not allowed to change role'; end if;
  if new.email is distinct from old.email then raise exception 'not allowed to change email'; end if;
  if coalesce((to_jsonb(new)->>'can_reassign_claims'),      '') is distinct from coalesce((to_jsonb(old)->>'can_reassign_claims'),      '') then raise exception 'not allowed to change can_reassign_claims';      end if;
  if coalesce((to_jsonb(new)->>'can_edit_claim_info'),      '') is distinct from coalesce((to_jsonb(old)->>'can_edit_claim_info'),      '') then raise exception 'not allowed to change can_edit_claim_info';      end if;
  if coalesce((to_jsonb(new)->>'can_create_claims'),        '') is distinct from coalesce((to_jsonb(old)->>'can_create_claims'),        '') then raise exception 'not allowed to change can_create_claims';        end if;
  if coalesce((to_jsonb(new)->>'auto_status_requests_override'), '') is distinct from coalesce((to_jsonb(old)->>'auto_status_requests_override'), '') then raise exception 'not allowed to change auto_status_requests_override'; end if;
  if coalesce((to_jsonb(new)->>'is_active'),                '') is distinct from coalesce((to_jsonb(old)->>'is_active'),                '') then raise exception 'not allowed to change is_active';                end if;
  if coalesce((to_jsonb(new)->>'show_in_handling_appraiser_list'), '') is distinct from coalesce((to_jsonb(old)->>'show_in_handling_appraiser_list'), '') then raise exception 'not allowed to change show_in_handling_appraiser_list'; end if;
  return new;
end;
$$;

-- 5. Verification (informational — inspect the returned rows manually).
select 'show_in_handling_appraiser_list column exists' as label,
       count(*) as value
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'profiles'
   and column_name = 'show_in_handling_appraiser_list'
union all
select 'profiles hidden from handling-appraiser list' as label,
       count(*) as value
  from public.profiles
 where show_in_handling_appraiser_list = false
union all
select 'Vahan renamed' as label,
       count(*) as value
  from public.profiles
 where id = '085f94af-1584-4bfa-8d07-bf71d9bf5028'
   and name = 'Vahan Zurnachyan';

-- Expected values: 1, 3, 1.
