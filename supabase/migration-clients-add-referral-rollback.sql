-- ============================================================
-- Rollback for migration-clients-add-referral.sql.
-- Only safe to run after moving any existing 'referral' rows to a
-- different type — otherwise the new constraint will fail.
-- ============================================================

begin;

-- Fail loudly if any live rows would be orphaned by the rollback.
do $$
declare
  n int;
begin
  select count(*) into n from public.clients where type = 'referral';
  if n > 0 then
    raise exception 'Cannot roll back: % clients still have type=referral. Re-type them first.', n;
  end if;
end$$;

alter table public.clients drop constraint if exists clients_type_check;

alter table public.clients
  add constraint clients_type_check
  check (type in ('tpa', 'body_shop', 'attorney', 'insurance_company', 'other'));

commit;
