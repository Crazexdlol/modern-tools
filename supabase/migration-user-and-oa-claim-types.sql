-- =========================================================================
-- HamsPortal — User claim-type assignment + tool access + OA claim types
-- (2026-10-10)
--
-- Three new columns:
--   • profiles.claim_types text[]            — which claim types this user
--                                               handles (ACV/DV/LOU/etc.).
--                                               Empty = handles everything
--                                               (back-compat for existing users).
--   • profiles.disabled_tools text[]          — tool codes HIDDEN for this
--                                               user in the claim workspace
--                                               tool tab bar (acv/dv/estimate/
--                                               storage/lou/award/notes/summary).
--                                               Empty = full access.
--   • opposing_appraisers.claim_types text[]  — same semantic as the profiles
--                                               column; used to drive the OA
--                                               picker filter + auto-add on
--                                               assignment.
--
-- Idempotent — safe to re-run. No data migration needed; all defaults are
-- empty arrays which existing code treats as "no restriction."
-- =========================================================================

alter table public.profiles
  add column if not exists claim_types text[] not null default array[]::text[],
  add column if not exists disabled_tools text[] not null default array[]::text[];

alter table public.opposing_appraisers
  add column if not exists claim_types text[] not null default array[]::text[];

-- Guard: appraisers cannot self-grant their own claim_types / disabled_tools
-- (they could otherwise unlock a tool their admin revoked by editing their
-- own profile). Extend the existing profiles row-level trigger if it exists;
-- new fields are added to its diff check.
--
-- Pattern mirrors migration-audit-trigger-hardening.sql (which already
-- blocks a batch of permission fields). We modify the function to add two
-- more field checks. If the function doesn't exist yet, the DO block is a
-- no-op; new installs pick up the hardened rules via the migration above.
do $$
begin
  if exists (select 1 from pg_proc where proname = 'profiles_role_guard') then
    create or replace function public.profiles_role_guard() returns trigger
    language plpgsql security definer set search_path = public as $f$
    begin
      if auth.role() = 'service_role' then return new; end if;
      if public.is_admin() then return new; end if;

      -- Original guards from migration-audit-trigger-hardening.sql.
      if coalesce((to_jsonb(new)->>'role'),                       '') is distinct from coalesce((to_jsonb(old)->>'role'),                       '') then raise exception 'not allowed to change role';                       end if;
      if coalesce((to_jsonb(new)->>'is_super_admin'),             '') is distinct from coalesce((to_jsonb(old)->>'is_super_admin'),             '') then raise exception 'not allowed to change is_super_admin';             end if;
      if coalesce((to_jsonb(new)->>'can_reassign_claims'),        '') is distinct from coalesce((to_jsonb(old)->>'can_reassign_claims'),        '') then raise exception 'not allowed to change can_reassign_claims';        end if;
      if coalesce((to_jsonb(new)->>'can_edit_claim_info'),        '') is distinct from coalesce((to_jsonb(old)->>'can_edit_claim_info'),        '') then raise exception 'not allowed to change can_edit_claim_info';        end if;
      if coalesce((to_jsonb(new)->>'can_create_claims'),          '') is distinct from coalesce((to_jsonb(old)->>'can_create_claims'),          '') then raise exception 'not allowed to change can_create_claims';          end if;
      if coalesce((to_jsonb(new)->>'marketing_access'),           '') is distinct from coalesce((to_jsonb(old)->>'marketing_access'),           '') then raise exception 'not allowed to change marketing_access';           end if;
      if coalesce((to_jsonb(new)->>'negotiations_access'),        '') is distinct from coalesce((to_jsonb(old)->>'negotiations_access'),        '') then raise exception 'not allowed to change negotiations_access';        end if;
      if coalesce((to_jsonb(new)->>'can_submit_without_handoff'), '') is distinct from coalesce((to_jsonb(old)->>'can_submit_without_handoff'), '') then raise exception 'not allowed to change can_submit_without_handoff'; end if;

      -- NEW: appraiser-adjacent capability lists are admin-only.
      if coalesce((to_jsonb(new)->>'claim_types'),    '') is distinct from coalesce((to_jsonb(old)->>'claim_types'),    '') then raise exception 'not allowed to change claim_types';    end if;
      if coalesce((to_jsonb(new)->>'disabled_tools'), '') is distinct from coalesce((to_jsonb(old)->>'disabled_tools'), '') then raise exception 'not allowed to change disabled_tools'; end if;

      return new;
    end;
    $f$;
  end if;
end $$;

-- Verification
select column_name, data_type, column_default
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'profiles'
   and column_name in ('claim_types','disabled_tools')
union all
select column_name, data_type, column_default
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'opposing_appraisers'
   and column_name = 'claim_types'
 order by column_name;
