-- Rollback: drop the trigger + function. Does NOT un-reassign the user_id
-- values on already-closed rows (that would require remembering the
-- original creator per row, which we don't store). If you need to revert
-- ownership on specific closed claims, do that manually with an UPDATE.
drop trigger if exists transfer_ownership_on_close on public.acv_history;
drop function if exists public.transfer_closed_claim_ownership();
