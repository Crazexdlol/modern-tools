-- =========================================================================
-- HamsPortal — Negotiations tab rollback (reverses migration-negotiations.sql)
-- Run in the Supabase SQL Editor.
--
-- Drops in reverse dependency order. Restores profiles_role_guard to the
-- pre-negotiations shape (still guards marketing_access — matches the state
-- established by migration-marketing.sql).
-- =========================================================================

-- 1. Storage policies + bucket.
drop policy if exists "negotiation attachments read"   on storage.objects;
drop policy if exists "negotiation attachments write"  on storage.objects;
drop policy if exists "negotiation attachments update" on storage.objects;
drop policy if exists "negotiation attachments delete" on storage.objects;

delete from storage.objects where bucket_id = 'negotiation-attachments';
delete from storage.buckets where id = 'negotiation-attachments';

-- 2. Tables (order respects FK dependencies).
drop table if exists public.negotiation_drafts   cascade;
drop table if exists public.negotiation_config   cascade;
drop table if exists public.marketcheck_pulls    cascade;
drop table if exists public.valuation_ledgers    cascade;
drop table if exists public.oa_claim_history     cascade;
drop table if exists public.email_attachments    cascade;
drop table if exists public.email_messages       cascade;

-- email_threads FKs negotiation_cases; drop the constraint first, then both.
alter table if exists public.email_threads
  drop constraint if exists email_threads_negotiation_case_id_fkey;
drop table if exists public.negotiation_cases    cascade;
drop table if exists public.email_threads        cascade;

drop table if exists public.imap_sync_state      cascade;

-- 3. Helper function.
drop function if exists public.has_negotiations_access();

-- 4. Restore profiles_role_guard to the marketing-era shape (no negotiations
--    line). Matches migration-marketing.sql:34-56 verbatim.
create or replace function public.profiles_role_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() <> 'service_role' then
    if coalesce((to_jsonb(new)->>'is_super_admin'), '') is distinct from coalesce((to_jsonb(old)->>'is_super_admin'), '') then
      raise exception 'not allowed to change is_super_admin';
    end if;
  end if;
  if auth.role() = 'service_role' then return new; end if;
  if public.is_admin() then return new; end if;
  if new.role  is distinct from old.role  then raise exception 'not allowed to change role'; end if;
  if new.email is distinct from old.email then raise exception 'not allowed to change email'; end if;
  if coalesce((to_jsonb(new)->>'can_reassign_claims'),           '') is distinct from coalesce((to_jsonb(old)->>'can_reassign_claims'),           '') then raise exception 'not allowed to change can_reassign_claims';           end if;
  if coalesce((to_jsonb(new)->>'can_edit_claim_info'),           '') is distinct from coalesce((to_jsonb(old)->>'can_edit_claim_info'),           '') then raise exception 'not allowed to change can_edit_claim_info';           end if;
  if coalesce((to_jsonb(new)->>'can_create_claims'),             '') is distinct from coalesce((to_jsonb(old)->>'can_create_claims'),             '') then raise exception 'not allowed to change can_create_claims';             end if;
  if coalesce((to_jsonb(new)->>'auto_status_requests_override'), '') is distinct from coalesce((to_jsonb(old)->>'auto_status_requests_override'), '') then raise exception 'not allowed to change auto_status_requests_override'; end if;
  if coalesce((to_jsonb(new)->>'is_active'),                     '') is distinct from coalesce((to_jsonb(old)->>'is_active'),                     '') then raise exception 'not allowed to change is_active';                     end if;
  if coalesce((to_jsonb(new)->>'show_in_handling_appraiser_list'), '') is distinct from coalesce((to_jsonb(old)->>'show_in_handling_appraiser_list'), '') then raise exception 'not allowed to change show_in_handling_appraiser_list'; end if;
  if coalesce((to_jsonb(new)->>'marketing_access'),              '') is distinct from coalesce((to_jsonb(old)->>'marketing_access'),              '') then raise exception 'not allowed to change marketing_access';              end if;
  return new;
end;
$$;

-- 5. Drop the profiles.negotiations_access column.
alter table public.profiles drop column if exists negotiations_access;
