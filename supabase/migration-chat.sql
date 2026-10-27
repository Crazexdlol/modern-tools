-- =========================================================================
-- Modern Tools - Chat system v1 (2026-10-27)
-- Run in the Supabase SQL Editor (Dashboard -> SQL Editor).
-- Spec: docs/superpowers/specs/2026-10-27-chat-system-v1-design.md
-- =========================================================================

-- 1. Tables
create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('direct', 'group')) default 'direct',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_conversation_members (
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  primary key (conversation_id, user_id)
);
create index if not exists chat_members_user_idx on public.chat_conversation_members(user_id);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete set null,
  body text not null default '',
  attachment_url text,
  attachment_name text,
  attachment_size integer,
  attachment_mime text,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_conv_time_idx on public.chat_messages(conversation_id, created_at);

create table if not exists public.chat_permissions (
  user_a_id uuid not null references auth.users(id) on delete cascade,
  user_b_id uuid not null references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id) on delete set null,
  primary key (user_a_id, user_b_id),
  check (user_a_id < user_b_id)
);

-- 2. RLS
alter table public.chat_conversations enable row level security;
alter table public.chat_conversation_members enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_permissions enable row level security;

drop policy if exists chat_conv_select on public.chat_conversations;
create policy chat_conv_select on public.chat_conversations for select
  using (
    exists (select 1 from public.chat_conversation_members m
            where m.conversation_id = chat_conversations.id and m.user_id = auth.uid())
  );

drop policy if exists chat_mem_select on public.chat_conversation_members;
create policy chat_mem_select on public.chat_conversation_members for select
  using (
    user_id = auth.uid()
    or exists (select 1 from public.chat_conversation_members m
               where m.conversation_id = chat_conversation_members.conversation_id
                 and m.user_id = auth.uid())
  );

drop policy if exists chat_mem_update_self on public.chat_conversation_members;
create policy chat_mem_update_self on public.chat_conversation_members for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists chat_msg_select on public.chat_messages;
create policy chat_msg_select on public.chat_messages for select
  using (
    exists (select 1 from public.chat_conversation_members m
            where m.conversation_id = chat_messages.conversation_id
              and m.user_id = auth.uid())
  );

drop policy if exists chat_msg_insert on public.chat_messages;
create policy chat_msg_insert on public.chat_messages for insert
  with check (
    sender_id = auth.uid()
    and exists (select 1 from public.chat_conversation_members m
                where m.conversation_id = chat_messages.conversation_id
                  and m.user_id = auth.uid())
  );

drop policy if exists chat_msg_update_own on public.chat_messages;
create policy chat_msg_update_own on public.chat_messages for update
  using (sender_id = auth.uid())
  with check (sender_id = auth.uid());

drop policy if exists chat_perm_select on public.chat_permissions;
create policy chat_perm_select on public.chat_permissions for select
  using (user_a_id = auth.uid() or user_b_id = auth.uid() or public.is_admin());

drop policy if exists chat_perm_admin_all on public.chat_permissions;
create policy chat_perm_admin_all on public.chat_permissions for all
  using (public.is_admin())
  with check (public.is_admin());

-- 3. Realtime publication: enable so clients can subscribe to new messages.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end $$;

-- 4. Verification
select 'chat_conversations' as label, count(*)::int as value
  from information_schema.tables where table_schema='public' and table_name='chat_conversations'
union all
select 'chat_conversation_members', count(*)::int
  from information_schema.tables where table_schema='public' and table_name='chat_conversation_members'
union all
select 'chat_messages', count(*)::int
  from information_schema.tables where table_schema='public' and table_name='chat_messages'
union all
select 'chat_permissions', count(*)::int
  from information_schema.tables where table_schema='public' and table_name='chat_permissions'
union all
select 'chat policies', count(*)::int from pg_policies
  where schemaname='public' and tablename in ('chat_conversations','chat_conversation_members','chat_messages','chat_permissions');
