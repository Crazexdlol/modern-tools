# Messages on Claims — Design Spec

**Date:** 2026-08-26
**Status:** Approved for implementation planning
**Follow-up:** implementation plan at `docs/superpowers/plans/2026-08-26-messages.md` (after this spec is approved).

## 1. Elevator pitch

Team communication on a claim. Every claim gets a **Messages tab** (chat-app style — chronological thread + composer at the bottom) that persists permanently on the claim, independent of who is assigned at any point in time. Users pick recipients when sending; recipients get a per-user unread count on a **Messages button** on the Dashboard that links to a queue of claims with unread messages. Opening a claim's Messages tab marks its thread as read for that user.

## 2. Locked-in decisions (from brainstorming Q&A)

| Question | Decision |
|---|---|
| Thread visibility | Anyone with claim access reads the whole thread. Recipients only control unread-queue notifications. |
| Who can send / receive | Peer-to-peer. Anyone with claim access can message anyone (with claim access). |
| Attachments | None in v1. Users drop files in Documents and reference them in the message body. URLs auto-linkify. |
| Composer UX | Chat-app style — composer fixed at bottom of the tab. Recipient picker defaults to the previous message's recipients (empty on first message). |
| Notifications | In-app only. No email in v1. |
| Message ordering | Chronological, oldest at top, newest at bottom. |
| Messages button placement | Dashboard, both roles. Sits next to Completed Assignments for admins; next to New Claim for appraisers. |
| Reassignment behavior | Complete thread preserved. New assignee sees full history. |

## 3. In scope / out of scope

### In scope (v1)
- Messages tab on the claim workspace (Claim Info | Documents | **Messages**).
- Send + list + mark-as-read.
- Recipients as an array of user ids captured at send time (names captured too, for stable rendering after a rename/deletion).
- Per-user unread state via a high-water-mark timestamp table (`message_reads`).
- Dashboard header button with per-user unread badge.
- `/messages` queue page listing claims with unread messages for the caller.
- URL auto-linkification in message bodies (so a Documents-tab link is clickable).
- Full server-side enforcement (RLS + API-route re-check) of visibility and send-permission.

### Out of scope (deferred)
- Editing or deleting messages (append-only).
- Threading / replies to a specific message.
- Reactions.
- Email notifications.
- Native file attachments (Documents tab covers files).
- Full-text search across messages.
- Message drafts.
- Push notifications.
- Read receipts (who read what, when — the reverse of unread state).
- @mentions in message body beyond the recipient picker.

## 4. Data model

### 4.1 `public.messages`

```sql
create table public.messages (
  id text primary key,
  claim_id text not null references acv_history(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete set null,
  sender_name text not null,              -- captured at send time so renamed/deleted senders still render sensibly
  recipient_ids uuid[] not null,          -- who gets an unread badge for this message
  recipient_names text[] not null,        -- captured at send time (same reasoning)
  body text not null,
  created_at timestamptz not null default now()
);

create index messages_claim_id_idx on public.messages(claim_id, created_at);
create index messages_recipient_gin on public.messages using gin(recipient_ids);
```

**Design notes:**
- `id text primary key` matches `acv_history` and `summaries` (existing convention: client-generated). Server generates via `crypto.randomUUID()`.
- `on delete cascade` on `claim_id` — deleting a claim removes its messages. Matches `documents` behavior in `acv_history.documents`.
- `sender_id`/`recipient_ids` FK is intentionally `on delete set null` (or lack of FK on the array elements). Names are captured at send time so history stays readable if a user is later deleted.
- `recipient_ids` as an array (with GIN index) rather than a join table. Simpler v1; both major queries (thread-for-claim and unread-count-for-user) run well on this shape. Can normalize to a join table later if needed.

### 4.2 `public.message_reads`

Per-user, per-claim high-water-mark. One row per (user, claim) pair the user has ever opened the Messages tab on.

```sql
create table public.message_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  claim_id text not null references acv_history(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, claim_id)
);
```

**Unread definition** for a given user:
```
messages WHERE user IS IN recipient_ids
        AND (
          no message_reads row for (user, claim)
          OR created_at > message_reads.last_read_at
        )
```

Marking as read = upsert `message_reads` with `last_read_at = now()`.

## 5. RLS policies

Uses the existing `is_admin()` helper from the role-based-access migration.

### 5.1 `messages` policies

```sql
alter table public.messages enable row level security;

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

-- UPDATE / DELETE: nobody. Append-only.
-- (No policies created for update/delete = default-deny.)
```

### 5.2 `message_reads` policies

```sql
alter table public.message_reads enable row level security;

-- All operations: your own row only.
create policy message_reads_self_all on public.message_reads for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
```

### 5.3 Reassignment safety (verified)

- `messages` and `message_reads` are keyed by `claim_id`, not by any assignment field.
- `/api/claims/[id]/assign` writes only to `acv_history.assigned_to`. Its transaction never touches `messages` or `message_reads`.
- There is no cascade rule between `assigned_to` changes and these tables.
- After reassignment, the new assignee's SELECT permission is granted the moment the `acv_history.assigned_to = auth.uid()` predicate flips true. They read the same thread the previous assignee saw.
- Confirmed structurally: it is impossible for a reassignment to hide, clear, or reset a claim's thread.

## 6. API surface

All routes: Node runtime; API-route also re-checks caller identity + claim access via a new `requireClaimAccess(claimId)` helper (patterned on `requireAdmin`).

| Route | Method | Purpose |
|---|---|---|
| `/api/claims/[id]/messages` | GET | Return the claim's thread, oldest → newest. |
| `/api/claims/[id]/messages` | POST | Send a message. Body: `{ recipientIds: string[], body: string }`. Server fills `sender_id = auth.uid()`, looks up sender name from `profiles`, looks up recipient names from `profiles` (must include only real profiles). |
| `/api/claims/[id]/messages/read` | POST | Upsert `message_reads` for (auth.uid(), claimId) with `last_read_at = now()`. |
| `/api/messages/queue` | GET | Return `[{ claimId, maNumber, insuredName, vehicle, unreadCount, lastMessageAt, lastMessageFrom }]` for the caller. Backs both the `/messages` page and the unread-count badge on the Dashboard header. Header just needs the sum of `unreadCount`. |

### 6.1 Helper: `requireClaimAccess(claimId)`

New file `src/lib/auth/require-claim-access.ts`:
```typescript
export async function requireClaimAccess(claimId: string): Promise<
  { caller: { userId: string; role: Role }; errorResponse: null }
  | { caller: null; errorResponse: NextResponse }
>
```
Uses the caller's session (not service role) — RLS enforces access, but the helper adds a friendly 403 vs. an empty-rowset silence.

### 6.2 Send-message body validation

- `body` — required, non-empty after trim, max 4,000 chars (enforced server + client).
- `recipientIds` — required, non-empty array, each entry a UUID that has a matching row in `profiles`. Validated against `profiles` via a single `select id, name, email from profiles where id in (...)`. Missing entries → 400 with which ids were unknown. Prevents typos + gives clear error.

## 7. UI surfaces

### 7.1 Messages tab (`src/components/claim/messages-tab.tsx`)

Full-height vertical layout:

**Top: thread header** (`h-10` fixed):
- Left: "N messages" count + refresh icon button.
- Right: nothing (yet).

**Middle: scrolling thread** (`flex-1 overflow-y-auto`):
- Each message rendered as a compact card:
  ```
  ┌─ Henry Aleksanyan → Bob Smith, Alice Chen · Aug 26, 3:12 PM ─┐
  │ Please pull the updated CCC estimate from Sedgwick and drop  │
  │ it in Documents. Thanks.                                     │
  └──────────────────────────────────────────────────────────────┘
  ```
- Sender + recipient names shown from the captured `sender_name`/`recipient_names` on the message row (not looked up fresh — allows for reads after user deletion / rename).
- Body: `white-space: pre-wrap` (preserves newlines) with `<Linkify>`-style URL detection (a small utility, not a library — regex on http(s):// and app-relative `/…` paths).
- Empty state: "No messages on this claim yet — start the thread below."

**Bottom: composer** (fixed at bottom):
- Recipient chip input — starts populated with the previous message's recipients (or empty on first send).
- Search-as-you-type over `fetchAllProfilesBrowser()` results. Click adds a chip; × removes.
- Auto-growing textarea (3-line minimum, `max-h-40`).
- "Send" primary button on the right. Disabled if body is empty or recipients is empty.
- Below on error: red inline banner with server's error message; textarea contents preserved so nothing is lost.

**On mount:** After the thread renders, POST to `/api/claims/[id]/messages/read`. Also invalidates the parent Dashboard's unread count (via a passed callback or refetch on Dashboard focus — see 7.3).

**On send:** POST → optimistically append to local list → refetch to get the server-authoritative row → auto-scroll to bottom.

### 7.2 Tab wiring (`src/components/claim/ClaimWorkspace.tsx`)

- Append to `CLAIM_TABS`:
  ```typescript
  { id: 'messages', label: 'Messages', step: 13 }
  ```
- Update `tabForStep`, `stepForTab` for step 13.
- Render conditional in the tab-content region:
  ```typescript
  {step === 13 && editingId && <MessagesTab claimId={editingId} />}
  ```
- **Read-only enforcement**: messaging is NOT gated by the workspace's `readOnly` state. Rationale: messages are meta-conversation about the claim (an appraiser might need to ask the admin a question AFTER submitting; the admin might need to leave notes on a closed claim). The Messages tab stays fully interactive even when other tabs are locked.

### 7.3 Header button (`src/app/page.tsx`)

New Messages button in the Dashboard header row, immediately to the left of Completed Assignments (admin) or to the left of New Claim (appraiser).

```
[💬 Messages (N)]  [📥 Completed Assignments (M)]  [+ New Claim]
```

- Icon: `MessageSquare` from lucide-react.
- Same styling class string as Completed Assignments: `bg-white border border-gray-200 hover:border-gray-300 text-gray-700 text-sm font-bold px-4 py-2.5 rounded-lg transition-colors shadow-sm`.
- N badge: same blue-circle style. Only shown when N > 0.
- Href: `/messages`.
- Visible to both roles.
- Count fetched on Dashboard load (part of the existing `load()` Promise.all).

### 7.4 Queue page (`src/app/messages/page.tsx` + client component)

- Any authed user (no admin guard).
- Fetch `/api/messages/queue` on mount.
- Render as a table:

  | Claim | Unread | Last message | Vehicle |
  |---|---|---|---|
  | MA123 · Bob Smith | 3 | Aug 26, 3:12 PM · Henry | 2019 Silverado |
  | MA124 · Alice Chen | 1 | Aug 26, 1:04 PM · Bob | 2020 Camry |

- Row click → `/claims/[id]?tab=messages`.
- Empty state: "No unread messages."
- Loading state: spinner in table area (like the other pages).
- Fetch error: red banner.

## 8. State handling

- **Empty thread**: composer visible, thread area shows "No messages yet — start the thread below."
- **Send failure**: composer body preserved, red inline banner with error, no message appended.
- **Long threads**: `overflow-y-auto` on thread; auto-scroll to bottom on mount + after send. Fixed composer stays visible.
- **Many recipients**: chip input wraps to multiple lines. Soft-warn at 20 recipients ("Sending to a lot of people — double-check the list"). No hard cap.
- **Rename / delete of a user**: existing messages continue to show the captured name. New messages show the current name.
- **Slow send**: Send button shows "Sending…" spinner and is disabled. Composer body remains editable during send in case the user wants to modify while waiting; on success, textarea clears.
- **Concurrent send**: two users sending at the same time is fine — each gets a distinct message row (independent IDs). Both appear when either user refetches.
- **User has no claim access but tries to POST**: RLS rejects with a Postgres error; API route catches and returns 403.

## 9. Migration + rollout

### 9.1 `supabase-migration-messages.sql`

- `create table public.messages (...)` with indexes.
- `create table public.message_reads (...)`.
- Enable RLS + policies on both.
- No data seed. No modifications to existing tables (they don't need to know about messages).
- Verification query at end:
  ```sql
  select 'messages exists' as label, count(*) as value from information_schema.tables where table_schema = 'public' and table_name = 'messages'
  union all
  select 'message_reads exists', count(*) from information_schema.tables where table_schema = 'public' and table_name = 'message_reads';
  ```
  Both should return 1.

### 9.2 `supabase-migration-messages-rollback.sql`

Drops policies, drops tables. No effect on any other data since messages tables are self-contained.

### 9.3 Rollout order

1. Henry runs the migration in Supabase SQL Editor.
2. Deploy code via `vercel --prod`.
3. Verify: send a message as admin to yourself → check that unread badge increments → open the tab → badge clears.

No new env vars.

## 10. Verification plan

Standing repo bar: `npx tsc --noEmit` + `npm run build` + `npm run lint` (no NEW warnings).

Manual smoke test (before claiming done):
- Send a message as admin to yourself → open queue page → see the claim → click → tab opens → badge clears.
- Send a message from admin to appraiser (from a claim assigned to that appraiser) → log in as appraiser (private window) → Dashboard badge shows unread → click Messages → queue lists the claim → open → thread visible with correct sender/recipients → tab open marks read → badge clears.
- Send a message from appraiser to admin → verify admin's badge increments.
- Reassign the claim to a different appraiser → new assignee opens Messages tab → sees the full thread (all messages before reassignment) → their unread count starts at whatever messages were addressed to them across the thread (which may be 0 if they were never a recipient).
- Try to POST to `/api/claims/[other-user's-claim]/messages` from a non-assignee appraiser → 403.
- Long thread (30+ messages) → auto-scroll and composer position both work.
- Send with empty body → button disabled.
- Send with no recipients → button disabled.

## 11. Risks & open questions

- **Read-only claim + messaging.** Decision (see §7.2): messaging stays active on submitted/closed claims. Rationale is meta-conversation about the work. If this proves noisy in practice, we gate it in v2 with a small conditional.
- **Marking messages read on tab open** — happens on mount. If a user opens the tab, doesn't read carefully, and closes, it's still marked read. Same behavior as most email/chat UIs; accepted.
- **User rename** — captured names go stale in message history. Acceptable per §8.
- **Message body size** — 4,000 char cap is arbitrary. Well below Postgres text field limits; long enough for any real message.
- **Notifications-in-app-only** — if Henry travels or is away from the tool for days, unread count sits and grows silently. Email invites/notifications are the natural v2.
- **Recipient dropdown vs. account list** — right now the client will show ALL profiles (from `fetchAllProfilesBrowser`). Some of those profiles may not have access to THIS claim. Server-side validation at send-time accepts any profile id (recipient just wouldn't see the unread badge if they don't have claim access — SELECT policy blocks their fetch). If we want to filter the client dropdown to only "users with plausible access," that's a small enhancement. Deferred.

## 12. Alternatives considered

- **Messages as jsonb on `acv_history`** — rejected. Grows unboundedly, requires rewriting the whole array on every send (race-prone), and can't be indexed for per-user unread counts.
- **Join table `message_recipients (message_id, user_id)`** — cleaner normalization but more RLS to write and two round-trips per message. Rejected for v1; can migrate later without changing the API.
- **Per-message read receipts (`message_reads (message_id, user_id, read_at)`)** — much bigger table (one row per message per recipient), enables "who has read this message" analytics we don't need. Rejected.
- **`overflow-x-auto` on the thread** — not applicable; thread is vertical.
- **Client-side push updates (Supabase Realtime)** — deferred. Polling / refetch-on-tab-focus is sufficient for the current team size. Add Realtime if the team grows.
- **File attachments in v1** — rejected per Henry's answer. Documents tab is the source of truth for files.

## 13. Sequencing (for the plan phase)

Rough order the plan will use:
1. Migration SQL + rollback.
2. `src/lib/auth/require-claim-access.ts` helper.
3. `src/lib/supabase/messages.ts` — types + client helpers (fetch thread, send, mark-read, fetch queue, fetch unread count).
4. Three API routes (GET/POST messages, POST read, GET queue).
5. `src/components/claim/messages-tab.tsx` — thread + composer + recipient picker + URL linkifier.
6. `ClaimWorkspace.tsx` — wire the new tab (append to `CLAIM_TABS`, `tabForStep`, `stepForTab`, render conditional).
7. `src/app/messages/page.tsx` — queue page.
8. `src/app/page.tsx` — Dashboard header button + unread count fetch.
9. Verify + deploy.
