# Chat system (1:1 v1) — design

**Date:** 2026-10-27
**Status:** Design approved; implementation plan pending
**Scope:** v1 ships 1:1 user-to-user chat with permission matrix, admin override, realtime, push, attachments, edit/delete own messages, and typing indicators. Group chat deferred to v2.

## Problem

HAMS appraisers need to chat with each other and with admins without leaking the entire user roster to every user. Today there's no user-to-user messaging — the existing `messages` table is strictly claim-scoped (comments attached to a specific claim), unsuitable for private threads unrelated to claim work.

Business constraints:
- An appraiser must not be able to see other appraisers unless an admin has granted them a chat permission.
- Admins must be able to message anyone and must see every user.
- Group chat is a near-future need but out of v1 scope.

## Goals

- 1:1 real-time chat between users where both parties have an explicit permission grant (or at least one side is an admin).
- Admin-managed symmetric pair permissions, editable via a grid-style admin page.
- Chat UI entry point in the global app header next to the Reminders bell.
- Side-sheet panel UI, conversation list → thread view.
- Attachments (one per message, 10 MB cap, any file type) stored in a dedicated Supabase storage bucket.
- Push notifications to recipients whose tab is backgrounded, reusing the existing service-worker + `push_subscriptions` infra.
- Typing indicators via Supabase broadcast channels (ephemeral).
- Edit + soft-delete your own messages; `edited_at` and `deleted_at` columns drive the UI.
- Hybrid realtime strategy: 10-second poll for the unread badge; Supabase postgres_changes subscription only while a conversation thread is open.

## Non-goals (v1)

- Group chat.
- Online status indicator (red/green dots). Not wanted at all per Henry 2026-10-27.
- Read receipts / "seen" markers.
- Admin-delete-anyone-else's-message (admins can't moderate v1).
- Full-text message search.
- Message reactions, threaded replies, pinned messages, @mentions.
- Mute / quiet hours per conversation.
- Any change to the existing claim-scoped `messages` + `message_reads` tables.
- Media preview beyond the browser's default (no in-chat image lightbox, no PDF inline viewer).

## Data model

New tables, all with `chat_` prefix to make it clear they're separate from the existing claim-scoped `messages` table. Zero FKs between the two systems.

### `chat_conversations`

Conversation metadata.

```sql
create table chat_conversations (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('direct', 'group')) default 'direct',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

- `type` always `'direct'` in v1. Allowed values include `'group'` so v2 adds group chats without migration.
- `updated_at` is bumped on every new message (via trigger or in the send path) and drives the conversation-list sort.

### `chat_conversation_members`

Participants. Exactly 2 rows per direct conversation; N rows per group in v2.

```sql
create table chat_conversation_members (
  conversation_id uuid references chat_conversations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  primary key (conversation_id, user_id)
);

create index on chat_conversation_members(user_id);
```

- `last_read_at` is the per-user high-watermark for unread count.

### `chat_messages`

```sql
create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references chat_conversations(id) on delete cascade not null,
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

create index on chat_messages(conversation_id, created_at);
```

- `body` defaults to empty string so an attachment-only message is valid.
- `deleted_at` soft-deletes; `body`/`attachment_*` can be nulled by the delete path or preserved — UI treats `deleted_at IS NOT NULL` as "(deleted)".
- `sender_id ON DELETE SET NULL` so a decommissioned auth user doesn't cascade-nuke their history.

### `chat_permissions`

```sql
create table chat_permissions (
  user_a_id uuid references auth.users(id) on delete cascade,
  user_b_id uuid references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id) on delete set null,
  primary key (user_a_id, user_b_id),
  check (user_a_id < user_b_id)
);
```

- Canonical ordering (`user_a_id < user_b_id`) guarantees one row per unordered pair.
- All insert/update paths MUST canonicalize before writing.

### Storage bucket

- Name: `chat-attachments`
- Private.
- Path shape: `<conversation_id>/<message_id>/<filename>`.
- Policies: authenticated user; must be a member of the referenced conversation to upload or read. UPDATE/DELETE: sender only.

## Access control

### RLS policies

- **`chat_conversations` SELECT:** `exists (select 1 from chat_conversation_members m where m.conversation_id = chat_conversations.id and m.user_id = auth.uid())`.
- **`chat_conversation_members` SELECT:** `user_id = auth.uid() OR exists (select 1 from chat_conversation_members m where m.conversation_id = chat_conversation_members.conversation_id and m.user_id = auth.uid())`.
- **`chat_conversation_members` UPDATE:** `user_id = auth.uid()` — restricted to `last_read_at` column via policy / trigger.
- **`chat_messages` SELECT:** `exists (select 1 from chat_conversation_members m where m.conversation_id = chat_messages.conversation_id and m.user_id = auth.uid())`.
- **`chat_messages` INSERT:** `sender_id = auth.uid() AND exists (select 1 from chat_conversation_members m where m.conversation_id = chat_messages.conversation_id and m.user_id = auth.uid())`.
- **`chat_messages` UPDATE:** `sender_id = auth.uid()` — intended for edits/soft-deletes.
- **`chat_messages` DELETE:** no policy (default-deny; delete is modeled as `deleted_at` update, not row removal).
- **`chat_permissions` SELECT:** `user_a_id = auth.uid() OR user_b_id = auth.uid() OR is_admin()` — users see their own permission rows so they can resolve "who can I chat with"; admins see all.
- **`chat_permissions` INSERT / UPDATE / DELETE:** `is_admin()` only (super_admin check via existing `public.is_admin()`).

### Server-mediated conversation creation

Creating a new conversation goes through `POST /api/chat/conversations` (not direct insert). The server enforces:

```
caller is admin
  OR counterparty is admin
  OR a chat_permissions row exists between caller and counterparty
```

RLS alone cannot easily express the "counterparty is admin" branch, so the server is the source of truth for the create gate. Inserts hit the DB through the service-role client to bypass RLS when the gate passes.

If a conversation already exists between the pair (direct type), the endpoint returns that one instead of creating a duplicate — idempotent by `(type='direct', member pair)`.

### Permission revocation semantics

- Revoking a permission row **blocks new conversations** between the pair and **blocks new messages** on any existing conversation (via server-side check in `/api/chat/send`).
- Existing message history remains visible to both parties — we don't scrub history.
- The "new chat" picker no longer surfaces the other user.
- Push notifications don't fire for revoked pairs (the send path short-circuits before publishing).

## API surface

All server-side under `src/app/api/chat/`:

- `GET /api/chat/conversations` — the caller's conversation list with latest message preview + unread count per conversation.
- `POST /api/chat/conversations` — create or return existing direct conversation with `{ otherUserId }`. Enforces permission gate.
- `GET /api/chat/conversations/[id]/messages?before=<iso>&limit=50` — paginated history, newest-first.
- `POST /api/chat/send` — body `{ conversationId, body?, attachment? }`. Writes `chat_messages`, bumps `chat_conversations.updated_at`, triggers push to the other member.
- `PATCH /api/chat/messages/[id]` — edit own message body. Sets `edited_at`.
- `DELETE /api/chat/messages/[id]` — **soft** delete; the handler executes an UPDATE setting `deleted_at = now()` on the sender's own message. No actual row removal (keeps thread timestamps intact and makes the "(deleted)" placeholder trivial). RLS DELETE policy on `chat_messages` is left absent/default-deny on purpose.
- `POST /api/chat/mark-read` — bumps `chat_conversation_members.last_read_at` for the caller on `{ conversationId }`.
- `GET /api/chat/unread-count` — single-integer response. Called by the header poll.
- `GET /api/chat/contacts` — the users this caller is allowed to start a conversation with (permission rows + admin bypass). Returns `[{ id, name, email, role }]`.
- `GET /api/admin/chat-permissions` — admin only; returns all users + all permission edges.
- `POST /api/admin/chat-permissions` — admin only; `{ userAId, userBId, allow: boolean }` toggles a row (canonicalized server-side).

## Realtime

### Open-thread subscription

While a conversation thread is OPEN in the panel:

```ts
const channel = supabase
  .channel(`chat:conv:${conversationId}`)
  .on('postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `conversation_id=eq.${conversationId}` },
    (payload) => { /* append to local state */ })
  .on('postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter: `conversation_id=eq.${conversationId}` },
    (payload) => { /* replace local message by id */ })
  .subscribe()
```

Unsubscribed on thread close / panel close / navigation.

### Unread badge

Simple poll: `GET /api/chat/unread-count` every 10s while the tab is foregrounded. Matches the Reminders pattern (`src/components/reminders/reminders-header-button.tsx`).

### Typing indicators

Supabase broadcast channel per conversation: `chat:typing:<conversation_id>`.

- On keystroke in composer (throttled to one broadcast per ~1.5s), send `{ typing: true, userId }`.
- Receivers show "Alex is typing…" above the composer; auto-clears after 3 seconds without a refresh.
- Not persisted. Not visible to users not in the thread.

### Push notifications

- `/api/chat/send` writes the message row, then calls into the existing push helper (`src/lib/reminders/push-send.ts` or sibling — same `push_subscriptions` table) targeting the OTHER conversation member.
- Payload: `{ title: 'New message from <SenderName>', body: '<first 80 chars of message or [Attachment]>', icon: '/icon.png', data: { url: '/?chat=<conversation_id>' } }`.
- Service worker's existing push handler (`public/sw.js`) opens the stored URL on click. We'll extend it to recognize the `chat=<id>` query and open the panel to that conversation. No new SW file.
- Push is skipped when:
  - Recipient has no push subscription.
  - Permission was revoked between message send and push dispatch (last-second gate).
  - Sender === recipient (never happens, but defensive).

## UI

### Global header button

New file `src/components/chat/chat-header-button.tsx`.

- Mounted in `src/components/app-header.tsx` right after `<RemindersHeaderButton />`.
- Icon: lucide `MessageCircle`.
- Unread count badge in the same style as the Reminders bell.
- Click → opens the chat side-sheet (shadcn `Sheet` from the right, ~500px wide).

### Side-sheet panel

Two internal views in one component (`src/components/chat/chat-panel.tsx`):

1. **Conversation list** (default). Scrollable. Each row:
   - Counterpart's name (and avatar initials)
   - Last message preview (sender initial + first ~50 chars, or `[Attachment]`)
   - Timestamp (relative: `now`, `5m`, `2h`, `Mon`, `Oct 24`)
   - Unread dot + bold styling if `last_message.created_at > last_read_at`
   - Click → thread view

   Top strip: "Chat" title, close X, `+` button to start a new conversation.

   `+` opens an inline user picker that calls `GET /api/chat/contacts` — admin sees everyone; appraisers see only permitted partners.

2. **Thread view** (replaces list when a conversation is active).
   - Back-arrow top-left returns to list.
   - Thread name (counterpart) + optional X at top.
   - Scrollable message area (newest at bottom, auto-scroll on new).
   - Each own-message bubble has a hover menu (⋯) with Edit / Delete.
   - Edited messages show `(edited)` after the timestamp.
   - Deleted messages show a muted `(deleted)` placeholder; still occupy a row.
   - Composer pinned to bottom: textarea (Enter sends, Shift+Enter newline), paperclip for attachment, send button.
   - Attachment preview appears above composer once chosen; X to clear before send.
   - "Alex is typing…" line above composer when active.

### Admin matrix page

New route `/admin/settings/chat-permissions`:

- Page title "Chat Permissions".
- Grid: rows = users (name col-locked on left), cols = users (name header row). Diagonal disabled.
- Admin rows + admin cols rendered pre-checked and grayed out (always allowed).
- Click a cell → optimistic toggle + `POST /api/admin/chat-permissions`.
- Rollback on error with an inline toast.
- Visible only to super_admin (consistent with other `/admin/settings/*` pages).

### Nav + badge integration

- The header unread badge is driven by `/api/chat/unread-count` polled every 10s.
- When the panel opens on a conversation, that conversation's `last_read_at` is bumped by `POST /api/chat/mark-read` (fire-and-forget).

## Attachments

- Composer paperclip opens a native file picker.
- One file per message. If the user tries a second file, the first is replaced.
- Size cap enforced client-side AND server-side: **10 MB**.
- All MIME types allowed (no deny list v1).
- Upload flow (resolves the chicken-and-egg between "need message_id for the storage path" and "message_id is produced by insert"):
  1. Client generates a client-side UUID for the pending message (`crypto.randomUUID()`).
  2. Client requests a signed upload URL from `POST /api/chat/upload-url` with `{ conversationId, messageId, filename }`. Server returns a signed PUT URL scoped to `chat-attachments/<conversationId>/<messageId>/<filename>` with ~5 min TTL.
  3. Client PUTs the file.
  4. Client calls `/api/chat/send` with `{ id: messageId, conversationId, body, attachment: { url, name, size, mime } }`. Server INSERTs with the pre-generated id so the storage path matches the row.
- `chat_messages.id` default (`gen_random_uuid()`) is retained for the attachment-less path; INSERT accepts a client-supplied id so the attachment path can pre-register it.
- Download: thread view fetches signed URLs via another small endpoint on demand (short TTL).

## Code organization

```
src/
  components/
    chat/
      chat-header-button.tsx       — bell-style trigger
      chat-panel.tsx                — side sheet, dispatches list vs thread
      chat-conversation-list.tsx    — list view
      chat-thread-view.tsx          — thread view
      chat-composer.tsx             — composer + paperclip + typing broadcast
      chat-new-conversation.tsx     — user picker launched from "+"
  lib/
    chat/
      types.ts                      — Conversation, Message, Contact interfaces
      api.ts                        — client-side fetch helpers (listConversations, send, …)
      realtime.ts                   — subscribe/unsubscribe helpers for Supabase channels
      push.ts                       — server-side push notification helper (chat flavor)
  app/
    api/
      chat/
        contacts/route.ts
        conversations/route.ts
        conversations/[id]/messages/route.ts
        send/route.ts
        messages/[id]/route.ts
        mark-read/route.ts
        unread-count/route.ts
        upload-url/route.ts
      admin/
        chat-permissions/route.ts
    admin/
      settings/
        chat-permissions/
          page.tsx
          chat-permissions-client.tsx
```

`chat-panel.tsx` keeps state and routing between list/thread views; `chat-conversation-list.tsx` / `chat-thread-view.tsx` are pure presentation. `chat-composer.tsx` owns its own state (draft text + attachment) and emits send events. Each file stays small; the panel orchestrates.

## Migrations

Two migrations (one for tables + RLS, one for storage bucket). Each with its own rollback.

- `supabase/migration-chat.sql` — creates the four tables, enables RLS, installs policies. Idempotent (`create table if not exists`, `create index if not exists`, `drop policy if exists` before create).
- `supabase/migration-chat-rollback.sql` — drops tables (cascades to indexes and policies).
- `supabase/migration-chat-storage.sql` — creates the `chat-attachments` bucket + its policies via Supabase storage schema. Idempotent.
- `supabase/migration-chat-storage-rollback.sql` — deletes the bucket.

Deploy order: code first (tolerates missing tables with 42P01 → empty state), migrations second, then feature becomes usable.

## Pre-migration behavior

- Header button renders disabled with a tooltip "Chat requires migration".
- `/admin/settings/chat-permissions` renders an empty state with a one-line setup instruction.
- No crashes. No console errors beyond a single warn log per API call that hits a missing table.
- Specifically: every GET endpoint under `/api/chat/*` catches 42P01 (undefined_table) and returns `{ data: [], migrationPending: true }`. The UI reads `migrationPending` to render disabled states.

## Deploy sequence

1. Ship the code. All features gated by `migrationPending` flag return empty data; UI shows disabled state.
2. Henry runs `supabase/migration-chat.sql` in Supabase SQL editor.
3. Henry runs `supabase/migration-chat-storage.sql`.
4. Admin visits `/admin/settings/chat-permissions`, grants a pair.
5. The two paired users refresh their tabs; chat panel is live.

## Verification plan

- `npx tsc --noEmit` clean.
- `npm run build` clean.
- With no permission grant between Alex and Casey: "+" picker does not surface the other; direct URL to a hypothetical conversation returns 404.
- With permission grant Alex↔Jordan: either can start a conversation. Alex sends → Jordan receives in <1 s with thread open.
- Admin: picker shows every user. Admin ↔ non-admin works both directions without a permission row.
- Push: Jordan backgrounds tab. Alex sends. Jordan's device gets a push. Click → opens the panel on that conversation.
- 10 MB image attachment: uploads, previews, downloads via signed URL. 11 MB file: rejected client-side with a toast.
- Edit own message: body updates in both sides' views; `(edited)` tag appears.
- Delete own message: both sides see `(deleted)` placeholder; row still occupies the thread.
- Permission revoke mid-thread: existing messages visible to both; new sends return 403; picker no longer surfaces the other.
- Typing indicator: Alex types; Jordan sees "Alex is typing…"; Jordan stops seeing it 3 s after Alex pauses.
- Pre-migration: deploy to prod with no SQL run; chat button renders disabled; admin page shows empty state; no console errors beyond `migrationPending` logs.
- Zero regressions: open an existing claim, submit a claim-scoped message, verify unread badge on dashboard + `/messages` queue + `/claims/[id]` thread all still work exactly as before.

## Open questions deferred to the implementation plan

- Edit grace period: unbounded for v1 (any time) vs. 15 minutes. Implementation plan picks one.
- Exact wording of push notification title/body if the sender has a display name vs. only an email.
- Whether to batch-insert a conversation + first message in one server call, or two round-trips.
