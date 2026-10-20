-- Rollback — drops the three new columns and (if the hardened profiles_role_guard
-- exists) restores the version WITHOUT the new field checks.
alter table public.profiles
  drop column if exists claim_types,
  drop column if exists disabled_tools;

alter table public.opposing_appraisers
  drop column if exists claim_types;

do $$
begin
  if exists (select 1 from pg_proc where proname = 'profiles_role_guard') then
    create or replace function public.profiles_role_guard() returns trigger
    language plpgsql security definer set search_path = public as $f$
    begin
      if auth.role() = 'service_role' then return new; end if;
      if public.is_admin() then return new; end if;

      if coalesce((to_jsonb(new)->>'role'),                       '') is distinct from coalesce((to_jsonb(old)->>'role'),                       '') then raise exception 'not allowed to change role';                       end if;
      if coalesce((to_jsonb(new)->>'is_super_admin'),             '') is distinct from coalesce((to_jsonb(old)->>'is_super_admin'),             '') then raise exception 'not allowed to change is_super_admin';             end if;
      if coalesce((to_jsonb(new)->>'can_reassign_claims'),        '') is distinct from coalesce((to_jsonb(old)->>'can_reassign_claims'),        '') then raise exception 'not allowed to change can_reassign_claims';        end if;
      if coalesce((to_jsonb(new)->>'can_edit_claim_info'),        '') is distinct from coalesce((to_jsonb(old)->>'can_edit_claim_info'),        '') then raise exception 'not allowed to change can_edit_claim_info';        end if;
      if coalesce((to_jsonb(new)->>'can_create_claims'),          '') is distinct from coalesce((to_jsonb(old)->>'can_create_claims'),          '') then raise exception 'not allowed to change can_create_claims';          end if;
      if coalesce((to_jsonb(new)->>'marketing_access'),           '') is distinct from coalesce((to_jsonb(old)->>'marketing_access'),           '') then raise exception 'not allowed to change marketing_access';           end if;
      if coalesce((to_jsonb(new)->>'negotiations_access'),        '') is distinct from coalesce((to_jsonb(old)->>'negotiations_access'),        '') then raise exception 'not allowed to change negotiations_access';        end if;
      if coalesce((to_jsonb(new)->>'can_submit_without_handoff'), '') is distinct from coalesce((to_jsonb(old)->>'can_submit_without_handoff'), '') then raise exception 'not allowed to change can_submit_without_handoff'; end if;

      return new;
    end;
    $f$;
  end if;
end $$;
