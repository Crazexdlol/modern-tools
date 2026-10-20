-- ============================================================
-- HamsPortal — Add 'referral' client type (2026-10-12)
-- Run in the Supabase SQL Editor.
-- Reverses with migration-clients-add-referral-rollback.sql.
--
-- Adds 'referral' to the clients.type check constraint so individuals /
-- businesses that refer work to Modern Appraisers (friends-of-shops,
-- 1099 referrers, etc.) can be tracked as distinct clients instead of
-- being lumped into 'other'.
--
-- Idempotent — safe to re-run.
-- ============================================================

begin;

alter table public.clients drop constraint if exists clients_type_check;

alter table public.clients
  add constraint clients_type_check
  check (type in ('tpa', 'body_shop', 'attorney', 'insurance_company', 'referral', 'other'));

commit;

-- Verification
select type, count(*)::int as row_count
  from public.clients
 group by type
 order by type;
