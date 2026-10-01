-- =========================================================================
-- HamsPortal — Negotiations: new 'closed_claim' thread status (2026-10-01)
-- Threads linked to a claim whose status='closed' land here instead of
-- 'needs_response' / 'unmatched'. Keeps them out of triage without pretending
-- they're spam. Run in Supabase SQL Editor. Idempotent.
-- =========================================================================

-- 1. Relax the CHECK constraint on email_threads.status.
--    Drop every existing CHECK constraint on the status column (name was
--    auto-assigned by the original migration), then re-add with the new allow list.
do $$
declare
  cname text;
begin
  for cname in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    where t.relname = 'email_threads'
      and t.relnamespace = 'public'::regnamespace
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%status%'
  loop
    execute 'alter table public.email_threads drop constraint ' || quote_ident(cname);
  end loop;
end $$;

alter table public.email_threads
  add constraint email_threads_status_check
  check (status in ('needs_response', 'responded', 'ignored', 'spam', 'unmatched', 'closed_claim'));

-- 2. Update the counters RPC to include closed_claim.
create or replace function public.negotiations_counters()
returns table (
  needs_response  bigint,
  unmatched       bigint,
  spam            bigint,
  responded_today bigint,
  closed_claim    bigint
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.has_negotiations_access() then
    raise exception 'not allowed';
  end if;
  return query
  select
    count(*) filter (where status = 'needs_response')                                                   as needs_response,
    count(*) filter (where status = 'unmatched')                                                        as unmatched,
    count(*) filter (where status = 'spam')                                                             as spam,
    count(*) filter (where status = 'responded' and last_outbound_at >= (current_date)::timestamptz)    as responded_today,
    count(*) filter (where status = 'closed_claim')                                                     as closed_claim
  from public.email_threads;
end;
$$;

grant execute on function public.negotiations_counters() to authenticated;

-- 3. Verification (expect 1 for both rows).
select 'closed_claim allowed in check' as label,
  (select count(*)::int from pg_constraint c
   join pg_class t on t.oid = c.conrelid
   where t.relname = 'email_threads'
     and t.relnamespace = 'public'::regnamespace
     and c.contype = 'c'
     and pg_get_constraintdef(c.oid) ilike '%closed_claim%') as value
union all
select 'counters RPC has closed_claim column',
  (select count(*)::int from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='negotiations_counters'
     and pg_get_function_result(p.oid) ilike '%closed_claim%');
