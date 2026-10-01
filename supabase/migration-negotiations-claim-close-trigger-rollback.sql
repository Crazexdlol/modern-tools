-- Rollback for migration-negotiations-claim-close-trigger.sql.
drop trigger if exists sync_threads_on_claim_status_change_trg on public.acv_history;
drop function if exists public.sync_threads_on_claim_status_change();
