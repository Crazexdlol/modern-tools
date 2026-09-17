-- Undoes migration-star-claims.sql.
drop index if exists public.acv_history_starred_idx;
alter table public.acv_history drop column if exists starred;
