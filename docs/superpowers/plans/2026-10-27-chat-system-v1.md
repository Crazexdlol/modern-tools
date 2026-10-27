# Chat system (v1 — 1:1 only) implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 1:1 user-to-user chat with symmetric permission matrix, admin override, side-sheet UI from the app header, hybrid realtime, push notifications, 10 MB attachments, edit/soft-delete own messages, and typing indicators. Group chat deferred to v2.

**Architecture:** Four new SQL tables (`chat_conversations`, `chat_conversation_members`, `chat_messages`, `chat_permissions`) plus a private storage bucket `chat-attachments`. All isolated from the existing claim-scoped `messages` table. Thin client libs in `src/lib/chat/`. API routes under `src/app/api/chat/*` and `src/app/api/admin/chat-permissions/*`. UI as a composable set of components under `src/components/chat/`. Admin matrix at `/admin/settings/chat-permissions`. Every API catches `42P01` (undefined_table) and returns `{ migrationPending: true }` so the UI renders disabled states if the SQL hasn't been applied yet.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind v4, Supabase (auth + Postgres + realtime + storage), `web-push` (already wired via `src/lib/reminders/push.ts`), lucide-react icons.

**Testing note:** HamsPortal has no automated test framework. Verification is `npx tsc --noEmit` + `npm run build` + manual round-trip in the browser against prod data.

**Spec:** `docs/superpowers/specs/2026-10-27-chat-system-v1-design.md`

---

## File map

### New SQL

- `supabase/migration-chat.sql` — tables, indexes, RLS, realtime publication
- `supabase/migration-chat-rollback.sql`
- `supabase/migration-chat-storage.sql` — `chat-attachments` bucket + storage policies
- `supabase/migration-chat-storage-rollback.sql`

### New TS lib

- `src/lib/chat/types.ts`
- `src/lib/chat/push.ts` (server)
- `src/lib/chat/api.ts` (browser)
- `src/lib/chat/realtime.ts` (browser)
- `src/lib/chat/missing-table.ts` (shared 42P01 helper)

### New API routes

- `src/app/api/chat/contacts/route.ts`
- `src/app/api/chat/conversations/route.ts` (GET list + POST create)
- `src/app/api/chat/conversations/[id]/messages/route.ts` (GET)
- `src/app/api/chat/send/route.ts` (POST)
- `src/app/api/chat/messages/[id]/route.ts` (PATCH + DELETE)
- `src/app/api/chat/mark-read/route.ts` (POST)
- `src/app/api/chat/unread-count/route.ts` (GET)
- `src/app/api/chat/upload-url/route.ts` (POST)
- `src/app/api/admin/chat-permissions/route.ts` (GET + POST)

### New UI components

- `src/components/chat/chat-header-button.tsx`
- `src/components/chat/chat-panel.tsx` (orchestrator)
- `src/components/chat/chat-conversation-list.tsx`
- `src/components/chat/chat-new-conversation.tsx`
- `src/components/chat/chat-thread-view.tsx`
- `src/components/chat/chat-composer.tsx`
- `src/components/chat/chat-message-row.tsx`

### New admin page

- `src/app/admin/settings/chat-permissions/page.tsx`
- `src/app/admin/settings/chat-permissions/chat-permissions-client.tsx`

### Modified files

- `src/components/app-header.tsx` — mount `<ChatHeaderButton />` next to `<RemindersHeaderButton />`
- `src/app/admin/settings/_settings-nav.tsx` — nav link for the matrix page
- `public/sw.js` — click-handler recognizes `?chat=<id>` deep link

---

### Task 1: SQL migrations

**Files:**
- Create: `supabase/migration-chat.sql`
- Create: `supabase/migration-chat-rollback.sql`
- Create: `supabase/migration-chat-storage.sql`
- Create: `supabase/migration-chat-storage-rollback.sql`

- [ ] **Step 1: Write `supabase/migration-chat.sql`**

```sql
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
```

- [ ] **Step 2: Write `supabase/migration-chat-rollback.sql`**

```sql
-- Rollback for migration-chat.sql.
-- Drops all chat tables; all stored chats are lost.
alter publication supabase_realtime drop table if exists public.chat_messages;
drop table if exists public.chat_messages cascade;
drop table if exists public.chat_conversation_members cascade;
drop table if exists public.chat_conversations cascade;
drop table if exists public.chat_permissions cascade;
```

- [ ] **Step 3: Write `supabase/migration-chat-storage.sql`**

```sql
-- Creates the private chat-attachments bucket and its storage policies.
-- Run after migration-chat.sql.

insert into storage.buckets (id, name, public)
  values ('chat-attachments', 'chat-attachments', false)
  on conflict (id) do nothing;

-- A storage path's first folder segment is the conversation_id. Membership
-- check uses chat_conversation_members.
drop policy if exists chat_attachments_select on storage.objects;
create policy chat_attachments_select on storage.objects for select to authenticated
  using (
    bucket_id = 'chat-attachments'
    and exists (
      select 1 from public.chat_conversation_members m
      where m.user_id = auth.uid()
        and m.conversation_id::text = split_part(name, '/', 1)
    )
  );

drop policy if exists chat_attachments_insert on storage.objects;
create policy chat_attachments_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-attachments'
    and exists (
      select 1 from public.chat_conversation_members m
      where m.user_id = auth.uid()
        and m.conversation_id::text = split_part(name, '/', 1)
    )
  );

-- Updates/deletes: only the uploader (owner column).
drop policy if exists chat_attachments_update_own on storage.objects;
create policy chat_attachments_update_own on storage.objects for update to authenticated
  using (bucket_id = 'chat-attachments' and owner = auth.uid())
  with check (bucket_id = 'chat-attachments' and owner = auth.uid());

drop policy if exists chat_attachments_delete_own on storage.objects;
create policy chat_attachments_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'chat-attachments' and owner = auth.uid());

select 'chat-attachments bucket' as label, count(*)::int as value
  from storage.buckets where id = 'chat-attachments';
```

- [ ] **Step 4: Write `supabase/migration-chat-storage-rollback.sql`**

```sql
-- Rollback for migration-chat-storage.sql.
drop policy if exists chat_attachments_select on storage.objects;
drop policy if exists chat_attachments_insert on storage.objects;
drop policy if exists chat_attachments_update_own on storage.objects;
drop policy if exists chat_attachments_delete_own on storage.objects;
delete from storage.buckets where id = 'chat-attachments';
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migration-chat.sql supabase/migration-chat-rollback.sql \
        supabase/migration-chat-storage.sql supabase/migration-chat-storage-rollback.sql
git commit -m "feat(chat): migrations + rollbacks"
```

---

### Task 2: Shared types + 42P01 helper + push helper

**Files:**
- Create: `src/lib/chat/types.ts`
- Create: `src/lib/chat/missing-table.ts`
- Create: `src/lib/chat/push.ts`

- [ ] **Step 1: Write `src/lib/chat/types.ts`**

```ts
export interface ChatConversation {
  id: string
  type: 'direct' | 'group'
  createdAt: string
  updatedAt: string
}

export interface ChatMember {
  conversationId: string
  userId: string
  joinedAt: string
  lastReadAt: string | null
}

export interface ChatMessage {
  id: string
  conversationId: string
  senderId: string | null
  body: string
  attachmentUrl: string | null
  attachmentName: string | null
  attachmentSize: number | null
  attachmentMime: string | null
  editedAt: string | null
  deletedAt: string | null
  createdAt: string
}

export interface ChatContact {
  id: string         // auth user id
  name: string
  email: string
  role: 'admin' | 'appraiser' | string
}

// Conversation list row shown in the panel: counterpart + last message + unread.
export interface ChatConversationListRow {
  conversation: ChatConversation
  counterpart: ChatContact | null
  lastMessage: ChatMessage | null
  unread: number
}

export interface ChatPermissionRow {
  userAId: string
  userBId: string
}

// Canonicalize an unordered pair to (lower, higher) so lookups and inserts
// always find the same row.
export function canonicalPair(a: string, b: string): { userAId: string; userBId: string } {
  return a < b ? { userAId: a, userBId: b } : { userAId: b, userBId: a }
}

export const CHAT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024 // 10 MB
```

- [ ] **Step 2: Write `src/lib/chat/missing-table.ts`**

```ts
// Postgres error code 42P01 = undefined_table. Returned when the chat tables
// haven't been migrated yet. Every chat API path checks for this and returns
// { migrationPending: true } instead of 500ing.
export function isMissingTable(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const code = (err as { code?: string }).code
  return code === '42P01'
}

export interface MigrationPendingResponse {
  migrationPending: true
}
```

- [ ] **Step 3: Write `src/lib/chat/push.ts`**

```ts
import { createClient } from '@supabase/supabase-js'
import { sendPush } from '@/lib/reminders/push'

// Server-only: dispatches a chat push to every push_subscription row for a
// given user. Uses the service-role client because push_subscriptions is RLS'd
// to the subscription owner and we're sending FROM one user TO another.
export async function sendChatPush(args: {
  recipientUserId: string
  conversationId: string
  senderName: string
  preview: string
}): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

  const { data: subs, error } = await admin
    .from('push_subscriptions')
    .select('id,endpoint,p256dh,auth')
    .eq('user_id', args.recipientUserId)
  if (error || !subs || subs.length === 0) return

  const payload = {
    title: `New message from ${args.senderName}`,
    body: args.preview.slice(0, 80),
    url: `/?chat=${encodeURIComponent(args.conversationId)}`,
    icon: '/icon.png',
    tag: `chat:${args.conversationId}`,
  }

  const prunable: string[] = []
  await Promise.all(subs.map(async (s) => {
    const r = await sendPush({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth }, payload)
    if (r.shouldPrune) prunable.push(s.id as string)
  }))
  if (prunable.length) {
    await admin.from('push_subscriptions').delete().in('id', prunable)
  }
}
```

- [ ] **Step 4: Verify compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/chat/
git commit -m "feat(chat): shared types + 42P01 helper + chat push dispatcher"
```

---

### Task 3: `/api/chat/contacts` — "who can I chat with"

**Files:**
- Create: `src/app/api/chat/contacts/route.ts`

- [ ] **Step 1: Write the route**

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isMissingTable } from '@/lib/chat/missing-table'
import type { ChatContact } from '@/lib/chat/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Admin bypass: return every active profile except self.
  const { data: me } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  const isAdmin = me?.role === 'admin'

  if (isAdmin) {
    const { data } = await supabase
      .from('profiles').select('id,name,email,role').neq('id', user.id)
      .order('name', { ascending: true })
    return NextResponse.json({ contacts: (data ?? []) as ChatContact[] })
  }

  // Appraiser: permitted partners (symmetric) + every admin.
  const { data: perms, error: pErr } = await supabase
    .from('chat_permissions').select('user_a_id,user_b_id')
  if (pErr && isMissingTable(pErr)) {
    return NextResponse.json({ contacts: [], migrationPending: true })
  }
  const partnerIds = new Set<string>()
  for (const r of (perms ?? [])) {
    if (r.user_a_id === user.id) partnerIds.add(r.user_b_id as string)
    else if (r.user_b_id === user.id) partnerIds.add(r.user_a_id as string)
  }

  const { data: admins } = await supabase
    .from('profiles').select('id,name,email,role').eq('role', 'admin').neq('id', user.id)
  for (const a of (admins ?? [])) partnerIds.add(a.id as string)

  if (partnerIds.size === 0) return NextResponse.json({ contacts: [] })
  const { data } = await supabase
    .from('profiles').select('id,name,email,role')
    .in('id', Array.from(partnerIds)).order('name', { ascending: true })
  return NextResponse.json({ contacts: (data ?? []) as ChatContact[] })
}
```

- [ ] **Step 2: Verify compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/chat/contacts/route.ts
git commit -m "feat(chat): /api/chat/contacts"
```

---

### Task 4: `/api/chat/conversations` — list + create

**Files:**
- Create: `src/app/api/chat/conversations/route.ts`

- [ ] **Step 1: Write the route**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createService } from '@supabase/supabase-js'
import { isMissingTable } from '@/lib/chat/missing-table'
import { canonicalPair } from '@/lib/chat/types'

export const dynamic = 'force-dynamic'

// GET: list my conversations w/ counterpart + last message + unread count.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: mine, error } = await supabase
    .from('chat_conversation_members')
    .select('conversation_id,last_read_at')
    .eq('user_id', user.id)
  if (error && isMissingTable(error)) {
    return NextResponse.json({ conversations: [], migrationPending: true })
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ids = (mine ?? []).map(r => r.conversation_id as string)
  if (ids.length === 0) return NextResponse.json({ conversations: [] })

  const [convsRes, membersRes, msgsRes] = await Promise.all([
    supabase.from('chat_conversations').select('*').in('id', ids),
    supabase.from('chat_conversation_members').select('conversation_id,user_id').in('conversation_id', ids),
    supabase.from('chat_messages').select('*').in('conversation_id', ids).order('created_at', { ascending: false }),
  ])

  // Build last-message-per-conv and other-member-per-conv maps.
  const lastByConv = new Map<string, {
    id: string; conversation_id: string; sender_id: string | null; body: string;
    attachment_url: string | null; attachment_name: string | null;
    attachment_size: number | null; attachment_mime: string | null;
    edited_at: string | null; deleted_at: string | null; created_at: string;
  }>()
  for (const m of (msgsRes.data ?? []) as Array<{ id: string; conversation_id: string; sender_id: string | null; body: string; attachment_url: string | null; attachment_name: string | null; attachment_size: number | null; attachment_mime: string | null; edited_at: string | null; deleted_at: string | null; created_at: string }>) {
    if (!lastByConv.has(m.conversation_id)) lastByConv.set(m.conversation_id, m)
  }

  const otherByConv = new Map<string, string>()
  for (const row of ((membersRes.data ?? []) as Array<{ conversation_id: string; user_id: string }>)) {
    if (row.user_id !== user.id) otherByConv.set(row.conversation_id, row.user_id)
  }

  const otherIds = Array.from(new Set(Array.from(otherByConv.values())))
  const profilesRes = otherIds.length
    ? await supabase.from('profiles').select('id,name,email,role').in('id', otherIds)
    : { data: [] as Array<{ id: string; name: string; email: string; role: string }> }

  const profById = new Map<string, { id: string; name: string; email: string; role: string }>()
  for (const p of (profilesRes.data ?? [])) profById.set(p.id, p)

  const lastReadByConv = new Map<string, string | null>()
  for (const r of (mine ?? [])) lastReadByConv.set(r.conversation_id as string, (r.last_read_at as string | null) ?? null)

  const unreadCounts = new Map<string, number>()
  for (const m of (msgsRes.data ?? []) as Array<{ conversation_id: string; sender_id: string | null; created_at: string }>) {
    const lastRead = lastReadByConv.get(m.conversation_id)
    const isUnread = (!lastRead || m.created_at > lastRead) && m.sender_id !== user.id
    if (isUnread) unreadCounts.set(m.conversation_id, (unreadCounts.get(m.conversation_id) ?? 0) + 1)
  }

  const result = (convsRes.data ?? [])
    .map((c) => {
      const cv = c as { id: string; type: 'direct' | 'group'; created_at: string; updated_at: string }
      const otherId = otherByConv.get(cv.id) ?? null
      const prof = otherId ? profById.get(otherId) ?? null : null
      const lm = lastByConv.get(cv.id) ?? null
      return {
        conversation: { id: cv.id, type: cv.type, createdAt: cv.created_at, updatedAt: cv.updated_at },
        counterpart: prof ? { id: prof.id, name: prof.name, email: prof.email, role: prof.role } : null,
        lastMessage: lm ? {
          id: lm.id, conversationId: lm.conversation_id, senderId: lm.sender_id,
          body: lm.body, attachmentUrl: lm.attachment_url, attachmentName: lm.attachment_name,
          attachmentSize: lm.attachment_size, attachmentMime: lm.attachment_mime,
          editedAt: lm.edited_at, deletedAt: lm.deleted_at, createdAt: lm.created_at,
        } : null,
        unread: unreadCounts.get(cv.id) ?? 0,
      }
    })
    .sort((a, b) => (b.conversation.updatedAt).localeCompare(a.conversation.updatedAt))

  return NextResponse.json({ conversations: result })
}

// POST: idempotently return or create a direct conversation with another user.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { otherUserId?: string } | null
  if (!body?.otherUserId) return NextResponse.json({ error: 'otherUserId required' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (body.otherUserId === user.id) return NextResponse.json({ error: 'self-chat not allowed' }, { status: 400 })

  // Permission gate: caller is admin OR other is admin OR permission row exists.
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  const { data: other } = await supabase.from('profiles').select('id,role').eq('id', body.otherUserId).maybeSingle()
  if (!other) return NextResponse.json({ error: 'other user not found' }, { status: 404 })
  const callerIsAdmin = me?.role === 'admin'
  const otherIsAdmin = other.role === 'admin'
  const { userAId, userBId } = canonicalPair(user.id, body.otherUserId)
  const { data: permRow, error: permErr } = await supabase
    .from('chat_permissions').select('user_a_id,user_b_id')
    .eq('user_a_id', userAId).eq('user_b_id', userBId).maybeSingle()
  if (permErr && isMissingTable(permErr)) {
    return NextResponse.json({ migrationPending: true }, { status: 503 })
  }
  const allowed = callerIsAdmin || otherIsAdmin || !!permRow
  if (!allowed) return NextResponse.json({ error: 'not permitted' }, { status: 403 })

  // Look for existing direct conversation with exactly these two members.
  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceUrl || !serviceKey) return NextResponse.json({ error: 'server misconfigured' }, { status: 500 })
  const admin = createService(serviceUrl, serviceKey, { auth: { persistSession: false } })

  const { data: existingCands } = await admin
    .from('chat_conversation_members')
    .select('conversation_id,user_id')
    .in('user_id', [user.id, body.otherUserId])

  // Find a conversation_id that appears for BOTH users AND has type='direct'
  // AND has exactly 2 members total.
  const byConv = new Map<string, Set<string>>()
  for (const r of (existingCands ?? []) as Array<{ conversation_id: string; user_id: string }>) {
    const s = byConv.get(r.conversation_id) ?? new Set<string>()
    s.add(r.user_id)
    byConv.set(r.conversation_id, s)
  }
  const sharedIds = Array.from(byConv.entries())
    .filter(([, s]) => s.has(user.id) && s.has(body.otherUserId!))
    .map(([id]) => id)
  if (sharedIds.length > 0) {
    const { data: convs } = await admin
      .from('chat_conversations').select('id,type,created_at,updated_at')
      .in('id', sharedIds).eq('type', 'direct')
    for (const c of (convs ?? []) as Array<{ id: string; type: string; created_at: string; updated_at: string }>) {
      // Ensure exactly 2 members
      const members = byConv.get(c.id)
      if (members && members.size === 2) {
        return NextResponse.json({
          conversation: { id: c.id, type: 'direct' as const, createdAt: c.created_at, updatedAt: c.updated_at },
          created: false,
        })
      }
    }
  }

  // Create.
  const { data: conv, error: cErr } = await admin
    .from('chat_conversations').insert({ type: 'direct' }).select().single()
  if (cErr || !conv) return NextResponse.json({ error: cErr?.message ?? 'create failed' }, { status: 500 })
  const convId = (conv as { id: string }).id
  const { error: mErr } = await admin.from('chat_conversation_members').insert([
    { conversation_id: convId, user_id: user.id },
    { conversation_id: convId, user_id: body.otherUserId },
  ])
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 })

  return NextResponse.json({
    conversation: {
      id: convId,
      type: 'direct' as const,
      createdAt: (conv as { created_at: string }).created_at,
      updatedAt: (conv as { updated_at: string }).updated_at,
    },
    created: true,
  })
}
```

- [ ] **Step 2: Verify compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/chat/conversations/route.ts
git commit -m "feat(chat): /api/chat/conversations list + create"
```

---

### Task 5: `/api/chat/conversations/[id]/messages` — paginated history

**Files:**
- Create: `src/app/api/chat/conversations/[id]/messages/route.ts`

- [ ] **Step 1: Write the route**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isMissingTable } from '@/lib/chat/missing-table'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: conversationId } = await params
  const url = new URL(req.url)
  const before = url.searchParams.get('before')
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 50), 1), 200)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let q = supabase.from('chat_messages').select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (before) q = q.lt('created_at', before)

  const { data, error } = await q
  if (error && isMissingTable(error)) {
    return NextResponse.json({ messages: [], migrationPending: true })
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const messages = ((data ?? []) as Array<{ id: string; conversation_id: string; sender_id: string | null; body: string; attachment_url: string | null; attachment_name: string | null; attachment_size: number | null; attachment_mime: string | null; edited_at: string | null; deleted_at: string | null; created_at: string }>)
    .map(m => ({
      id: m.id, conversationId: m.conversation_id, senderId: m.sender_id,
      body: m.body, attachmentUrl: m.attachment_url, attachmentName: m.attachment_name,
      attachmentSize: m.attachment_size, attachmentMime: m.attachment_mime,
      editedAt: m.edited_at, deletedAt: m.deleted_at, createdAt: m.created_at,
    }))
    .reverse()
  return NextResponse.json({ messages })
}
```

- [ ] **Step 2: Verify compile + commit**

```bash
npx tsc --noEmit
git add src/app/api/chat/conversations/[id]/messages/route.ts
git commit -m "feat(chat): /api/chat/conversations/[id]/messages"
```

---

### Task 6: `/api/chat/send` — insert + push

**Files:**
- Create: `src/app/api/chat/send/route.ts`

- [ ] **Step 1: Write the route**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createService } from '@supabase/supabase-js'
import { isMissingTable } from '@/lib/chat/missing-table'
import { sendChatPush } from '@/lib/chat/push'

export const dynamic = 'force-dynamic'

interface SendBody {
  id?: string                 // optional client-generated uuid (required if attachment)
  conversationId: string
  body?: string
  attachment?: {
    url: string
    name: string
    size: number
    mime: string
  }
}

export async function POST(req: NextRequest) {
  const parsed = await req.json().catch(() => null) as SendBody | null
  if (!parsed?.conversationId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 })
  const body = (parsed.body ?? '').trim()
  if (!body && !parsed.attachment) return NextResponse.json({ error: 'body or attachment required' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Verify caller is a member; recompute at insert time to catch races.
  const { data: mem, error: memErr } = await supabase
    .from('chat_conversation_members').select('user_id')
    .eq('conversation_id', parsed.conversationId)
  if (memErr && isMissingTable(memErr)) return NextResponse.json({ migrationPending: true }, { status: 503 })
  if (memErr) return NextResponse.json({ error: memErr.message }, { status: 500 })
  const members = (mem ?? []).map(r => r.user_id as string)
  if (!members.includes(user.id)) return NextResponse.json({ error: 'not a member' }, { status: 403 })

  // Insert message (RLS checks sender_id = auth.uid()).
  const insertPayload: Record<string, unknown> = {
    conversation_id: parsed.conversationId,
    sender_id: user.id,
    body,
  }
  if (parsed.id) insertPayload.id = parsed.id
  if (parsed.attachment) {
    insertPayload.attachment_url = parsed.attachment.url
    insertPayload.attachment_name = parsed.attachment.name
    insertPayload.attachment_size = parsed.attachment.size
    insertPayload.attachment_mime = parsed.attachment.mime
  }
  const { data: inserted, error: iErr } = await supabase
    .from('chat_messages').insert(insertPayload).select().single()
  if (iErr) return NextResponse.json({ error: iErr.message }, { status: 500 })

  // Bump conversation.updated_at (service-role for the UPDATE since RLS on
  // conversations has no UPDATE policy for members).
  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (serviceUrl && serviceKey) {
    const admin = createService(serviceUrl, serviceKey, { auth: { persistSession: false } })
    await admin.from('chat_conversations').update({ updated_at: new Date().toISOString() })
      .eq('id', parsed.conversationId)
  }

  // Push to the other member. v1 is 1:1 so there's exactly one.
  const recipientId = members.find(m => m !== user.id)
  if (recipientId) {
    const { data: me } = await supabase.from('profiles').select('name,email').eq('id', user.id).maybeSingle()
    const senderName = (me?.name || me?.email || 'A teammate') as string
    const preview = body || (parsed.attachment?.name ? `[Attachment: ${parsed.attachment.name}]` : '[Attachment]')
    // Fire-and-forget; don't block the response on push latency.
    void sendChatPush({ recipientUserId: recipientId, conversationId: parsed.conversationId, senderName, preview })
  }

  const row = inserted as { id: string; conversation_id: string; sender_id: string | null; body: string; attachment_url: string | null; attachment_name: string | null; attachment_size: number | null; attachment_mime: string | null; edited_at: string | null; deleted_at: string | null; created_at: string }
  return NextResponse.json({
    message: {
      id: row.id, conversationId: row.conversation_id, senderId: row.sender_id,
      body: row.body, attachmentUrl: row.attachment_url, attachmentName: row.attachment_name,
      attachmentSize: row.attachment_size, attachmentMime: row.attachment_mime,
      editedAt: row.edited_at, deletedAt: row.deleted_at, createdAt: row.created_at,
    },
  })
}
```

- [ ] **Step 2: Verify + commit**

```bash
npx tsc --noEmit
git add src/app/api/chat/send/route.ts
git commit -m "feat(chat): /api/chat/send (insert + push)"
```

---

### Task 7: `/api/chat/messages/[id]` — edit (PATCH) + soft-delete (DELETE)

**Files:**
- Create: `src/app/api/chat/messages/[id]/route.ts`

- [ ] **Step 1: Write the route**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isMissingTable } from '@/lib/chat/missing-table'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const parsed = await req.json().catch(() => null) as { body?: string } | null
  if (parsed?.body === undefined) return NextResponse.json({ error: 'body required' }, { status: 400 })
  const next = (parsed.body ?? '').trim()
  if (!next) return NextResponse.json({ error: 'empty body' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('chat_messages')
    .update({ body: next, edited_at: new Date().toISOString() })
    .eq('id', id).eq('sender_id', user.id).is('deleted_at', null)
    .select().maybeSingle()
  if (error && isMissingTable(error)) return NextResponse.json({ migrationPending: true }, { status: 503 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'not found or not editable' }, { status: 404 })

  const row = data as { id: string; conversation_id: string; sender_id: string | null; body: string; attachment_url: string | null; attachment_name: string | null; attachment_size: number | null; attachment_mime: string | null; edited_at: string | null; deleted_at: string | null; created_at: string }
  return NextResponse.json({
    message: {
      id: row.id, conversationId: row.conversation_id, senderId: row.sender_id,
      body: row.body, attachmentUrl: row.attachment_url, attachmentName: row.attachment_name,
      attachmentSize: row.attachment_size, attachmentMime: row.attachment_mime,
      editedAt: row.edited_at, deletedAt: row.deleted_at, createdAt: row.created_at,
    },
  })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('chat_messages')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id).eq('sender_id', user.id)
    .select().maybeSingle()
  if (error && isMissingTable(error)) return NextResponse.json({ migrationPending: true }, { status: 503 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Verify + commit**

```bash
npx tsc --noEmit
git add src/app/api/chat/messages/[id]/route.ts
git commit -m "feat(chat): /api/chat/messages/[id] edit + soft-delete"
```

---

### Task 8: `/api/chat/mark-read` + `/api/chat/unread-count`

**Files:**
- Create: `src/app/api/chat/mark-read/route.ts`
- Create: `src/app/api/chat/unread-count/route.ts`

- [ ] **Step 1: Write mark-read**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isMissingTable } from '@/lib/chat/missing-table'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const parsed = await req.json().catch(() => null) as { conversationId?: string } | null
  if (!parsed?.conversationId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { error } = await supabase
    .from('chat_conversation_members')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', parsed.conversationId).eq('user_id', user.id)
  if (error && isMissingTable(error)) return NextResponse.json({ migrationPending: true }, { status: 503 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Write unread-count**

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isMissingTable } from '@/lib/chat/missing-table'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: mem, error: memErr } = await supabase
    .from('chat_conversation_members').select('conversation_id,last_read_at').eq('user_id', user.id)
  if (memErr && isMissingTable(memErr)) return NextResponse.json({ unread: 0, migrationPending: true })
  if (memErr) return NextResponse.json({ error: memErr.message }, { status: 500 })

  const convIds = (mem ?? []).map(r => r.conversation_id as string)
  if (convIds.length === 0) return NextResponse.json({ unread: 0 })

  const { data: msgs, error: msgErr } = await supabase
    .from('chat_messages').select('conversation_id,sender_id,created_at')
    .in('conversation_id', convIds)
  if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 })

  const lastReadByConv = new Map<string, string | null>()
  for (const r of (mem ?? [])) lastReadByConv.set(r.conversation_id as string, (r.last_read_at as string | null) ?? null)

  let unread = 0
  for (const m of (msgs ?? []) as Array<{ conversation_id: string; sender_id: string | null; created_at: string }>) {
    if (m.sender_id === user.id) continue
    const lastRead = lastReadByConv.get(m.conversation_id)
    if (!lastRead || m.created_at > lastRead) unread += 1
  }

  return NextResponse.json({ unread })
}
```

- [ ] **Step 3: Verify + commit**

```bash
npx tsc --noEmit
git add src/app/api/chat/mark-read/route.ts src/app/api/chat/unread-count/route.ts
git commit -m "feat(chat): mark-read + unread-count"
```

---

### Task 9: `/api/chat/upload-url` — signed PUT URL

**Files:**
- Create: `src/app/api/chat/upload-url/route.ts`

- [ ] **Step 1: Write the route**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createService } from '@supabase/supabase-js'
import { CHAT_ATTACHMENT_MAX_BYTES } from '@/lib/chat/types'

export const dynamic = 'force-dynamic'

interface Body {
  conversationId: string
  messageId: string
  filename: string
  size: number
}

export async function POST(req: NextRequest) {
  const parsed = await req.json().catch(() => null) as Body | null
  if (!parsed?.conversationId || !parsed.messageId || !parsed.filename) {
    return NextResponse.json({ error: 'invalid payload' }, { status: 400 })
  }
  if (parsed.size > CHAT_ATTACHMENT_MAX_BYTES) {
    return NextResponse.json({ error: 'file too large (10 MB max)' }, { status: 413 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Membership check.
  const { data: mem } = await supabase.from('chat_conversation_members')
    .select('user_id').eq('conversation_id', parsed.conversationId).eq('user_id', user.id).maybeSingle()
  if (!mem) return NextResponse.json({ error: 'not a member' }, { status: 403 })

  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceUrl || !serviceKey) return NextResponse.json({ error: 'server misconfigured' }, { status: 500 })
  const admin = createService(serviceUrl, serviceKey, { auth: { persistSession: false } })

  const safeName = parsed.filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180)
  const path = `${parsed.conversationId}/${parsed.messageId}/${safeName}`
  const { data: signed, error } = await admin.storage.from('chat-attachments')
    .createSignedUploadUrl(path)
  if (error || !signed) return NextResponse.json({ error: error?.message ?? 'sign failed' }, { status: 500 })

  return NextResponse.json({ path, token: signed.token, signedUrl: signed.signedUrl })
}
```

- [ ] **Step 2: Verify + commit**

```bash
npx tsc --noEmit
git add src/app/api/chat/upload-url/route.ts
git commit -m "feat(chat): /api/chat/upload-url signed PUT URL"
```

---

### Task 10: `/api/admin/chat-permissions`

**Files:**
- Create: `src/app/api/admin/chat-permissions/route.ts`

- [ ] **Step 1: Write the route**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isMissingTable } from '@/lib/chat/missing-table'
import { canonicalPair } from '@/lib/chat/types'

export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, admin: false }
  const { data } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  return { supabase, user, admin: data?.role === 'admin' }
}

export async function GET() {
  const { supabase, admin } = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const [profilesRes, permsRes] = await Promise.all([
    supabase.from('profiles').select('id,name,email,role').order('name'),
    supabase.from('chat_permissions').select('user_a_id,user_b_id'),
  ])
  if (permsRes.error && isMissingTable(permsRes.error)) {
    return NextResponse.json({ users: profilesRes.data ?? [], permissions: [], migrationPending: true })
  }
  if (permsRes.error) return NextResponse.json({ error: permsRes.error.message }, { status: 500 })

  return NextResponse.json({
    users: profilesRes.data ?? [],
    permissions: ((permsRes.data ?? []) as Array<{ user_a_id: string; user_b_id: string }>)
      .map(r => ({ userAId: r.user_a_id, userBId: r.user_b_id })),
  })
}

export async function POST(req: NextRequest) {
  const parsed = await req.json().catch(() => null) as { userAId?: string; userBId?: string; allow?: boolean } | null
  if (!parsed?.userAId || !parsed.userBId || typeof parsed.allow !== 'boolean') {
    return NextResponse.json({ error: 'invalid payload' }, { status: 400 })
  }
  if (parsed.userAId === parsed.userBId) {
    return NextResponse.json({ error: 'self-grant not allowed' }, { status: 400 })
  }
  const { supabase, user, admin } = await requireAdmin()
  if (!admin || !user) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const pair = canonicalPair(parsed.userAId, parsed.userBId)
  if (parsed.allow) {
    const { error } = await supabase.from('chat_permissions').upsert({
      user_a_id: pair.userAId, user_b_id: pair.userBId, granted_by: user.id,
    }, { onConflict: 'user_a_id,user_b_id' })
    if (error && isMissingTable(error)) return NextResponse.json({ migrationPending: true }, { status: 503 })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await supabase.from('chat_permissions')
      .delete().eq('user_a_id', pair.userAId).eq('user_b_id', pair.userBId)
    if (error && isMissingTable(error)) return NextResponse.json({ migrationPending: true }, { status: 503 })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Verify + commit**

```bash
npx tsc --noEmit
git add src/app/api/admin/chat-permissions/route.ts
git commit -m "feat(chat): /api/admin/chat-permissions"
```

---

### Task 11: Browser API client

**Files:**
- Create: `src/lib/chat/api.ts`

- [ ] **Step 1: Write the client**

```ts
import type { ChatContact, ChatConversation, ChatConversationListRow, ChatMessage } from './types'

async function j<T>(url: string, init?: RequestInit): Promise<T | { migrationPending: true } | { error: string }> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } })
  const body = await res.json().catch(() => ({ error: 'bad json' })) as T | { migrationPending: true } | { error: string }
  if (!res.ok && !(body && typeof body === 'object' && 'migrationPending' in body)) {
    return { error: (body as { error?: string })?.error ?? `HTTP ${res.status}` }
  }
  return body
}

export const chatApi = {
  listContacts: () => j<{ contacts: ChatContact[] }>('/api/chat/contacts'),
  listConversations: () => j<{ conversations: ChatConversationListRow[] }>('/api/chat/conversations'),
  openOrCreate: (otherUserId: string) =>
    j<{ conversation: ChatConversation; created: boolean }>('/api/chat/conversations', {
      method: 'POST', body: JSON.stringify({ otherUserId }),
    }),
  listMessages: (conversationId: string, before?: string, limit = 50) => {
    const q = new URLSearchParams({ limit: String(limit) })
    if (before) q.set('before', before)
    return j<{ messages: ChatMessage[] }>(`/api/chat/conversations/${conversationId}/messages?${q}`)
  },
  send: (payload: { id?: string; conversationId: string; body?: string; attachment?: { url: string; name: string; size: number; mime: string } }) =>
    j<{ message: ChatMessage }>('/api/chat/send', { method: 'POST', body: JSON.stringify(payload) }),
  editMessage: (id: string, body: string) =>
    j<{ message: ChatMessage }>(`/api/chat/messages/${id}`, { method: 'PATCH', body: JSON.stringify({ body }) }),
  deleteMessage: (id: string) => j<{ ok: true }>(`/api/chat/messages/${id}`, { method: 'DELETE' }),
  markRead: (conversationId: string) =>
    j<{ ok: true }>('/api/chat/mark-read', { method: 'POST', body: JSON.stringify({ conversationId }) }),
  unreadCount: () => j<{ unread: number }>('/api/chat/unread-count'),
  signUpload: (conversationId: string, messageId: string, filename: string, size: number) =>
    j<{ path: string; token: string; signedUrl: string }>('/api/chat/upload-url', {
      method: 'POST', body: JSON.stringify({ conversationId, messageId, filename, size }),
    }),
}

export function isMigrationPending<T>(r: T | { migrationPending: true } | { error: string }): r is { migrationPending: true } {
  return typeof r === 'object' && r !== null && 'migrationPending' in r && (r as { migrationPending?: boolean }).migrationPending === true
}
export function isApiError<T>(r: T | { migrationPending: true } | { error: string }): r is { error: string } {
  return typeof r === 'object' && r !== null && 'error' in r && typeof (r as { error?: string }).error === 'string'
}
```

- [ ] **Step 2: Verify + commit**

```bash
npx tsc --noEmit
git add src/lib/chat/api.ts
git commit -m "feat(chat): browser api client"
```

---

### Task 12: Realtime helpers

**Files:**
- Create: `src/lib/chat/realtime.ts`

- [ ] **Step 1: Write the realtime helpers**

```ts
"use client"

import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { ChatMessage } from './types'

type MessageHandler = (m: ChatMessage, event: 'INSERT' | 'UPDATE') => void

function rowToMessage(r: Record<string, unknown>): ChatMessage {
  return {
    id: r.id as string,
    conversationId: r.conversation_id as string,
    senderId: (r.sender_id ?? null) as string | null,
    body: (r.body ?? '') as string,
    attachmentUrl: (r.attachment_url ?? null) as string | null,
    attachmentName: (r.attachment_name ?? null) as string | null,
    attachmentSize: (r.attachment_size ?? null) as number | null,
    attachmentMime: (r.attachment_mime ?? null) as string | null,
    editedAt: (r.edited_at ?? null) as string | null,
    deletedAt: (r.deleted_at ?? null) as string | null,
    createdAt: r.created_at as string,
  }
}

export function subscribeToConversation(conversationId: string, handler: MessageHandler): () => void {
  const supabase = createClient()
  const ch: RealtimeChannel = supabase
    .channel(`chat:conv:${conversationId}`)
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `conversation_id=eq.${conversationId}` },
      (p) => handler(rowToMessage(p.new as Record<string, unknown>), 'INSERT'))
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter: `conversation_id=eq.${conversationId}` },
      (p) => handler(rowToMessage(p.new as Record<string, unknown>), 'UPDATE'))
    .subscribe()
  return () => { supabase.removeChannel(ch) }
}

export interface TypingPayload { userId: string }

export function subscribeToTyping(conversationId: string, onTyping: (p: TypingPayload) => void) {
  const supabase = createClient()
  const ch = supabase.channel(`chat:typing:${conversationId}`, { config: { broadcast: { self: false } } })
    .on('broadcast', { event: 'typing' }, (ev) => {
      const payload = ev.payload as TypingPayload | undefined
      if (payload?.userId) onTyping(payload)
    })
    .subscribe()
  const send = (userId: string) => {
    void ch.send({ type: 'broadcast', event: 'typing', payload: { userId } })
  }
  const cleanup = () => { supabase.removeChannel(ch) }
  return { sendTyping: send, cleanup }
}
```

- [ ] **Step 2: Verify + commit**

```bash
npx tsc --noEmit
git add src/lib/chat/realtime.ts
git commit -m "feat(chat): client realtime helpers (channel + typing)"
```

---

### Task 13: Chat header button + unread poll

**Files:**
- Create: `src/components/chat/chat-header-button.tsx`

- [ ] **Step 1: Write the button**

```tsx
"use client"

import { useCallback, useEffect, useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { chatApi, isApiError, isMigrationPending } from '@/lib/chat/api'
import { ChatPanel } from './chat-panel'

export function ChatHeaderButton() {
  const [open, setOpen] = useState(false)
  const [initialConvId, setInitialConvId] = useState<string | null>(null)
  const [unread, setUnread] = useState(0)
  const [migrationPending, setMigrationPending] = useState(false)

  const refresh = useCallback(async () => {
    const r = await chatApi.unreadCount()
    if (isApiError(r)) return
    if (isMigrationPending(r)) { setMigrationPending(true); setUnread(0); return }
    setMigrationPending(false)
    setUnread(r.unread)
  }, [])

  useEffect(() => {
    refresh()
    const t = window.setInterval(refresh, 10_000)
    return () => window.clearInterval(t)
  }, [refresh])

  // Open panel on ?chat=<id> deep link (from push notification click).
  useEffect(() => {
    const url = new URL(window.location.href)
    const chatId = url.searchParams.get('chat')
    if (chatId) {
      setInitialConvId(chatId)
      setOpen(true)
      url.searchParams.delete('chat')
      window.history.replaceState({}, '', url.toString())
    }
  }, [])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={migrationPending}
        title={migrationPending ? 'Chat requires migration' : 'Chat'}
        className="relative inline-flex items-center justify-center w-9 h-9 rounded-md text-slate-300 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-40"
      >
        <MessageCircle className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center px-1">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <ChatPanel
          onClose={() => { setOpen(false); setInitialConvId(null); refresh() }}
          initialConversationId={initialConvId}
        />
      )}
    </>
  )
}
```

- [ ] **Step 2: Verify compile — expected to FAIL (`ChatPanel` not written yet)**

Not committing yet — moves forward to Task 14 which writes `ChatPanel`.

---

### Task 14: Chat panel orchestrator

**Files:**
- Create: `src/components/chat/chat-panel.tsx`

- [ ] **Step 1: Write the panel shell**

```tsx
"use client"

import { useEffect, useState } from 'react'
import { X, ArrowLeft, Plus } from 'lucide-react'
import { chatApi, isApiError, isMigrationPending } from '@/lib/chat/api'
import type { ChatConversationListRow } from '@/lib/chat/types'
import { ChatConversationList } from './chat-conversation-list'
import { ChatThreadView } from './chat-thread-view'
import { ChatNewConversation } from './chat-new-conversation'

type View = 'list' | 'thread' | 'new'

export function ChatPanel({ onClose, initialConversationId }: { onClose: () => void; initialConversationId?: string | null }) {
  const [view, setView] = useState<View>(initialConversationId ? 'thread' : 'list')
  const [activeConvId, setActiveConvId] = useState<string | null>(initialConversationId ?? null)
  const [rows, setRows] = useState<ChatConversationListRow[] | null>(null)
  const [migrationPending, setMigrationPending] = useState(false)

  const reloadList = async () => {
    const r = await chatApi.listConversations()
    if (isApiError(r)) return
    if (isMigrationPending(r)) { setMigrationPending(true); setRows([]); return }
    setMigrationPending(false)
    setRows(r.conversations)
  }

  useEffect(() => { void reloadList() }, [])

  const openConversation = (id: string) => {
    setActiveConvId(id)
    setView('thread')
  }

  const openNew = () => setView('new')
  const backToList = () => { setView('list'); setActiveConvId(null); void reloadList() }

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden />
      <aside className="absolute top-0 right-0 h-full w-full sm:w-[500px] bg-white shadow-xl flex flex-col">
        <header className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white">
          <div className="flex items-center gap-2">
            {view !== 'list' && (
              <button onClick={backToList} className="text-slate-500 hover:text-slate-800" aria-label="Back">
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <h2 className="font-bold text-slate-900">
              {view === 'list' && 'Chat'}
              {view === 'thread' && 'Conversation'}
              {view === 'new' && 'New message'}
            </h2>
          </div>
          <div className="flex items-center gap-1">
            {view === 'list' && (
              <button
                onClick={openNew}
                disabled={migrationPending}
                className="inline-flex items-center justify-center w-8 h-8 rounded-md text-slate-500 hover:text-blue-600 hover:bg-slate-100 disabled:opacity-40"
                title="New conversation"
              >
                <Plus className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="inline-flex items-center justify-center w-8 h-8 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 min-h-0 overflow-hidden">
          {migrationPending && (
            <div className="p-6 text-center text-sm text-slate-500">
              Chat is set up but the database migration hasn&apos;t run yet.
              <br />Admin: run <code>supabase/migration-chat.sql</code> in Supabase.
            </div>
          )}
          {!migrationPending && view === 'list' && (
            <ChatConversationList rows={rows} onOpen={openConversation} />
          )}
          {!migrationPending && view === 'thread' && activeConvId && (
            <ChatThreadView
              conversationId={activeConvId}
              counterpart={rows?.find(r => r.conversation.id === activeConvId)?.counterpart ?? null}
            />
          )}
          {!migrationPending && view === 'new' && (
            <ChatNewConversation
              onCreated={(convId) => openConversation(convId)}
            />
          )}
        </div>
      </aside>
    </div>
  )
}
```

- [ ] **Step 2: Not verifying yet — move to Task 15 which writes the children**

---

### Task 15: Conversation list

**Files:**
- Create: `src/components/chat/chat-conversation-list.tsx`

- [ ] **Step 1: Write the list**

```tsx
"use client"

import { Loader2 } from 'lucide-react'
import type { ChatConversationListRow } from '@/lib/chat/types'

function initials(name: string): string {
  return name.trim().split(/\s+/).map(w => w.charAt(0).toUpperCase()).slice(0, 2).join('') || '?'
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  const now = Date.now()
  const diff = now - d.getTime()
  if (diff < 60_000) return 'now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`
  if (diff < 604_800_000) return d.toLocaleDateString('en-US', { weekday: 'short' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function preview(row: ChatConversationListRow): string {
  const m = row.lastMessage
  if (!m) return 'No messages yet'
  if (m.deletedAt) return '(deleted)'
  if (m.body) return m.body
  if (m.attachmentName) return `[Attachment: ${m.attachmentName}]`
  return '[Attachment]'
}

export function ChatConversationList({
  rows,
  onOpen,
}: {
  rows: ChatConversationListRow[] | null
  onOpen: (conversationId: string) => void
}) {
  if (rows === null) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
      </div>
    )
  }
  if (rows.length === 0) {
    return (
      <div className="p-6 text-sm text-slate-500 italic">
        No conversations yet. Click the + button to start one.
      </div>
    )
  }
  return (
    <ul className="divide-y divide-slate-100 overflow-y-auto h-full">
      {rows.map((r) => {
        const name = r.counterpart?.name || r.counterpart?.email || 'Unknown'
        const unread = r.unread
        return (
          <li key={r.conversation.id}>
            <button
              onClick={() => onOpen(r.conversation.id)}
              className="w-full flex items-start gap-3 px-4 py-3 hover:bg-slate-50 text-left"
            >
              <span className="shrink-0 w-9 h-9 rounded-full bg-slate-200 text-slate-700 inline-flex items-center justify-center text-xs font-bold">
                {initials(name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={`truncate font-semibold ${unread > 0 ? 'text-slate-900' : 'text-slate-800'}`}>
                    {name}
                  </span>
                  <span className="text-[11px] text-slate-400 tabular-nums shrink-0">{fmtTime(r.lastMessage?.createdAt ?? r.conversation.updatedAt)}</span>
                </span>
                <span className={`block mt-0.5 text-sm truncate ${unread > 0 ? 'text-slate-900 font-medium' : 'text-slate-500'}`}>
                  {preview(r)}
                </span>
              </span>
              {unread > 0 && (
                <span className="shrink-0 mt-1 min-w-[20px] h-[20px] rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center px-1.5">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
```

- [ ] **Step 2: Not verifying yet — Task 16 writes new-conversation picker**

---

### Task 16: New conversation picker

**Files:**
- Create: `src/components/chat/chat-new-conversation.tsx`

- [ ] **Step 1: Write the picker**

```tsx
"use client"

import { useEffect, useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import { chatApi, isApiError, isMigrationPending } from '@/lib/chat/api'
import type { ChatContact } from '@/lib/chat/types'

export function ChatNewConversation({ onCreated }: { onCreated: (conversationId: string) => void }) {
  const [contacts, setContacts] = useState<ChatContact[] | null>(null)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    chatApi.listContacts().then((r) => {
      if (cancelled) return
      if (isApiError(r)) return setError(r.error)
      if (isMigrationPending(r)) return setContacts([])
      setContacts(r.contacts)
    })
    return () => { cancelled = true }
  }, [])

  const filtered = (contacts ?? []).filter(c => {
    if (!q.trim()) return true
    const needle = q.trim().toLowerCase()
    return c.name.toLowerCase().includes(needle) || c.email.toLowerCase().includes(needle)
  })

  const pick = async (id: string) => {
    setBusy(true); setError(null)
    const r = await chatApi.openOrCreate(id)
    setBusy(false)
    if (isApiError(r)) return setError(r.error)
    if (isMigrationPending(r)) return setError('Migration pending')
    onCreated(r.conversation.id)
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-3 border-b border-slate-100">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="search"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search people…"
            className="pl-8 pr-3 py-2 w-full bg-white border border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
        </div>
      </div>
      {error && <div className="m-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">{error}</div>}
      <div className="flex-1 overflow-y-auto">
        {contacts === null ? (
          <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading contacts…
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-sm text-slate-500 italic">
            {q.trim() ? 'No matches.' : 'No one yet. Ask an admin to grant you a chat permission.'}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtered.map(c => (
              <li key={c.id}>
                <button
                  onClick={() => pick(c.id)}
                  disabled={busy}
                  className="w-full text-left px-4 py-3 hover:bg-slate-50 disabled:opacity-50"
                >
                  <div className="font-semibold text-slate-900 text-sm">{c.name || c.email}</div>
                  <div className="text-xs text-slate-500">{c.email}{c.role === 'admin' && <span className="ml-2 text-blue-600 font-semibold">Admin</span>}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Not verifying yet — Task 17 writes thread view**

---

### Task 17: Thread view (with realtime + typing)

**Files:**
- Create: `src/components/chat/chat-thread-view.tsx`
- Create: `src/components/chat/chat-message-row.tsx`

- [ ] **Step 1: Write message-row component**

```tsx
"use client"

import { useState } from 'react'
import { MoreVertical, Pencil, Trash2 } from 'lucide-react'
import type { ChatMessage } from '@/lib/chat/types'

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export function ChatMessageRow({
  message,
  mine,
  onEdit,
  onDelete,
}: {
  message: ChatMessage
  mine: boolean
  onEdit: (id: string, body: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(message.body)
  const [menuOpen, setMenuOpen] = useState(false)

  const commit = async () => {
    const next = draft.trim()
    if (!next || next === message.body) { setEditing(false); return }
    await onEdit(message.id, next)
    setEditing(false)
  }

  const isDeleted = !!message.deletedAt
  const align = mine ? 'items-end' : 'items-start'
  const bubble = mine ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-900'

  return (
    <div className={`flex flex-col ${align} group px-4`}>
      <div className="relative max-w-[80%]">
        <div className={`rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${bubble}`}>
          {isDeleted ? (
            <span className="italic opacity-70">(deleted)</span>
          ) : editing ? (
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void commit() }
                if (e.key === 'Escape') { setEditing(false); setDraft(message.body) }
              }}
              onBlur={() => void commit()}
              rows={1}
              className="w-full bg-transparent border-none focus:outline-none text-inherit resize-none"
              autoFocus
            />
          ) : (
            <>{message.body}</>
          )}
          {message.attachmentUrl && !isDeleted && (
            <AttachmentView url={message.attachmentUrl} name={message.attachmentName} mime={message.attachmentMime} />
          )}
        </div>
        {mine && !isDeleted && !editing && (
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="absolute -left-7 top-1 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-700"
            aria-label="Message options"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
        )}
        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-md shadow-md py-1 z-10">
            <button
              onClick={() => { setMenuOpen(false); setEditing(true) }}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
            >
              <Pencil className="w-3 h-3" /> Edit
            </button>
            <button
              onClick={() => { setMenuOpen(false); void onDelete(message.id) }}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
            >
              <Trash2 className="w-3 h-3" /> Delete
            </button>
          </div>
        )}
      </div>
      <div className="mt-0.5 px-2 text-[10px] text-slate-400">
        {fmtTime(message.createdAt)}{message.editedAt && !isDeleted && ' · edited'}
      </div>
    </div>
  )
}

function AttachmentView({ url, name, mime }: { url: string; name: string | null; mime: string | null }) {
  // url is a storage path; render as a signed-URL link. Panel resolves signed URL via a client call.
  const isImage = mime?.startsWith('image/')
  return (
    <div className="mt-2">
      {isImage ? (
        <a href={`/api/chat/signed-attachment?path=${encodeURIComponent(url)}`} target="_blank" rel="noreferrer">
          <img src={`/api/chat/signed-attachment?path=${encodeURIComponent(url)}`} alt={name ?? 'attachment'} className="max-h-56 rounded" />
        </a>
      ) : (
        <a
          href={`/api/chat/signed-attachment?path=${encodeURIComponent(url)}`}
          target="_blank" rel="noreferrer"
          className="underline text-xs opacity-80 hover:opacity-100"
        >
          {name ?? 'Attachment'}
        </a>
      )}
    </div>
  )
}
```

Note: `/api/chat/signed-attachment` is a thin GET endpoint added in Task 18.

- [ ] **Step 2: Write thread view**

```tsx
"use client"

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { chatApi, isApiError, isMigrationPending } from '@/lib/chat/api'
import { subscribeToConversation, subscribeToTyping } from '@/lib/chat/realtime'
import type { ChatContact, ChatMessage } from '@/lib/chat/types'
import { useCurrentProfile } from '@/lib/supabase/profiles'
import { ChatMessageRow } from './chat-message-row'
import { ChatComposer } from './chat-composer'

export function ChatThreadView({
  conversationId,
  counterpart,
}: {
  conversationId: string
  counterpart: ChatContact | null
}) {
  const { profile } = useCurrentProfile()
  const myId = profile?.id ?? null
  const [messages, setMessages] = useState<ChatMessage[] | null>(null)
  const [typingUser, setTypingUser] = useState<string | null>(null)
  const typingClearTimerRef = useRef<number | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Initial history + mark read.
  useEffect(() => {
    let cancelled = false
    chatApi.listMessages(conversationId).then((r) => {
      if (cancelled) return
      if (isApiError(r) || isMigrationPending(r)) return setMessages([])
      setMessages(r.messages)
    })
    void chatApi.markRead(conversationId)
    return () => { cancelled = true }
  }, [conversationId])

  // Realtime new / updated messages.
  useEffect(() => {
    const unsub = subscribeToConversation(conversationId, (m, event) => {
      setMessages((prev) => {
        const arr = prev ?? []
        if (event === 'INSERT') {
          if (arr.find(x => x.id === m.id)) return arr
          return [...arr, m]
        }
        return arr.map(x => (x.id === m.id ? m : x))
      })
      if (m.senderId !== myId) void chatApi.markRead(conversationId)
    })
    return () => { unsub() }
  }, [conversationId, myId])

  // Typing subscription.
  useEffect(() => {
    const { cleanup } = subscribeToTyping(conversationId, (p) => {
      if (p.userId === myId) return
      setTypingUser(p.userId)
      if (typingClearTimerRef.current) window.clearTimeout(typingClearTimerRef.current)
      typingClearTimerRef.current = window.setTimeout(() => setTypingUser(null), 3000)
    })
    return () => {
      cleanup()
      if (typingClearTimerRef.current) window.clearTimeout(typingClearTimerRef.current)
    }
  }, [conversationId, myId])

  // Auto-scroll to bottom on new message.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const onEdit = useCallback(async (id: string, body: string) => {
    const r = await chatApi.editMessage(id, body)
    if (isApiError(r) || isMigrationPending(r)) return
    setMessages((prev) => (prev ?? []).map(m => (m.id === r.message.id ? r.message : m)))
  }, [])

  const onDelete = useCallback(async (id: string) => {
    const r = await chatApi.deleteMessage(id)
    if (isApiError(r) || isMigrationPending(r)) return
    setMessages((prev) => (prev ?? []).map(m => (m.id === id ? { ...m, deletedAt: new Date().toISOString() } : m)))
  }, [])

  const onLocalEcho = useCallback((m: ChatMessage) => {
    setMessages((prev) => {
      const arr = prev ?? []
      if (arr.find(x => x.id === m.id)) return arr
      return [...arr, m]
    })
  }, [])

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2 border-b border-slate-100 bg-slate-50">
        <div className="text-sm font-bold text-slate-900">{counterpart?.name || counterpart?.email || 'Conversation'}</div>
      </div>
      <div className="flex-1 overflow-y-auto py-3 space-y-2">
        {messages === null ? (
          <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : messages.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-400 italic">No messages yet. Say hi.</div>
        ) : (
          messages.map(m => (
            <ChatMessageRow key={m.id} message={m} mine={m.senderId === myId} onEdit={onEdit} onDelete={onDelete} />
          ))
        )}
        <div ref={bottomRef} />
      </div>
      {typingUser && (
        <div className="px-4 py-1 text-[11px] text-slate-500 italic">
          {counterpart?.name || 'Someone'} is typing…
        </div>
      )}
      <ChatComposer
        conversationId={conversationId}
        myUserId={myId}
        onSent={onLocalEcho}
      />
    </div>
  )
}
```

- [ ] **Step 3: Not verifying yet — Task 18 writes composer + signed-attachment endpoint**

---

### Task 18: Composer + signed-attachment endpoint

**Files:**
- Create: `src/components/chat/chat-composer.tsx`
- Create: `src/app/api/chat/signed-attachment/route.ts`

- [ ] **Step 1: Write composer**

```tsx
"use client"

import { useRef, useState } from 'react'
import { Loader2, Paperclip, Send, X } from 'lucide-react'
import { chatApi, isApiError, isMigrationPending } from '@/lib/chat/api'
import { subscribeToTyping } from '@/lib/chat/realtime'
import { CHAT_ATTACHMENT_MAX_BYTES, type ChatMessage } from '@/lib/chat/types'

export function ChatComposer({
  conversationId,
  myUserId,
  onSent,
}: {
  conversationId: string
  myUserId: string | null
  onSent: (message: ChatMessage) => void
}) {
  const [body, setBody] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const typingRef = useRef<ReturnType<typeof subscribeToTyping> | null>(null)
  const lastTypingSent = useRef(0)

  // Lazy init typing channel (one per composer instance).
  const ensureTyping = () => {
    if (!typingRef.current) typingRef.current = subscribeToTyping(conversationId, () => {})
    return typingRef.current
  }
  const emitTyping = () => {
    if (!myUserId) return
    const now = Date.now()
    if (now - lastTypingSent.current < 1500) return
    lastTypingSent.current = now
    ensureTyping().sendTyping(myUserId)
  }

  const chooseFile = (f: File | null) => {
    if (!f) return setFile(null)
    if (f.size > CHAT_ATTACHMENT_MAX_BYTES) {
      setError('File too large (10 MB max)')
      return
    }
    setError(null)
    setFile(f)
  }

  const send = async () => {
    if (busy) return
    const text = body.trim()
    if (!text && !file) return
    setBusy(true); setError(null)
    const messageId = (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
    let attachment: { url: string; name: string; size: number; mime: string } | undefined
    if (file) {
      const signed = await chatApi.signUpload(conversationId, messageId, file.name, file.size)
      if (isApiError(signed)) { setBusy(false); setError(signed.error); return }
      if (isMigrationPending(signed)) { setBusy(false); setError('Migration pending'); return }
      const put = await fetch(signed.signedUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' } })
      if (!put.ok) { setBusy(false); setError('Upload failed'); return }
      attachment = { url: signed.path, name: file.name, size: file.size, mime: file.type || 'application/octet-stream' }
    }
    const r = await chatApi.send({ id: messageId, conversationId, body: text, attachment })
    setBusy(false)
    if (isApiError(r)) return setError(r.error)
    if (isMigrationPending(r)) return setError('Migration pending')
    onSent(r.message)
    setBody('')
    setFile(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="border-t border-slate-100 p-3 bg-white">
      {error && <div className="mb-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-1.5">{error}</div>}
      {file && (
        <div className="mb-2 flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs">
          <span className="truncate">{file.name} <span className="text-slate-400">({Math.round(file.size / 1024)} KB)</span></span>
          <button onClick={() => setFile(null)} className="text-slate-400 hover:text-slate-800" aria-label="Clear attachment"><X className="w-3 h-3" /></button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-md text-slate-500 hover:text-blue-600 hover:bg-slate-100 disabled:opacity-40"
          title="Attach file"
        >
          <Paperclip className="w-4 h-4" />
        </button>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={e => chooseFile(e.target.files?.[0] ?? null)}
        />
        <textarea
          value={body}
          onChange={e => { setBody(e.target.value); emitTyping() }}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() }
          }}
          rows={1}
          placeholder="Type a message…"
          className="flex-1 resize-none bg-white border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[36px] max-h-32"
        />
        <button
          onClick={send}
          disabled={busy || (!body.trim() && !file)}
          className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-md bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40"
          aria-label="Send"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Write signed-attachment endpoint**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createService } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get('path')
  if (!path) return NextResponse.json({ error: 'path required' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Membership check: first path segment is the conversation_id.
  const convId = path.split('/')[0]
  const { data: mem } = await supabase.from('chat_conversation_members')
    .select('user_id').eq('conversation_id', convId).eq('user_id', user.id).maybeSingle()
  if (!mem) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceUrl || !serviceKey) return NextResponse.json({ error: 'misconfigured' }, { status: 500 })
  const admin = createService(serviceUrl, serviceKey, { auth: { persistSession: false } })

  const { data, error } = await admin.storage.from('chat-attachments').createSignedUrl(path, 300)
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'sign failed' }, { status: 500 })

  // Redirect browser directly to the signed URL (works for <img src> and <a href>).
  return NextResponse.redirect(data.signedUrl, 302)
}
```

- [ ] **Step 3: Verify everything compiles**

Run: `npx tsc --noEmit`
Expected: no errors across all chat UI + API files.

- [ ] **Step 4: Commit UI components + signed-attachment endpoint**

```bash
git add src/components/chat/ src/app/api/chat/signed-attachment/route.ts
git commit -m "feat(chat): UI panel + list + thread + composer + signed-attachment endpoint"
```

---

### Task 19: Mount chat button in app header

**Files:**
- Modify: `src/components/app-header.tsx` (around line 158)

- [ ] **Step 1: Add import at the top**

Insert after the existing `import { RemindersHeaderButton } ...` line:

```tsx
import { ChatHeaderButton } from '@/components/chat/chat-header-button'
```

- [ ] **Step 2: Add the button next to Reminders**

Change the block:

```tsx
              {!locked && <RemindersHeaderButton />}
              {!locked && <ClaimSearchButton />}
```

to:

```tsx
              {!locked && <RemindersHeaderButton />}
              {!locked && <ChatHeaderButton />}
              {!locked && <ClaimSearchButton />}
```

- [ ] **Step 3: Verify + commit**

```bash
npx tsc --noEmit
git add src/components/app-header.tsx
git commit -m "feat(chat): mount ChatHeaderButton next to Reminders"
```

---

### Task 20: Admin matrix page

**Files:**
- Create: `src/app/admin/settings/chat-permissions/page.tsx`
- Create: `src/app/admin/settings/chat-permissions/chat-permissions-client.tsx`
- Modify: `src/app/admin/settings/_settings-nav.tsx` (add nav entry)

- [ ] **Step 1: Write page.tsx**

```tsx
import { ChatPermissionsClient } from './chat-permissions-client'

export default function AdminChatPermissionsPage() {
  return (
    <div>
      <h1 className="hp-display mb-6">Chat Permissions</h1>
      <p className="text-sm text-slate-500 mb-5 max-w-2xl">
        Flip a cell to allow the two users to chat. Pairs are symmetric — allowing A ↔ B lets either side start the conversation. Admins can chat with anyone regardless of this grid.
      </p>
      <ChatPermissionsClient />
    </div>
  )
}
```

- [ ] **Step 2: Write chat-permissions-client.tsx**

```tsx
"use client"

import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { canonicalPair, type ChatContact } from '@/lib/chat/types'

interface PermRow { userAId: string; userBId: string }
interface LoadResponse { users: ChatContact[]; permissions: PermRow[]; migrationPending?: true }

export function ChatPermissionsClient() {
  const [users, setUsers] = useState<ChatContact[] | null>(null)
  const [perms, setPerms] = useState<Set<string>>(new Set())
  const [migrationPending, setMigrationPending] = useState(false)
  const [busyCell, setBusyCell] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = async () => {
    const res = await fetch('/api/admin/chat-permissions')
    const body = await res.json().catch(() => null) as LoadResponse | null
    if (!body) return setError('Load failed')
    setUsers(body.users)
    setPerms(new Set(body.permissions.map(p => `${p.userAId}|${p.userBId}`)))
    setMigrationPending(body.migrationPending === true)
  }

  useEffect(() => { void reload() }, [])

  const toggle = async (a: string, b: string, next: boolean) => {
    const pair = canonicalPair(a, b)
    const key = `${pair.userAId}|${pair.userBId}`
    setBusyCell(key)
    const prev = new Set(perms)
    const optimistic = new Set(perms)
    if (next) optimistic.add(key); else optimistic.delete(key)
    setPerms(optimistic)
    const res = await fetch('/api/admin/chat-permissions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userAId: pair.userAId, userBId: pair.userBId, allow: next }),
    })
    setBusyCell(null)
    if (!res.ok) { setPerms(prev); setError('Toggle failed') }
  }

  const activeUsers = useMemo(() => (users ?? []), [users])

  if (users === null) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
      </div>
    )
  }
  if (migrationPending) {
    return (
      <div className="p-6 rounded border border-amber-200 bg-amber-50 text-sm text-amber-900">
        Chat tables haven&apos;t been created yet. Run <code>supabase/migration-chat.sql</code> in the Supabase SQL editor, then reload.
      </div>
    )
  }
  if (activeUsers.length === 0) {
    return <div className="text-sm text-slate-500 italic">No users yet.</div>
  }

  return (
    <div className="overflow-auto bg-white border border-slate-200 rounded-lg">
      <table className="min-w-full text-sm border-collapse">
        <thead>
          <tr>
            <th className="sticky left-0 bg-slate-50 border-b border-r border-slate-200 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">User</th>
            {activeUsers.map(u => (
              <th
                key={u.id}
                className="border-b border-slate-200 px-2 py-2 text-[10px] font-semibold text-slate-600 vertical-text whitespace-nowrap"
                style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', minWidth: 32 }}
                title={u.email}
              >
                {u.name || u.email}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {activeUsers.map(row => (
            <tr key={row.id}>
              <th className="sticky left-0 bg-white border-r border-slate-200 px-3 py-1.5 text-left font-medium text-slate-800 whitespace-nowrap">
                {row.name || row.email}
                {row.role === 'admin' && <span className="ml-2 text-blue-600 text-xs">Admin</span>}
              </th>
              {activeUsers.map(col => {
                const diag = row.id === col.id
                const adminRow = row.role === 'admin'
                const adminCol = col.role === 'admin'
                const alwaysAllowed = adminRow || adminCol
                const pair = canonicalPair(row.id, col.id)
                const key = `${pair.userAId}|${pair.userBId}`
                const checked = alwaysAllowed || perms.has(key)
                const disabled = diag || alwaysAllowed || busyCell === key
                return (
                  <td key={col.id} className="border-t border-slate-100 px-2 py-1 text-center">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={e => void toggle(row.id, col.id, e.target.checked)}
                      className="accent-blue-600 cursor-pointer disabled:cursor-not-allowed"
                    />
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {error && <div className="p-3 text-sm text-red-700 bg-red-50 border-t border-red-200">{error}</div>}
    </div>
  )
}
```

- [ ] **Step 3: Add nav link**

Read `src/app/admin/settings/_settings-nav.tsx`, find where other items are declared, add `{ id: 'chat-permissions', label: 'Chat Permissions', href: '/admin/settings/chat-permissions' }` entry in the same style, alphabetical or at the bottom.

- [ ] **Step 4: Verify + commit**

```bash
npx tsc --noEmit
git add src/app/admin/settings/chat-permissions/ src/app/admin/settings/_settings-nav.tsx
git commit -m "feat(chat): admin chat-permissions page (grid matrix)"
```

---

### Task 21: Service worker click handler for `?chat=<id>` deep link

**Files:**
- Modify: `public/sw.js`

- [ ] **Step 1: Verify SW already handles push payload's `data.url`**

If it does (common pattern), no change required — the push payload already uses `data.url: '/?chat=<id>'` and the SW opens it. Open `public/sw.js` and inspect the `notificationclick` handler. If it does NOT read `data.url`, add:

```js
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(wins => {
      for (const w of wins) {
        if ('focus' in w) { w.navigate(url); return w.focus(); }
      }
      return self.clients.openWindow(url);
    })
  );
});
```

Only add if the handler is missing or doesn't do this; do not duplicate an existing handler.

- [ ] **Step 2: Commit if modified**

```bash
git add public/sw.js
git commit -m "feat(chat): sw click-handler respects notification data.url"
```

(Skip if nothing changed.)

---

### Task 22: Final build + deploy

- [ ] **Step 1: Final TS check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 2: Production build**

```bash
npm run build
```
Expected: build succeeds. Only pre-existing lint warnings tolerated.

- [ ] **Step 3: Capture current prod deploy for rollback**

```bash
npx vercel inspect modern-tools-rho.vercel.app --scope henry-as-projects-88caed67
```
Save the deploy id + URL — rollback target.

- [ ] **Step 4: Deploy**

```bash
npx vercel --prod --scope henry-as-projects-88caed67 --yes
```

- [ ] **Step 5: Verify alias flipped**

```bash
npx vercel inspect modern-tools-rho.vercel.app --scope henry-as-projects-88caed67
```
Expected: `status ● Ready`, id = new deploy id.

- [ ] **Step 6: Append SESSIONS.md entry and commit**

Prepend an entry to `docs/SESSIONS.md`:
- Date header
- "Worked on:" one-liner
- Spec + plan paths
- "Changed:" file list
- "Deploy status:" new deploy id + rollback id/URL + migration status
- "In progress / broken / unknowns:" migrations not yet run; verifications pending real paired-users smoke test
- "Next:" Henry runs the two migrations, then grants an admin ↔ appraiser permission and smokes 1:1 chat

Commit.

- [ ] **Step 7: Report back to user**

A short message with:
- Live deploy id
- Rollback command with id filled
- Two migrations the user needs to run (`supabase/migration-chat.sql`, `supabase/migration-chat-storage.sql`)
- Note: new admin page at `/admin/settings/chat-permissions`
- Note: chat button appears next to Reminders; disabled until migrations are run

---

## Self-review

**Spec coverage:**
- Data model (4 tables + bucket) → Task 1
- RLS + is_admin() backstop → Task 1
- Admin-mediated conversation create → Task 4
- GET contacts (admin bypass + permissions + always-admin partners) → Task 3
- GET conversation list w/ counterpart + last + unread → Task 4
- GET history pagination → Task 5
- POST send w/ push → Task 6
- PATCH edit, DELETE soft-delete → Task 7
- mark-read + unread-count poll → Task 8
- Signed upload URL → Task 9
- Admin matrix GET + POST → Task 10
- Browser api + migrationPending detection → Task 11
- Realtime (postgres_changes + broadcast typing) → Task 12
- Header button + unread poll + ?chat deep link → Task 13
- Panel orchestrator (list/thread/new) → Task 14
- List view + preview + unread badge → Task 15
- New conversation picker → Task 16
- Thread view w/ realtime + typing + markRead → Task 17
- Composer w/ attachments + typing broadcast + 10MB cap + signed attachment GET → Task 18
- Header mount → Task 19
- Admin page + grid → Task 20
- SW deep-link → Task 21
- Deploy + sessions log → Task 22

**Placeholder scan:** No TBDs; concrete code in every file.

**Type consistency:**
- `canonicalPair` returns `{ userAId, userBId }` — used identically in `chat_permissions` queries and in UI toggle.
- `ChatMessage` fields (attachmentUrl / attachmentName / attachmentSize / attachmentMime / editedAt / deletedAt / createdAt) consistent across types.ts, send/edit/delete routes, realtime.ts row mapper, and UI rows.
- `isMigrationPending` / `isApiError` type guards used uniformly in UI.
- `CHAT_ATTACHMENT_MAX_BYTES` sourced from the same constant in composer client-check and in `upload-url` server-check.

**Known deferrals (acknowledged in spec):**
- Edit-grace-period: unbounded (any time) — simpler v1.
- Push body includes the first 80 chars literally (no name-vs-email branching beyond "A teammate" fallback).
- Conversation creation is two round-trips when there's a first message (openOrCreate → send). Acceptable; the UX is: pick user → opens empty thread → user types → sends. Not perceptible lag.
