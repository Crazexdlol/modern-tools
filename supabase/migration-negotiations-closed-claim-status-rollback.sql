-- Rollback for migration-negotiations-closed-claim-status.sql.
-- Reverts the CHECK constraint to the original 5 values and the RPC to its
-- pre-closed_claim shape. Any rows with status='closed_claim' are coerced
-- back to 'ignored' first (safest neutral status that already exists).

update public.email_threads
   set status = 'ignored'
 where status = 'closed_claim';

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
  check (status in ('needs_response', 'responded', 'ignored', 'spam', 'unmatched'));

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
