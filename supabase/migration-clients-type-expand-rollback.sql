-- Rollback for migration-clients-type-expand.sql.
-- WARNING: this flips every 'tpa' and 'other' row back to 'adjuster'
-- because the pre-migration check constraint only allowed four codes. If
-- that mapping doesn't match what you actually had before, run a manual
-- re-type pass after this rollback.

begin;

-- 1. Collapse 'tpa' + 'other' back into 'adjuster' so the stricter check
--    constraint doesn't fail. Legacy 'other' rows lose their custom label
--    (type_custom column goes away below).
update public.clients
   set type = 'adjuster'
 where type in ('tpa', 'other');

-- 2. Restore the original check constraint.
alter table public.clients drop constraint if exists clients_type_check;
alter table public.clients
  add constraint clients_type_check
  check (type in ('adjuster', 'body_shop', 'attorney', 'insurance_company'));

-- 3. Drop the custom-label column.
alter table public.clients drop column if exists type_custom;

commit;
