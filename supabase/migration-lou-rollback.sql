-- Rollback: drops the lou column. Any saved LOU state is lost.
alter table public.acv_history
  drop column if exists lou;
