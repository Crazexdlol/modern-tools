-- =========================================================================
-- Modern Tools — Messages on Claims migration (2026-08-26)
-- Run in the Supabase SQL Editor (Dashboard -> SQL Editor).
-- Spec: docs/superpowers/specs/2026-08-26-messages-design.md
-- =========================================================================

-- 1. messages table (append-only chat records per claim)
create table if not exists public.messages (
  id text primary key,
  claim_id text not null references public.acv_history(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete set null,
  sender_name text not null,
  recipient_ids uuid[] not null,
  recipient_names text[] not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists messages_claim_id_idx on public.messages(claim_id, created_at);
create index if not exists messages_recipient_gin on public.messages using gin(recipient_ids);

alter table public.messages enable row level security;

drop policy if exists messages_select on public.messages;
drop policy if exists messages_insert on public.messages;

-- SELECT: caller has access to the parent claim.
create policy messages_select on public.messages for select
  using (
    exists (
      select 1 from public.acv_history c
      where c.id = messages.claim_id
        and (public.is_admin() or c.assigned_to = auth.uid())
    )
  );

-- INSERT: same access + stamps self as sender.
create policy messages_insert on public.messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.acv_history c
      where c.id = messages.claim_id
        and (public.is_admin() or c.assigned_to = auth.uid())
    )
  );

-- No UPDATE or DELETE policies — append-only, default-deny.

-- 2. message_reads table (per-user, per-claim high-water-mark)
create table if not exists public.message_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  claim_id text not null references public.acv_history(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, claim_id)
);

alter table public.message_reads enable row level security;

drop policy if exists message_reads_self_all on public.message_reads;

create policy message_reads_self_all on public.message_reads for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 3. Verification query (inspect the returned rows manually)
select 'messages table exists' as label, count(*) as value
  from information_schema.tables where table_schema = 'public' and table_name = 'messages'
union all
select 'message_reads table exists', count(*)
  from information_schema.tables where table_schema = 'public' and table_name = 'message_reads'
union all
select 'messages policies', count(*) from pg_policies where schemaname = 'public' and tablename = 'messages'
union all
select 'message_reads policies', count(*) from pg_policies where schemaname = 'public' and tablename = 'message_reads';
