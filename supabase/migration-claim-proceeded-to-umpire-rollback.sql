-- Rollback: drop umpire tracking columns
drop index if exists public.acv_history_proceeded_to_umpire_idx;
alter table public.acv_history drop column if exists umpire_agreement;
alter table public.acv_history drop column if exists proceeded_to_umpire;
