-- =========================================================================
-- HamsPortal — Auto-flip linked threads when a claim closes/reopens (2026-10-01)
-- When acv_history.status transitions:
--   open  → closed : flip linked email_threads (needs_response/responded/unmatched)
--                    into 'closed_claim' so they drop out of triage.
--   closed → open  : flip 'closed_claim' threads back; responded if the last
--                    message was outbound, else needs_response.
-- Idempotent. Run in Supabase SQL Editor.
-- =========================================================================

create or replace function public.sync_threads_on_claim_status_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if NEW.status is distinct from OLD.status then
    if NEW.status = 'closed' then
      update public.email_threads t
         set status = 'closed_claim'
       where t.status in ('needs_response', 'responded', 'unmatched')
         and t.id in (
           select nc.thread_id from public.negotiation_cases nc where nc.claim_id = NEW.id
         );
    elsif OLD.status = 'closed' and NEW.status = 'open' then
      update public.email_threads t
         set status = case
           when t.last_outbound_at is not null
                and (t.last_inbound_at is null or t.last_outbound_at >= t.last_inbound_at)
             then 'responded'
           else 'needs_response'
         end
       where t.status = 'closed_claim'
         and t.id in (
           select nc.thread_id from public.negotiation_cases nc where nc.claim_id = NEW.id
         );
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists sync_threads_on_claim_status_change_trg on public.acv_history;
create trigger sync_threads_on_claim_status_change_trg
  after update of status on public.acv_history
  for each row
  execute function public.sync_threads_on_claim_status_change();

-- Verification: trigger exists.
select 'trigger present' as label,
  (select count(*)::int from pg_trigger where tgname = 'sync_threads_on_claim_status_change_trg' and not tgisinternal) as value;
