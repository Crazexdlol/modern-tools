# Negotiations: Auto-link, Multi-chain, and Sender Muting

**Date:** 2026-10-01
**Status:** Draft — awaiting Henry's review
**Scope:** `src/lib/negotiations/*`, `src/app/negotiations/*`, one new SQL migration

## Problem

Three distinct pain points in today's Negotiations tab:

1. **Auto-link fails on common subject formats.** Even when the opposing-appraiser email subject contains both the MA# and the carrier claim #, the matcher asks Henry to link manually. Confirmed cases:
   - `MA# 3950817` — the current regex (`/\bMA[\s\-]?\d{3,8}\b/i`) doesn't accept `#` between `MA` and the digits, so no identifier is extracted at all.
   - `CL# 4683005` — `CL#` isn't a recognized claim-number label (regex only looks for `claim` / `file` tokens).
   - `Claim # CA0021715171-02` — the identifier IS extracted, and the claim exists in HamsPortal with the exact matching value, but the thread was processed once, classified, matched nothing (likely a pre-fix snapshot), and `process.ts` never retries once `classification IS NOT NULL`. The matcher is one-shot.
   - Subject prefixes like `[SPAM] Re: [SPAM] ...` could further corrupt extraction.
   - Carrier claim numbers vary in digit count: HamsPortal might store `CA0021715171` while the email uses `CA0021715171-02`. Current matcher requires strict jsonb equality, so same-claim-with-suffix is missed.

2. **One claim can have multiple email chains, and they all collide in the list.** The schema already supports it (`negotiation_cases.thread_id` is unique but `claim_id` is not), but `negotiations-client.tsx` lists threads flat with no claim grouping. When an opposing appraiser opens a new chain mid-negotiation, Henry sees two separate rows and has to mentally reconcile them.

3. **Automated no-reply senders slip past the "automated" classifier.** The `AUTOMATED_SENDER_PATTERNS` catches `no-reply@`, `notification@`, `mailer-daemon@` and similar tokens — but `moderngroupinc@claimleader.com` has none of those tokens and comes through as a real "needs response" thread. There's no persistent way to add specific senders without touching regex code.

## Goals

- Any email whose subject contains a recognizable MA# or carrier claim # that resolves to a HamsPortal claim auto-links on first processing.
- A single claim with N chains shows as one entry in the triage list, with each chain kept visually separate inside.
- Henry can mute a specific sender (or whole domain) in one click; future emails from that sender bypass the triage queue entirely.
- No regression on multi-company RLS: all new tables scoped through `has_negotiations_access()` plus `active_company_id()` where claim-bound.

## Non-goals

- No LLM-based disambiguation (Phase 4 territory — matcher stays deterministic).
- No changes to IMAP sync behavior, folder selection, or spam folder reading.
- No cross-claim thread moves or splitting; cases remain thread-scoped.
- No changes to how `ma_number` or `claim.claimNumber` are stored. We adapt the matcher to the data, not the reverse.

## Design

### 1. Matcher improvements — `src/lib/negotiations/classify.ts` + `src/lib/negotiations/match.ts`

**Subject normalization** (new helper in `classify.ts`, applied before identifier extraction):
- Strip leading/trailing noise prefixes: `[SPAM]`, `[External]`, `[EXTERNAL]`, `Re:`, `RE:`, `Fwd:`, `FW:`, repeating any number of times. Simple regex loop until the subject stabilizes.

**Expanded identifier regexes:**
- `MA_REGEX`: `/\bMA[\s\-#:.]*\d{3,8}\b/gi` — allows `#`, `:`, `.`, and multiple joining chars between `MA` and the digits. Covers `MA3950817`, `MA 3950817`, `MA-3950817`, `MA#3950817`, `MA# 3950817`, `MA:3950817`.
- `CL_REGEX`: `/\bCL[\s\-#:.]*(\d{4,15})\b/gi` — same shape but for carrier-claim shorthand. Captures `4683005` from `CL# 4683005`. Captured value flows into the same `claimNumbers` set as other labels.
- `LABELED_ID_REGEX` stays as-is; it already handles `File # …` and `Claim # …`.

**Fuzzy claim-number matching** (only for the carrier claim #, not for MA#):
- New helper `normalizeClaimNumber(s)`: strip non-alphanumeric, uppercase. `CA0021715171-02` → `CA002171517102`.
- In `match.ts`, step 1b (the `claim->>claimNumber` loop), replace strict equality with a two-step query:
  1. Try strict `.filter('claim->>claimNumber', 'eq', num)` first — fast index path.
  2. If no hit, fall back to pulling candidate rows (status='open' only, scoped by current company's RLS) and comparing `normalizeClaimNumber(stored) === normalizeClaimNumber(num)` OR a prefix/suffix match where the shorter normalized value is ≥ 6 chars and is a prefix OR suffix of the longer. Score 80 same as the strict path; add reason `insurance claim# fuzzy hit {num} ~ {stored}` so the match is traceable.
- MA# matching stays strict (after regex normalization of `#`/`:`/`.`). Henry explicitly scoped fuzzy to claim# only.
- Ambiguity guardrail is unchanged: the existing `top.score >= 80 AND top.score - runnerUp.score >= 30` decisive check keeps the auto-link from firing when two claims both fuzzy-match. Those cases fall through to the manual-link UI, same as today.

**Retry eligibility** — `src/lib/negotiations/process.ts`:
- Change the query guard from `.is('classification', null)` to something that lets improved matchers re-try failed threads. Options considered:
  - **Chosen:** add a `matcher_version` smallint column on `email_threads` (default 0). Processor filters `.lt('matcher_version', CURRENT_MATCHER_VERSION)` instead of the classification-null check. Each code change that affects matching bumps the constant in code. Threads whose version is behind get re-processed; threads at current version are skipped.
  - *Rejected:* `.is('classification', null) OR .eq('status', 'unmatched')` — would re-run every unmatched thread forever on every sync, wasting work.
  - *Rejected:* nuke `classification` to null on deploy via SQL — one-time only, doesn't help future matcher bumps.
- Set `matcher_version = CURRENT_MATCHER_VERSION` in every update inside `processOneThread`.
- Migration ships `CURRENT_MATCHER_VERSION = 2` (bumped from implied 1). After the migration runs, all existing threads sit at 0 (default) and get re-processed on the next sync. One-shot backfill, no manual SQL needed.

### 2. Multi-chain grouping — `src/app/negotiations/negotiations-client.tsx`

**Data layer:**
- Current `/api/negotiations/threads` returns a flat list of threads. Extend the response to include each thread's linked `claim_id` + `ma_number` + `vehicle` (via the `negotiation_case` join when present).
- No schema change — the data's already in `negotiation_cases`.

**Rendering:**
- In the `needs_response` and `responded` filter views, group threads by `claim_id`. Unmatched threads (no claim) remain ungrouped at the top of the `unmatched` view.
- Each group is one card showing: claim's MA#, vehicle, insured name, aggregated "N chains, M need reply" summary, latest activity timestamp.
- Click the group header to expand → shows each thread as a sub-row with its own subject, sender, inbound/outbound times, and "needs reply" badge. Clicking a sub-row goes to that thread's detail view (unchanged).
- Visual separation: each sub-row has a thin left border + indent so chains stay distinct — nothing is merged or concatenated.

**Counters:**
- Keep per-thread status counters as the source of truth (they already drive the top badges). Grouping is a display concern only.

### 3. Persistent sender/domain muting

**New table** (shipped in the same migration as `matcher_version`):

```sql
create table public.negotiation_muted_senders (
  id          uuid        primary key default gen_random_uuid(),
  email       text        null,     -- lowercased
  domain      text        null,     -- lowercased, no leading @
  muted_at    timestamptz not null default now(),
  muted_by    uuid        null references public.profiles(id) on delete set null,
  note        text        null,
  constraint one_of_email_or_domain check ((email is null) <> (domain is null))
);
create unique index negotiation_muted_senders_email_idx  on public.negotiation_muted_senders (email)  where email  is not null;
create unique index negotiation_muted_senders_domain_idx on public.negotiation_muted_senders (domain) where domain is not null;
```

RLS: `has_negotiations_access()` for all operations (Henry-personal state, no company scope needed).

**Classifier consultation** — `classify.ts`:
- Before the `AUTOMATED_SENDER_PATTERNS` loop, query `negotiation_muted_senders` once per message. If `email = fromAddr.toLowerCase()` OR `domain = fromAddr.split('@')[1].toLowerCase()`, return `{ classification: 'automated', confidence: 1.0, reason: 'muted sender' | 'muted domain' }`.
- One index-hit per message; negligible cost.

**API routes** — new under `src/app/api/negotiations/mute/`:
- `POST /api/negotiations/mute` — body `{ email? , domain?, note? }`. Inserts row, then updates all existing threads from that sender/domain to `status='spam'` + `classification='automated'` so Henry's current backlog clears without a sync.
- `DELETE /api/negotiations/mute/[id]` — unmute. Does NOT retroactively un-spam threads (that would be noisy); Henry re-triages manually if needed.
- `GET /api/negotiations/mute` — list for the admin page.
- All gated by `require-negotiations.ts` auth helper (reuse existing pattern).

**UI:**
- New button in the thread detail/row kebab menu: "Mute this sender" (just the email) and "Mute entire domain" (the `@...` part). One click → POST → row disappears from view, confirmation toast.
- Small `/negotiations/muted` admin page listing all muted entries with unmute buttons. Linked from a gear icon in the Negotiations header. Plain table, no sorting/filtering — intentionally minimal.

### 4. Data flow — end-to-end

New inbound email → IMAP sync creates `email_threads` row with `matcher_version=0`, status='unmatched' → scheduled processor (`/api/negotiations/process`) picks it up because `matcher_version < CURRENT_MATCHER_VERSION` → `classifyMessage` consults mute list first (bails to spam if muted) → otherwise extracts identifiers with new regexes + stripped subject → `findMatchForMessage` tries strict then fuzzy claim# → decisive match → `linkThreadToClaim` creates `negotiation_cases` row + bumps `matcher_version`. If no decisive match → classification + reason + version persisted, thread sits in `unmatched` view until Henry links manually or a future matcher bump re-tries it.

### 5. Error handling

- Fuzzy-match fallback query is capped at the `active_company_id()`'s open claims (RLS does the filter) and limited to 500 rows — reasonable since HamsPortal has ~390 total claims. If the limit is exceeded, the fallback is skipped and the thread falls through to the "no match found" branch (identical outcome to a thread that extracted no identifiers); logged with console.warn so we notice.
- Mute POST on a duplicate email/domain returns 200 with the existing row (idempotent).
- Grouping failure (missing join data) falls back to flat rendering — never blocks the list.

### 6. Testing / verification

Manual verification plan (no test framework in the repo):

1. **Regex coverage** — add a tiny node script `scripts/verify-neg-regex.mjs` that feeds the three example subjects through `extractIdentifiers` and asserts the expected IDs come out. Non-persistent, runs in <1s.
2. **Fuzzy match** — run `scripts/check-neg-match.mjs` (already added for diagnosis) with before/after builds. Confirm all three subjects' claim#s resolve to the right `acv_history.id`.
3. **Retry backfill** — after deploy, re-run processor via `/api/negotiations/process`, confirm counter of auto-linked threads jumps.
4. **Grouping UI** — manually link 2 threads to the same claim via the dev DB, verify UI shows them nested under one card.
5. **Mute** — mute `moderngroupinc@claimleader.com`, confirm thread moves to spam and no new ones appear.
6. **TypeScript + build** — `npx tsc --noEmit` and `npm run build`, no new errors.

### 7. Rollout

- Single migration: `supabase/migration-negotiations-matcher-v2.sql` + rollback. Adds `email_threads.matcher_version` + `negotiation_muted_senders` + indexes + RLS. Idempotent.
- One `vercel --prod` deploy following the standing deploy-safety protocol in CLAUDE.md.
- No feature flag — the matcher improvements are strictly better and the UI changes are additive (ungrouped fallback never breaks).

## Open questions

- Should the fuzzy-match fallback query be cached (e.g. per-sync-cycle in-memory) to avoid repeatedly scanning open claims? Probably premature — ~390 claims, one scan per unmatched thread with a claim# signal. Punt until it's shown slow.
- Mute list admin page: do we want to show per-sender counts (how many threads were silenced)? Nice-to-have, defer.

## Files touched

- `src/lib/negotiations/classify.ts` — regex expansion, subject strip, mute lookup
- `src/lib/negotiations/match.ts` — fuzzy claim# step
- `src/lib/negotiations/process.ts` — matcher_version gating
- `src/app/negotiations/negotiations-client.tsx` — group-by-claim rendering
- `src/app/api/negotiations/threads/route.ts` — join claim fields into response (confirm shape)
- `src/app/api/negotiations/mute/route.ts` *(new)* — POST / GET
- `src/app/api/negotiations/mute/[id]/route.ts` *(new)* — DELETE
- `src/app/negotiations/muted/page.tsx` *(new)* — admin page
- `supabase/migration-negotiations-matcher-v2.sql` *(new)*
- `supabase/migration-negotiations-matcher-v2-rollback.sql` *(new)*
- `scripts/verify-neg-regex.mjs` *(new, dev-only)*
