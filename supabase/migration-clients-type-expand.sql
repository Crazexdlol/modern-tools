-- ============================================================
-- HamsPortal — Clients type overhaul (2026-10-12)
-- Run in the Supabase SQL Editor.
-- Reverses with migration-clients-type-expand-rollback.sql.
--
-- Henry's new client-type taxonomy:
--   tpa                 - Third-party administrator (Sedgwick etc.)
--   insurance_company   - unchanged
--   attorney            - unchanged
--   body_shop           - unchanged
--   other               - freeform; label stored in type_custom
--
-- Legacy 'adjuster' rows get rolled into 'tpa' because every historical
-- "adjuster" client Henry was tracking was actually a TPA company (not
-- an individual adjuster). The 'adjuster' code is removed from the check
-- constraint so no new rows can use it.
--
-- Idempotent — safe to re-run.
-- ============================================================

begin;

-- 1. Add type_custom column. Used only when type='other' to store the
--    user-entered label for the custom type. Nullable; defaults null.
alter table public.clients
  add column if not exists type_custom text;

-- 2. Drop the OLD check constraint BEFORE the data migration. The old
--    constraint only allowed adjuster/body_shop/attorney/insurance_company,
--    so the UPDATE in step 3 would fail against it if we left it in place.
alter table public.clients drop constraint if exists clients_type_check;

-- 3. Migrate adjuster rows to tpa (now allowed — no check in effect).
update public.clients
   set type = 'tpa'
 where type = 'adjuster';

-- 4. Install the new check constraint with the current taxonomy.
alter table public.clients
  add constraint clients_type_check
  check (type in ('tpa', 'body_shop', 'attorney', 'insurance_company', 'other'));

commit;

-- Verification
select type, count(*)::int as row_count
  from public.clients
 group by type
 order by type;
