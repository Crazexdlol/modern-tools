# HamsPortal Reminders — Design Spec

**Date:** 2026-10-03
**Author:** Henry (via Claude Code brainstorming)
**Status:** Approved by Henry — ready for implementation plan

---

## Goal

Give every appraiser and admin a self-serve way to schedule reminders in HamsPortal — set a note + a time + delivery channels (in-app popup, browser push, email), optionally link the reminder to a claim, optionally recur. Appraisers can remind themselves and admins; admins can remind anyone (individuals or group chips). Reminders live on the dashboard page.

## Non-goals

- SMS delivery (push + email covers the gap; SMS adds vendor cost + opt-in friction).
- Reply-to-a-reminder-with-a-note (future).
- Reminder templates / saved presets.
- iOS Safari push (requires PWA install — out of scope for v1).
- Cross-reminder threading or conversation UI.

## Scope summary

| Area | Decision |
|---|---|
| What a reminder is | Note (text) + fire time + optional claim link + optional recurrence + delivery channels |
| Who can target whom | Appraisers → self + admins only. Admins → anyone + "All appraisers" / "All admins" groups. |
| Channels | Per-reminder choice at creation (any combination of in-app popup / browser push / email) |
| In-app firing | Toast popup bottom-right when recipient is on HamsPortal; stacks on multi-fire; no auto-dismiss |
| Recurrence | Daily / Weekly / Monthly with optional end date |
| Lifecycle | `scheduled → fired → acknowledged \| snoozed \| dismissed` |

---

## 1. UX — Dashboard sidebar

A ~260px panel on the right side of `/` (the dashboard page `src/app/page.tsx`). The existing claims table shrinks to accommodate; on viewports narrower than ~1100px the sidebar collapses to a full-width panel below the table.

**Sidebar contents:**

- Header row: `🔔 Reminders` title + count badge of upcoming (status = scheduled, fire_at > now()).
- Primary CTA button: `+ New reminder`.
- Three tabs inside the panel:
  - **Upcoming** (default) — pending reminders sorted ascending by `fire_at`, grouped under section headers: `Today`, `Tomorrow`, `This week`, `Later`.
  - **Sent** — reminders the current user created for someone other than themselves (i.e. `created_by = me AND target_user_id != me`). Shown to anyone who has sent a reminder to another user (appraisers see admins they've pinged; admins see anyone they've queued).
  - **Done** — recently acknowledged or dismissed reminders where the user is the recipient (`target_user_id = me AND status in ('acknowledged','dismissed')`). The cron tick (section 5) is also responsible for a daily prune pass: delete rows where `status in ('acknowledged','dismissed')` AND `COALESCE(acknowledged_at, fired_at) < now() - interval '30 days'`.
- Each row: fire time (relative — `in 2h`, `tomorrow 9am`) + first ~60 chars of note + claim badge if linked + hover kebab for Edit / Delete.

**Fire-time toast popup** (separate from the sidebar, triggered by Supabase realtime):

- Toast-style notification stuck to the bottom-right of the viewport.
- Shows the note + fire time + claim badge if linked.
- Buttons: `Open Claim` (if `claim_id` set) · `Snooze ▾` (menu: 10 min / 1 hour / Tomorrow 9am / Custom…) · `Done`.
- No auto-dismiss. Reminder sticks until the user acts on it (acknowledge, snooze, or dismiss).
- Multiple simultaneous fires stack vertically with slight offset.

## 2. UX — Create reminder sheet

Clicking `+ New reminder` opens a right-side sheet (same pattern as `src/components/claim/assignment-sheet.tsx`) with these fields:

| Field | Required | Behavior |
|---|---|---|
| Who | Yes | User picker. Appraisers see "Myself" + list of admins. Admins see all users + two group chips: "All appraisers" and "All admins". Multi-select allowed; group chips expand on insert. |
| What | Yes | Textarea (3 rows, autoexpand). Max 1000 chars. |
| When | Yes | Native datetime picker + quick chips above it: `In 1h`, `In 4h`, `Tomorrow 9am`, `Next Monday 9am`, `Custom…`. Chips just prefill the picker. Chip-computed times resolve in the recipient's local timezone (`Intl.DateTimeFormat().resolvedOptions().timeZone`) — if the admin is in PT and schedules "Tomorrow 9am" for a recipient they don't share a timezone with, the chip still means 9am in the admin's local time; recipients see the fire time rendered in their own local timezone. We don't attempt per-recipient-timezone resolution in v1. |
| Repeat | No | Dropdown: None (default) / Daily / Weekly / Monthly. If not None, show optional end-date picker. |
| Link to claim | No | Autocomplete over the current user's visible claims (MA# + insured name + vehicle). |
| Channels | At least one must be checked | Three checkboxes: `In-app popup` (default on), `Browser push`, `Email`. First time the user checks `Browser push`, prompt for Notification permission inline. |

Submit creates one row per recipient in the `reminders` table.

## 3. UX — Admin reminders management

No separate admin page in v1. Admins can:

- See reminders they created for others under the sidebar `Sent` tab.
- Edit or delete any reminder (via row kebab) they created.
- There is no "view everyone's reminders" surface — reminders are private between creator and recipient, enforced by RLS.

## 4. Data model

### Table `reminders`

```sql
create table public.reminders (
  id              uuid primary key default gen_random_uuid(),
  created_by      uuid not null references public.profiles(id) on delete cascade,
  target_user_id  uuid not null references public.profiles(id) on delete cascade,
  note            text not null check (char_length(note) between 1 and 1000),
  fire_at         timestamptz not null,
  claim_id        text null references public.acv_history(id) on delete set null,
  recurrence      jsonb null,          -- { freq:'daily'|'weekly'|'monthly', interval:int, end_at:timestamptz|null }
  channels        jsonb not null
                      check (
                        (channels ? 'in_app' and channels ? 'push' and channels ? 'email')
                        and ((channels->>'in_app')::bool
                             or (channels->>'push')::bool
                             or (channels->>'email')::bool)
                      ),
  status          text not null default 'scheduled'
                      check (status in ('scheduled','fired','acknowledged','snoozed','dismissed')),
  fired_at        timestamptz null,
  acknowledged_at timestamptz null,
  snoozed_until   timestamptz null,
  created_at      timestamptz not null default now()
);

-- Core index: dashboard sidebar query for "my upcoming" and the cron worker's "due now" scan.
create index reminders_target_status_fire_at_idx
  on public.reminders (target_user_id, status, fire_at);

-- Cron worker scans this subset.
create index reminders_due_idx
  on public.reminders (fire_at)
  where status = 'scheduled';

-- Group-targeted fan-out: one row per recipient. No separate groups table in v1.
```

### Table `push_subscriptions`

```sql
create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  endpoint    text not null,
  p256dh      text not null,          -- client public key
  auth        text not null,          -- auth secret
  user_agent  text null,
  created_at  timestamptz not null default now(),
  unique (user_id, endpoint)
);
```

### RLS

**`reminders`:**

- `SELECT`: `target_user_id = auth.uid() OR created_by = auth.uid()`.
- `INSERT`: `created_by = auth.uid()` AND either:
  - caller is admin (via existing `public.is_admin()`), OR
  - `target_user_id = auth.uid()` (self-reminder), OR
  - `target_user_id` has `role = 'admin'` (appraiser pinging an admin).
  - Enforced via trigger function because the row-level `with check` needs to look up `profiles.role` of the target.
- `UPDATE`: the recipient can transition `status` from `fired → acknowledged/snoozed/dismissed` and set `snoozed_until`. The creator (or admin) can edit `note`, `fire_at`, `claim_id`, `recurrence`, `channels` only while `status = 'scheduled'`.
- `DELETE`: creator or admin.

**`push_subscriptions`:**

- `SELECT`/`INSERT`/`DELETE`: `user_id = auth.uid()`. The cron worker reads this table via service-role bypass.

## 5. Firing worker

Vercel Cron hits `POST /api/reminders/tick` every 60 seconds. Handler:

```
1. Query `reminders` where status='scheduled' and fire_at <= now(). Service-role client (bypasses RLS).
2. For each row:
   a. If recurrence is set: compute next_fire_at from (fire_at, recurrence). If next_fire_at <= recurrence.end_at (or end_at is null),
      insert a fresh scheduled row for the same target with fire_at = next_fire_at.
   b. Update the current row: status='fired', fired_at=now().
   c. If channels.email: enqueue an email via Resend to the target's email (one call per reminder).
   d. If channels.push: look up all push_subscriptions for target_user_id, send a web-push payload to each. 410 Gone / 404 responses prune the dead subscription.
   e. If channels.in_app: no server work — the recipient's dashboard is subscribed to Supabase realtime on `reminders` filtered to their user_id, and the toast component mounts on new `status='fired'` events.
3. Return { fired: N, errors: [...] }.
```

**Idempotency:** the cron is at-least-once. The `scheduled → fired` transition is a conditional UPDATE (`WHERE id = ? AND status = 'scheduled'`), so a double-tick cannot double-send. Email and push side-effects run only when the UPDATE affects a row.

**Latency:** worst-case fire latency is ~60s (cron cadence) plus however long the handler takes. Acceptable for a reminder tool. If sub-minute latency is ever needed, swap to a pg_notify + persistent listener architecture.

## 6. Browser push

- VAPID keypair generated once at setup. Public key exposed as `NEXT_PUBLIC_VAPID_PUBLIC_KEY`; private key in `VAPID_PRIVATE_KEY` env var (Vercel).
- Service worker at `public/sw.js` registers on first visit after Notification permission is granted. The worker listens for `push` events and renders the notification via `self.registration.showNotification(...)`.
- Opt-in prompt lives in the create-reminder sheet the first time a user checks "Browser push". If permission is denied, the checkbox is disabled with a tooltip.
- Push payload is `{ title, body, url }`. Clicking the notification opens `url` in a focused HamsPortal tab (new tab if none is open).

## 7. Email delivery

- Provider: Resend (clean API, free tier covers expected volume; new env var `RESEND_API_KEY`).
- From address: `reminders@hamsportal.com` (or whichever verified sender Henry wires up).
- Template: plain-text + minimal HTML with the note, fire time, and (if claim-linked) a deep link to the claim workspace. No branded template in v1.
- Failures logged to the response of `/api/reminders/tick` but do not block other rows in the same batch.

## 8. File / route layout

```
src/app/api/reminders/
  route.ts                       GET (my upcoming + sent + done) · POST (create)
  [id]/route.ts                  PATCH (edit if scheduled; snooze/ack/dismiss if fired) · DELETE
  tick/route.ts                  POST (cron worker; service-role protected)
  push-subscribe/route.ts        POST (store a push_subscriptions row) · DELETE (unsubscribe)

src/components/reminders/
  reminders-sidebar.tsx          mounts on /
  reminder-row.tsx               one row in the Upcoming/Sent/Done lists
  create-reminder-sheet.tsx      the right-side create form
  reminder-toast.tsx             the fire-time popup; mounted globally in layout.tsx
  reminders-realtime-provider.tsx  Supabase realtime subscription + toast queue

src/lib/reminders/
  types.ts                       Reminder, Recurrence, Channels types
  recurrence.ts                  computeNextFire(fireAt, recurrence)
  push.ts                        VAPID + web-push helpers (server-side)

public/sw.js                     service worker (push listener + notification click handler)

supabase/
  migration-reminders.sql        reminders + push_subscriptions tables + RLS + indexes
  migration-reminders-rollback.sql
```

## 9. Env vars

New required vars (both Vercel + `.env.local`):

- `RESEND_API_KEY`
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `REMINDERS_CRON_SECRET` (shared secret header the Vercel Cron sends; `/api/reminders/tick` rejects unauthenticated calls)

Cron config in `vercel.json`:

```json
{
  "crons": [{ "path": "/api/reminders/tick", "schedule": "* * * * *" }]
}
```

## 10. Rollout plan (preview — the implementation plan expands on this)

1. Migration (`migration-reminders.sql`) applied in Supabase.
2. Env vars added in Vercel.
3. Backend routes shipped (API + cron), but no UI yet — can smoke-test with `curl`.
4. Dashboard sidebar + create sheet shipped.
5. Toast + realtime shipped.
6. Push + email channels wired up (service worker + Resend).
7. Dogfood for a day; iterate.

## 11. Open questions (none blocking)

- Does Henry want the sidebar visible for all users immediately on deploy, or behind a feature flag during the first dogfood day? Default: ship visible, roll back fast if broken.
- Should push notifications respect quiet hours (e.g., no push between 9pm and 7am)? Default: no — users control via their OS DND. Can add later.
- Should admins have an "edit reminders for anyone" surface? Not in v1 — creator-only editing. Can add if demand surfaces.
