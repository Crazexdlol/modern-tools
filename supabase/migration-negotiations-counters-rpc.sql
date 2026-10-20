-- =========================================================================
-- HamsPortal — Negotiations counters RPC (2026-09-18)
-- Collapses the 4 parallel count queries the /api/negotiations/threads route
-- was firing into ONE round trip. security-definer + RLS-check-inside so it's
-- still gated to Henry.
-- Idempotent — safe to re-run.
-- =========================================================================

create or replace function public.negotiations_counters()
returns table (
  needs_response  bigint,
  unmatched       bigint,
  spam            bigint,
  responded_today bigint
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.has_negotiations_access() then
    raise exception 'not allowed';
  end if;
  return query
  select
    count(*) filter (where status = 'needs_response')                                                            as needs_response,
    count(*) filter (where status = 'unmatched')                                                                 as unmatched,
    count(*) filter (where status = 'spam')                                                                      as spam,
    count(*) filter (where status = 'responded' and last_outbound_at >= (current_date)::timestamptz)             as responded_today
  from public.email_threads;
end;
$$;

grant execute on function public.negotiations_counters() to authenticated;
