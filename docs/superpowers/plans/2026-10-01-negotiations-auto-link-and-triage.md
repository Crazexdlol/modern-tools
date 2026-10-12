# Negotiations Auto-link, Multi-chain, and Sender Muting — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Negotiations tab auto-link emails to the right claim (even with messy claim-number formats), group multiple email chains under one claim card, and let Henry mute specific senders/domains in one click.

**Architecture:** Three independent changes shipped together on one deploy. (1) `classify.ts` + `match.ts` get smarter regex, subject-noise stripping, fuzzy carrier-claim-# matching, and a mute-list consultation. (2) `process.ts` gates on a new `matcher_version` column so improved matchers automatically re-process stuck threads. (3) `negotiations-client.tsx` groups threads by `claimId` in the display. One SQL migration adds `email_threads.matcher_version` and the `negotiation_muted_senders` table.

**Tech Stack:** Next.js 16.1.6 App Router, Supabase (RLS + jsonb), TypeScript, React 19, Tailwind. No test framework — verification is `npx tsc --noEmit`, `npm run build`, and targeted `node scripts/*.mjs` diagnostics.

**Reference spec:** `docs/superpowers/specs/2026-10-01-negotiations-auto-link-and-triage-design.md`

**Pre-migration safety:** Henry runs the Supabase SQL manually. Code must handle 42703 (column/table missing) gracefully until the migration runs. Each code task that touches new DB surface wraps the new path in a try/fallback.

---

## Task 1: SQL migration + rollback

**Files:**
- Create: `supabase/migration-negotiations-matcher-v2.sql`
- Create: `supabase/migration-negotiations-matcher-v2-rollback.sql`

- [ ] **Step 1: Write the migration file**

Create `supabase/migration-negotiations-matcher-v2.sql`:

```sql
-- =========================================================================
-- HamsPortal — Negotiations matcher v2 (2026-10-01)
-- Adds: email_threads.matcher_version column + negotiation_muted_senders table.
-- Run in Supabase SQL Editor. Idempotent. Reversible via -rollback.sql.
-- =========================================================================

-- 1. matcher_version on email_threads. Default 0 so EVERY existing thread
--    becomes eligible for re-processing after the migration runs (the
--    matcher constant in code is set to 2).
alter table public.email_threads
  add column if not exists matcher_version smallint not null default 0;

create index if not exists email_threads_matcher_version_idx
  on public.email_threads (matcher_version)
  where status = 'unmatched';

-- 2. negotiation_muted_senders — Henry-personal state, flag-only RLS.
create table if not exists public.negotiation_muted_senders (
  id         uuid        primary key default gen_random_uuid(),
  email      text        null,
  domain     text        null,
  muted_at   timestamptz not null default now(),
  muted_by   uuid        null references public.profiles(id) on delete set null,
  note       text        null,
  constraint muted_one_of_email_or_domain check ((email is null) <> (domain is null))
);

create unique index if not exists negotiation_muted_senders_email_idx
  on public.negotiation_muted_senders (email)  where email  is not null;
create unique index if not exists negotiation_muted_senders_domain_idx
  on public.negotiation_muted_senders (domain) where domain is not null;

alter table public.negotiation_muted_senders enable row level security;

drop policy if exists nms_all on public.negotiation_muted_senders;
create policy nms_all on public.negotiation_muted_senders for all to authenticated
  using (public.has_negotiations_access())
  with check (public.has_negotiations_access());

-- 3. Verification (expect 1 for every row).
select 'email_threads.matcher_version col' as label, count(*)::int as value
  from information_schema.columns
  where table_schema='public' and column_name='matcher_version' and table_name='email_threads'
union all
select 'negotiation_muted_senders table', count(*)::int
  from information_schema.tables
  where table_schema='public' and table_name='negotiation_muted_senders'
union all
select 'nms RLS policy', count(*)::int
  from pg_policies
  where schemaname='public' and tablename='negotiation_muted_senders' and policyname='nms_all';
```

- [ ] **Step 2: Write the rollback file**

Create `supabase/migration-negotiations-matcher-v2-rollback.sql`:

```sql
-- Rollback for migration-negotiations-matcher-v2.sql.
-- Removes the matcher_version column and the muted-senders table.

drop policy if exists nms_all on public.negotiation_muted_senders;
drop table if exists public.negotiation_muted_senders;

drop index if exists public.email_threads_matcher_version_idx;
alter table public.email_threads drop column if exists matcher_version;
```

- [ ] **Step 3: Hand migration to Henry**

Print this message so Henry runs it:

> Migration file written to `supabase/migration-negotiations-matcher-v2.sql`. Open the Supabase SQL Editor (project `ektglhdstobaipdqssjx`), paste the file contents, run it. Expect the verification query to return `1` for all three rows. Rollback is at `supabase/migration-negotiations-matcher-v2-rollback.sql`.

Wait for Henry's confirmation before proceeding past Task 5 (code that reads the new column/table — safe to write but can't be deployed until the migration is applied).

- [ ] **Step 4: Commit**

```bash
git add supabase/migration-negotiations-matcher-v2.sql supabase/migration-negotiations-matcher-v2-rollback.sql
git commit -m "feat(negotiations): migration v2 — matcher_version col + muted senders table"
```

---

## Task 2: Subject-noise stripping + regex expansion in `classify.ts`

**Files:**
- Modify: `src/lib/negotiations/classify.ts`
- Create: `scripts/verify-neg-regex.mjs`

- [ ] **Step 1: Add `stripSubjectNoise` helper**

In `src/lib/negotiations/classify.ts`, add after the import line (above the existing patterns):

```ts
// Strip leading noise prefixes from a subject before identifier extraction.
// Handles stacked tags like "[SPAM] Re: [SPAM] Fwd: ...". Keeps the inner
// subject intact (no destructive edits to the actual topic).
export function stripSubjectNoise(subject: string): string {
  if (!subject) return ''
  let out = subject
  let prev = ''
  const prefix = /^\s*(?:\[(?:spam|external|ext|secure)\]|re|fw|fwd)\s*:?\s*/i
  while (out !== prev) {
    prev = out
    out = out.replace(prefix, '')
  }
  return out.trim()
}
```

- [ ] **Step 2: Expand `MA_REGEX` + add `CL_REGEX`**

Replace the existing `MA_REGEX`, `EV_REGEX`, `LABELED_ID_REGEX` block with:

```ts
const VIN_REGEX = /\b[A-HJ-NPR-Z0-9]{17}\b/gi
// Modern Appraisers uses `MA\d+`, Eagleview uses 6-digit numeric.
// Allow any of #, :, ., space, dash (one or more) between the MA prefix and digits.
const MA_REGEX = /\bMA[\s\-#:.]*\d{3,8}\b/gi
// Carrier claim-# shorthand ("CL# 4683005"). Capture only the digits.
const CL_REGEX = /\bCL[\s\-#:.]*(\d{4,15})\b/gi
const EV_REGEX = /\b(?:2[2-9]\d{4}|3\d{5})\b/g  // 220000-399999 range
const LABELED_ID_REGEX = /(?:claim\s*(?:#|no\.?|number|id)?|file\s*(?:#|no\.?|number))\s*:?\s*([A-Z0-9][A-Z0-9\-]{4,20})/gi
```

- [ ] **Step 3: Update `extractIdentifiers` to use the stripper + CL_REGEX**

Replace the body of `extractIdentifiers` with the block below. Note the MA# capture strips both the `MA` prefix and all separators, leaving just the digits (the `ma_number` column in Henry's DB stores bare digits like `3950817`, so the `IN` query in `match.ts` needs digits only):

```ts
export function extractIdentifiers(text: string): ExtractedIdentifiers {
  const src = stripSubjectNoise(text || '')
  const claimNumbers = new Set<string>()
  const vins = new Set<string>()

  for (const m of src.matchAll(VIN_REGEX)) {
    const vin = m[0].toUpperCase()
    if (!/^(.)\1{16}$/.test(vin)) vins.add(vin)
  }

  for (const m of src.matchAll(MA_REGEX)) {
    // Strip "MA" prefix + separators (#, -, :, ., whitespace). Keep digits only.
    const digits = m[0].replace(/^MA/i, '').replace(/[\s\-#:.]/g, '')
    if (digits.length >= 3) claimNumbers.add(digits)
  }
  for (const m of src.matchAll(CL_REGEX)) {
    // CL# captures the digits in group 1.
    claimNumbers.add((m[1] || '').toUpperCase())
  }
  for (const m of src.matchAll(EV_REGEX)) {
    claimNumbers.add(m[0])
  }
  for (const m of src.matchAll(LABELED_ID_REGEX)) {
    const raw = (m[1] || '').toUpperCase()
    if (raw.length >= 5) claimNumbers.add(raw)
  }

  return {
    claimNumbers: Array.from(claimNumbers),
    vins: Array.from(vins),
  }
}
```

- [ ] **Step 4: Write the standalone verification script**

Create `scripts/verify-neg-regex.mjs`:

```js
// Standalone regex sanity-check. No DB. Run:  node scripts/verify-neg-regex.mjs
// Imports the production source directly via tsx-free dynamic import after
// hand-compiling the exact regex copies here (keeps the script zero-dep).

const stripSubjectNoise = (subject) => {
  if (!subject) return ''
  let out = subject
  let prev = ''
  const prefix = /^\s*(?:\[(?:spam|external|ext|secure)\]|re|fw|fwd)\s*:?\s*/i
  while (out !== prev) { prev = out; out = out.replace(prefix, '') }
  return out.trim()
}

const MA_REGEX = /\bMA[\s\-#:.]*\d{3,8}\b/gi
const CL_REGEX = /\bCL[\s\-#:.]*(\d{4,15})\b/gi
const EV_REGEX = /\b(?:2[2-9]\d{4}|3\d{5})\b/g
const LABELED_ID_REGEX = /(?:claim\s*(?:#|no\.?|number|id)?|file\s*(?:#|no\.?|number))\s*:?\s*([A-Z0-9][A-Z0-9\-]{4,20})/gi

function extractIdentifiers(text) {
  const src = stripSubjectNoise(text || '')
  const nums = new Set()
  for (const m of src.matchAll(MA_REGEX)) {
    const d = m[0].replace(/^MA/i, '').replace(/[\s\-#:.]/g, '')
    if (d.length >= 3) nums.add(d)
  }
  for (const m of src.matchAll(CL_REGEX)) nums.add((m[1] || '').toUpperCase())
  for (const m of src.matchAll(EV_REGEX)) nums.add(m[0])
  for (const m of src.matchAll(LABELED_ID_REGEX)) {
    const raw = (m[1] || '').toUpperCase()
    if (raw.length >= 5) nums.add(raw)
  }
  return Array.from(nums)
}

const CASES = [
  { subj: '[SPAM] Re: [SPAM] RIF-KOSA CONSTRUCTION LLC | 2015 Land Rover Range Rover Evoque | File # 3971247 | Claim # CA0021715171-02',
    expect: ['3971247', 'CA0021715171-02'] },
  { subj: 'RE: Amber Aiton | 2021 Ford F-150 Lariat | CL# 4683005 | MA# 3950817',
    expect: ['3950817', '4683005'] },
  { subj: 'Re: GREGORY GALE | 2017 JAYCO M-213 JAY FEATHER | File # 3951773 | Claim # 000830291050',
    expect: ['3951773', '000830291050'] },
  { subj: 'Fwd: unrelated marketing update',
    expect: [] },
]

let failures = 0
for (const c of CASES) {
  const got = extractIdentifiers(c.subj)
  const missing = c.expect.filter(e => !got.includes(e))
  const ok = missing.length === 0
  console.log(`${ok ? 'PASS' : 'FAIL'}  "${c.subj.slice(0, 80)}${c.subj.length > 80 ? '…' : ''}"`)
  console.log(`      extracted: [${got.join(', ')}]  missing: [${missing.join(', ')}]`)
  if (!ok) failures++
}
console.log(failures === 0 ? '\nAll regex cases pass.' : `\n${failures} case(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
```

- [ ] **Step 5: Run the regex check**

```bash
cd "C:/XSFA/Modern Tools Official" && node scripts/verify-neg-regex.mjs
```

Expected output: `All regex cases pass.` (exit code 0)

- [ ] **Step 6: Type-check**

```bash
cd "C:/XSFA/Modern Tools Official" && npx tsc --noEmit
```

Expected: no new errors from the modified files.

- [ ] **Step 7: Commit**

```bash
git add src/lib/negotiations/classify.ts scripts/verify-neg-regex.mjs
git commit -m "fix(negotiations): regex handles MA#/CL# with hash + strip [SPAM]/Re: subject noise"
```

---

## Task 3: Fuzzy carrier-claim-# matching in `match.ts`

**Files:**
- Modify: `src/lib/negotiations/match.ts`

- [ ] **Step 1: Add normalize + fuzzy helpers**

At the bottom of `src/lib/negotiations/match.ts` (before the closing of the file), add:

```ts
// Normalize a claim number by stripping all non-alphanumerics and uppercasing.
// "CA0021715171-02" → "CA002171517102"
export function normalizeClaimNumber(s: string | null | undefined): string {
  if (!s) return ''
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

// Match if normalized values are equal, OR one is a prefix/suffix of the other
// with at least 6 chars of overlap (shorter side must be ≥ 6 chars).
export function fuzzyClaimMatch(a: string, b: string): boolean {
  const na = normalizeClaimNumber(a)
  const nb = normalizeClaimNumber(b)
  if (!na || !nb) return false
  if (na === nb) return true
  const [shorter, longer] = na.length <= nb.length ? [na, nb] : [nb, na]
  if (shorter.length < 6) return false
  return longer.startsWith(shorter) || longer.endsWith(shorter)
}
```

- [ ] **Step 2: Add the fuzzy fallback query to the matcher**

Inside `findMatchForMessage`, locate the block that queries `claim->>claimNumber` (currently step 1b, roughly lines 65-72). Add fuzzy fallback right after the existing strict loop:

```ts
    // Also check claim.claimNumber (insurance carrier's claim #). Strict first.
    const strictHits = new Set<string>()
    for (const num of ids.claimNumbers) {
      const { data: byInsClaim } = await supabase
        .from('acv_history')
        .select('id, ma_number, vehicle, company_id, claim')
        .filter('claim->>claimNumber', 'eq', num)
        .limit(5)
      for (const row of byInsClaim || []) {
        addCandidate(row as ClaimRow, `insurance claim# hit ${num}`, 80)
        strictHits.add(row.id as string)
      }
    }

    // Fuzzy fallback — only when strict didn't find a candidate. Scans open
    // claims in the caller's active company (RLS does the scoping) up to 500
    // rows. On a ~400-claim DB this is a single page.
    if (ids.claimNumbers.length > 0) {
      const { data: openClaims } = await supabase
        .from('acv_history')
        .select('id, ma_number, vehicle, company_id, claim, status')
        .eq('status', 'open')
        .not('claim->>claimNumber', 'is', null)
        .limit(500)
      if ((openClaims?.length ?? 0) >= 500) {
        console.warn('[negotiations/match] fuzzy fallback hit 500-row cap, skipping scan')
      } else {
        for (const row of openClaims || []) {
          if (strictHits.has(row.id as string)) continue
          const claimObj = (row as ClaimRow).claim as Record<string, unknown> | undefined
          const stored = typeof claimObj?.claimNumber === 'string' ? claimObj.claimNumber as string : ''
          if (!stored) continue
          const hit = ids.claimNumbers.find(num => fuzzyClaimMatch(stored, num))
          if (hit) {
            addCandidate(row as ClaimRow, `insurance claim# fuzzy hit ${hit} ~ ${stored}`, 80)
          }
        }
      }
    }
```

Replace the original strict loop (the one at lines ~65-72) with the above block. The runaway `for (const num of ids.claimNumbers)` strict loop is now included inline.

- [ ] **Step 3: Type-check**

```bash
cd "C:/XSFA/Modern Tools Official" && npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 4: Verify against real data**

Re-run the diagnostic script (already written in Task 0 of discovery):

```bash
cd "C:/XSFA/Modern Tools Official" && SUPABASE_SERVICE_ROLE_KEY='<key>' node scripts/check-neg-match.mjs
```

Expected: all 6 probes still hit (same output as discovery — this change doesn't affect strict matches, only adds a fallback).

- [ ] **Step 5: Commit**

```bash
git add src/lib/negotiations/match.ts
git commit -m "feat(negotiations): fuzzy carrier claim# match with 6-char prefix/suffix tolerance"
```

---

## Task 4: `matcher_version` gating in `process.ts`

**Files:**
- Modify: `src/lib/negotiations/process.ts`

- [ ] **Step 1: Add the version constant + patch the query guard**

In `src/lib/negotiations/process.ts`, replace the top-of-file constant block with:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { classifyMessage, type Classification } from './classify'
import { findMatchForMessage } from './match'

// Bump when any matcher-affecting code changes. Threads at a lower version
// get re-processed on the next /api/negotiations/process invocation.
export const CURRENT_MATCHER_VERSION = 2

const PROCESS_MAX_PER_CALL = 40
```

- [ ] **Step 2: Change the thread-selection query**

Replace the `supabase.from('email_threads').select(...)` block inside `processUnmatchedThreads` with:

```ts
  // Prefer the matcher_version gate. Fall back to the pre-migration shape
  // (classification IS NULL) if the column doesn't exist yet.
  let threads: { id: string; last_inbound_at: string | null }[] | null = null
  let threadsErr: { code?: string; message?: string } | null = null
  {
    const res = await supabase
      .from('email_threads')
      .select('id, last_inbound_at')
      .eq('status', 'unmatched')
      .lt('matcher_version', CURRENT_MATCHER_VERSION)
      .order('last_inbound_at', { ascending: false, nullsFirst: false })
      .limit(PROCESS_MAX_PER_CALL + 1)
    if (res.error && res.error.code === '42703') {
      // Column doesn't exist yet — fall back to the legacy guard.
      const legacy = await supabase
        .from('email_threads')
        .select('id, last_inbound_at')
        .eq('status', 'unmatched')
        .is('classification', null)
        .order('last_inbound_at', { ascending: false, nullsFirst: false })
        .limit(PROCESS_MAX_PER_CALL + 1)
      threads = legacy.data ?? null
      threadsErr = legacy.error
    } else {
      threads = res.data ?? null
      threadsErr = res.error
    }
  }
  if (threadsErr) {
    result.errors.push(`load threads: ${threadsErr.message}`)
    return result
  }
```

- [ ] **Step 3: Write matcher_version on every update inside `processOneThread`**

Inside `processOneThread`, every `supabase.from('email_threads').update(...)` call needs `matcher_version: CURRENT_MATCHER_VERSION` added to its payload. Three call sites:

Site 1 — the "no inbound messages" early return:

```ts
    await supabase.from('email_threads').update({
      classification: 'informational',
      classification_confidence: 0.5,
      classification_reason: 'no inbound messages found',
      matcher_version: CURRENT_MATCHER_VERSION,
    }).eq('id', threadId)
```

Site 2 — the automated/spam early return:

```ts
  if (cls.classification === 'automated') {
    threadPatch.status = 'spam'
    threadPatch.matcher_version = CURRENT_MATCHER_VERSION
    await supabase.from('email_threads').update(threadPatch).eq('id', threadId)
    return
  }
```

Site 3 — the final update at the end of `processOneThread`:

```ts
  threadPatch.matcher_version = CURRENT_MATCHER_VERSION
  await supabase.from('email_threads').update(threadPatch).eq('id', threadId)
```

Writes to a column that doesn't exist (pre-migration) will throw 42703 — wrap each site in a try/retry that drops `matcher_version` on 42703 so the update still succeeds pre-migration. Add this helper near the top of the file:

```ts
async function updateThreadWithVersionFallback(
  supabase: SupabaseClient,
  threadId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from('email_threads').update(patch).eq('id', threadId)
  if (error && error.code === '42703' && 'matcher_version' in patch) {
    // Column not there yet — retry without it.
    const { matcher_version: _dropped, ...rest } = patch
    void _dropped
    await supabase.from('email_threads').update(rest).eq('id', threadId)
  }
}
```

Replace the three `supabase.from('email_threads').update(...)` call sites with `await updateThreadWithVersionFallback(supabase, threadId, { ... })`. Full example for site 2:

```ts
  if (cls.classification === 'automated') {
    threadPatch.status = 'spam'
    threadPatch.matcher_version = CURRENT_MATCHER_VERSION
    await updateThreadWithVersionFallback(supabase, threadId, threadPatch)
    return
  }
```

- [ ] **Step 4: Type-check**

```bash
cd "C:/XSFA/Modern Tools Official" && npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/negotiations/process.ts
git commit -m "feat(negotiations): matcher_version gating lets improved matchers retry stuck threads"
```

---

## Task 5: Mute-list consultation in `classify.ts`

**Files:**
- Modify: `src/lib/negotiations/classify.ts`

- [ ] **Step 1: Add the mute-list lookup before pattern rules**

In `src/lib/negotiations/classify.ts`, inside `classifyMessage`, add this block as the very first rule (before "Rule 1: automated sender pattern"):

```ts
  // Rule 0: muted sender / domain (persistent allowlist Henry curates via UI).
  // Pre-migration safe: if the table doesn't exist, this check is a no-op.
  if (from) {
    const atIdx = from.indexOf('@')
    const domain = atIdx > 0 ? from.slice(atIdx + 1) : ''
    const mutedQuery = supabase
      .from('negotiation_muted_senders')
      .select('id, email, domain')
      .or(domain ? `email.eq.${from},domain.eq.${domain}` : `email.eq.${from}`)
      .limit(1)
    const { data: mutedRows, error: mutedErr } = await mutedQuery.maybeSingle()
    if (!mutedErr && mutedRows) {
      const reason = mutedRows.email ? 'muted sender' : 'muted domain'
      return { classification: 'automated', confidence: 1.0, reason }
    }
    // 42P01 = table doesn't exist. Silent fallback = no mute applied.
    // Any other error: log and continue (don't fail classification).
    if (mutedErr && mutedErr.code && mutedErr.code !== '42P01') {
      console.warn('[negotiations/classify] mute lookup error', mutedErr.message)
    }
  }
```

- [ ] **Step 2: Type-check**

```bash
cd "C:/XSFA/Modern Tools Official" && npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/negotiations/classify.ts
git commit -m "feat(negotiations): classify consults negotiation_muted_senders table first"
```

---

## Task 6: Mute API routes

**Files:**
- Create: `src/app/api/negotiations/mute/route.ts`
- Create: `src/app/api/negotiations/mute/[id]/route.ts`

- [ ] **Step 1: Write `POST /api/negotiations/mute` + `GET`**

Create `src/app/api/negotiations/mute/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { requireNegotiationsAccess } from '@/lib/auth/require-negotiations'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export interface MutedSenderRow {
  id: string
  email: string | null
  domain: string | null
  muted_at: string
  note: string | null
}

// GET — list all muted entries, newest first.
export async function GET() {
  const { caller, errorResponse } = await requireNegotiationsAccess()
  if (errorResponse) return errorResponse

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('negotiation_muted_senders')
    .select('id, email, domain, muted_at, note')
    .order('muted_at', { ascending: false })
    .limit(500)

  if (error) {
    if (error.code === '42P01') return NextResponse.json({ entries: [], migrationPending: true })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ entries: (data ?? []) as MutedSenderRow[], mutedBy: caller.userId })
}

// POST — mute a sender (email) OR a domain. Body: { email?, domain?, note? }.
// Also marks all currently-visible threads from that sender/domain as spam so
// Henry's backlog clears without a sync pass.
export async function POST(request: Request) {
  const { caller, errorResponse } = await requireNegotiationsAccess()
  if (errorResponse) return errorResponse

  const body = await request.json().catch(() => ({})) as { email?: string; domain?: string; note?: string }
  const email  = body.email?.trim().toLowerCase() || null
  const domain = body.domain?.trim().toLowerCase().replace(/^@/, '') || null
  if ((email && domain) || (!email && !domain)) {
    return NextResponse.json({ error: 'Provide exactly one of email, domain' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Idempotent insert — on conflict (unique index) return the existing row.
  const insertRes = await supabase
    .from('negotiation_muted_senders')
    .insert({ email, domain, note: body.note?.trim() || null, muted_by: caller.userId })
    .select('id, email, domain, muted_at, note')
    .single()

  let row: MutedSenderRow | null = null
  if (insertRes.error) {
    if (insertRes.error.code === '23505') {
      // Duplicate — fetch existing.
      const q = supabase.from('negotiation_muted_senders').select('id, email, domain, muted_at, note').limit(1)
      const existing = email ? await q.eq('email', email).maybeSingle() : await q.eq('domain', domain!).maybeSingle()
      row = (existing.data as MutedSenderRow | null) ?? null
    } else if (insertRes.error.code === '42P01') {
      return NextResponse.json({ error: 'Migration pending' }, { status: 503 })
    } else {
      return NextResponse.json({ error: insertRes.error.message }, { status: 500 })
    }
  } else {
    row = insertRes.data as MutedSenderRow
  }

  // Backfill: mark existing matching threads as spam so they vanish from
  // "needs response" immediately.
  if (email) {
    await supabase
      .from('email_threads')
      .update({ status: 'spam', classification: 'automated', classification_reason: 'muted sender' })
      .eq('status', 'needs_response')
      .in('id', (await supabase
        .from('email_messages')
        .select('thread_id')
        .ilike('from_addr', email)
      ).data?.map(r => r.thread_id) ?? [])
  } else if (domain) {
    await supabase
      .from('email_threads')
      .update({ status: 'spam', classification: 'automated', classification_reason: 'muted domain' })
      .eq('status', 'needs_response')
      .in('id', (await supabase
        .from('email_messages')
        .select('thread_id')
        .ilike('from_addr', `%@${domain}`)
      ).data?.map(r => r.thread_id) ?? [])
  }

  return NextResponse.json({ entry: row })
}
```

- [ ] **Step 2: Write `DELETE /api/negotiations/mute/[id]`**

Create `src/app/api/negotiations/mute/[id]/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { requireNegotiationsAccess } from '@/lib/auth/require-negotiations'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { errorResponse } = await requireNegotiationsAccess()
  if (errorResponse) return errorResponse

  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const supabase = createServiceClient()
  const { error } = await supabase.from('negotiation_muted_senders').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Deliberately NOT un-spamming old threads — avoids a noise burst.
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Type-check**

```bash
cd "C:/XSFA/Modern Tools Official" && npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/negotiations/mute
git commit -m "feat(negotiations): add mute API — POST/GET/DELETE sender or domain"
```

---

## Task 7: Mute UI — kebab menu buttons + admin page

**Files:**
- Modify: `src/app/negotiations/negotiations-client.tsx`
- Create: `src/app/negotiations/muted/page.tsx`
- Create: `src/app/negotiations/muted/muted-client.tsx`

- [ ] **Step 1: Add "Mute sender" + "Mute domain" to the kebab menu in `ThreadRow`**

Open `src/app/negotiations/negotiations-client.tsx`. Find the `ThreadRow` component (around line 306). Inside, find the kebab menu (`setMenuOpen` state is defined there). Add two new action handlers after the existing `setStatus` function (around line 329):

```ts
  const mute = async (which: 'sender' | 'domain') => {
    const email = thread.lastFromAddr.toLowerCase()
    const atIdx = email.indexOf('@')
    const domain = atIdx > 0 ? email.slice(atIdx + 1) : ''
    const payload = which === 'sender' ? { email } : { domain }
    if (which === 'domain' && !domain) return
    const label = which === 'sender' ? email : `@${domain}`
    if (!window.confirm(`Mute ${label}? Future emails will skip the triage view.`)) return
    setBusy('spam')
    try {
      await fetch('/api/negotiations/mute', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      onChanged()
    } finally { setBusy(null); setMenuOpen(false) }
  }
```

- [ ] **Step 2: Render the mute buttons inside the kebab dropdown**

Find the JSX that renders the kebab menu's items (look for the existing "Archive" / "Spam" / "Delete" buttons — the `onLinkClaim`/`setStatus`/`doDelete` wiring makes them easy to spot). Add two new buttons before the Delete item:

```tsx
                <button
                  onClick={() => mute('sender')}
                  disabled={!thread.lastFromAddr}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 disabled:text-gray-400 disabled:hover:bg-transparent"
                >
                  Mute this sender
                </button>
                <button
                  onClick={() => mute('domain')}
                  disabled={!thread.lastFromAddr.includes('@')}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 disabled:text-gray-400 disabled:hover:bg-transparent"
                >
                  Mute entire domain
                </button>
```

- [ ] **Step 3: Add a gear icon in the header linking to `/negotiations/muted`**

Near the Sync button area (around line 208 in `negotiations-client.tsx`), add just before the Sync button:

```tsx
          <Link
            href="/negotiations/muted"
            title="Manage muted senders"
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 bg-white text-gray-500 hover:text-gray-900 hover:border-gray-300 transition"
          >
            <Archive className="w-3.5 h-3.5" />
          </Link>
```

(`Archive` is already imported in this file — `lucide-react` import at line 7.)

- [ ] **Step 4: Create the muted admin server page**

Create `src/app/negotiations/muted/page.tsx`:

```tsx
import { requireNegotiationsAccessOrNotFound } from '@/lib/auth/require-negotiations'
import { AppHeader } from '@/components/app-header'
import { MutedClient } from './muted-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function MutedSendersPage() {
  await requireNegotiationsAccessOrNotFound()
  return (
    <>
      <AppHeader />
      <main className="max-w-3xl mx-auto p-6">
        <h1 className="text-2xl font-semibold text-gray-900 mb-1">Muted senders</h1>
        <p className="text-sm text-gray-500 mb-6">
          Senders and domains listed here are automatically marked spam and never appear in triage.
        </p>
        <MutedClient />
      </main>
    </>
  )
}
```

- [ ] **Step 5: Create the client component for the admin page**

Create `src/app/negotiations/muted/muted-client.tsx`:

```tsx
"use client"

import { useEffect, useState } from 'react'
import type { MutedSenderRow } from '@/app/api/negotiations/mute/route'

export function MutedClient() {
  const [entries, setEntries] = useState<MutedSenderRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    try {
      const res = await fetch('/api/negotiations/mute', { cache: 'no-store' })
      const json = await res.json() as { entries?: MutedSenderRow[]; error?: string }
      if (json.error) setError(json.error)
      setEntries(json.entries ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  useEffect(() => { load() }, [])

  const unmute = async (id: string) => {
    if (!window.confirm('Unmute? Future emails will show up in triage again. Already-muted threads stay in spam.')) return
    await fetch(`/api/negotiations/mute/${id}`, { method: 'DELETE' })
    setEntries(prev => (prev ?? []).filter(e => e.id !== id))
  }

  if (error) return <div className="text-sm text-red-600">Error: {error}</div>
  if (entries === null) return <div className="text-sm text-gray-400">Loading…</div>
  if (entries.length === 0) return <div className="text-sm text-gray-500">Nothing muted yet.</div>

  return (
    <ul className="divide-y divide-gray-200 bg-white border border-gray-200 rounded-xl overflow-hidden">
      {entries.map(e => (
        <li key={e.id} className="px-4 py-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm text-gray-900 truncate">
              {e.email ?? `@${e.domain}`}
            </div>
            <div className="text-xs text-gray-500">
              Muted {new Date(e.muted_at).toLocaleDateString()}
              {e.note ? ` — ${e.note}` : ''}
            </div>
          </div>
          <button
            onClick={() => unmute(e.id)}
            className="text-xs text-gray-500 hover:text-red-600 border border-gray-200 hover:border-red-200 rounded-md px-2 py-1"
          >
            Unmute
          </button>
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 6: Type-check**

```bash
cd "C:/XSFA/Modern Tools Official" && npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/negotiations/negotiations-client.tsx src/app/negotiations/muted
git commit -m "feat(negotiations): mute UI — kebab button + /negotiations/muted admin page"
```

---

## Task 8: Multi-chain grouping in `negotiations-client.tsx`

**Files:**
- Modify: `src/app/negotiations/negotiations-client.tsx`

- [ ] **Step 1: Add a grouping helper**

Near the top of `src/app/negotiations/negotiations-client.tsx` (after the imports and the `FILTERS` constant), add:

```ts
interface ThreadGroup {
  claimId: string | null
  claimNumber: string | null  // ma_number
  claimVehicle: string | null
  threads: ThreadListItem[]
  needsReplyCount: number
  latestSentAt: string
}

function groupByClaim(threads: ThreadListItem[]): ThreadGroup[] {
  const map = new Map<string, ThreadGroup>()
  const unmatched: ThreadGroup[] = []

  for (const t of threads) {
    if (!t.claimId) {
      // Unmatched threads are their own one-thread "group" — never merged.
      unmatched.push({
        claimId: null,
        claimNumber: null,
        claimVehicle: null,
        threads: [t],
        needsReplyCount: t.status === 'needs_response' ? 1 : 0,
        latestSentAt: t.lastSentAt,
      })
      continue
    }
    const existing = map.get(t.claimId)
    if (existing) {
      existing.threads.push(t)
      if (t.status === 'needs_response') existing.needsReplyCount++
      if (t.lastSentAt > existing.latestSentAt) existing.latestSentAt = t.lastSentAt
    } else {
      map.set(t.claimId, {
        claimId: t.claimId,
        claimNumber: t.claimNumber,
        claimVehicle: t.claimVehicle,
        threads: [t],
        needsReplyCount: t.status === 'needs_response' ? 1 : 0,
        latestSentAt: t.lastSentAt,
      })
    }
  }

  // Interleave matched + unmatched groups by latest activity.
  const all = [...map.values(), ...unmatched]
  all.sort((a, b) => b.latestSentAt.localeCompare(a.latestSentAt))
  return all
}
```

- [ ] **Step 2: Replace the flat `data.threads.map(...)` with grouped rendering**

Find the current rendering block (around line 237-248 of `negotiations-client.tsx`):

```tsx
        {data && data.threads.length > 0 && (
          <ul className="divide-y divide-gray-100">
            {data.threads.map(t => (
              <ThreadRow
                key={t.id}
                thread={t}
                onLinkClaim={() => setPickerThreadId(t.id)}
                onChanged={() => fetchThreads(filter, search)}
              />
            ))}
          </ul>
        )}
```

Replace with:

```tsx
        {data && data.threads.length > 0 && (
          <ul className="divide-y divide-gray-100">
            {groupByClaim(data.threads).map(g => (
              g.claimId && g.threads.length > 1 ? (
                <ClaimGroupRow
                  key={`claim-${g.claimId}`}
                  group={g}
                  onLinkClaim={(threadId) => setPickerThreadId(threadId)}
                  onChanged={() => fetchThreads(filter, search)}
                />
              ) : (
                <ThreadRow
                  key={g.threads[0].id}
                  thread={g.threads[0]}
                  onLinkClaim={() => setPickerThreadId(g.threads[0].id)}
                  onChanged={() => fetchThreads(filter, search)}
                />
              )
            ))}
          </ul>
        )}
```

- [ ] **Step 3: Add the `ClaimGroupRow` component**

At the bottom of the file (after `ThreadRow` and other components, before any closing export block), add:

```tsx
function ClaimGroupRow({ group, onLinkClaim, onChanged }: {
  group: ThreadGroup
  onLinkClaim: (threadId: string) => void
  onChanged: () => void
}) {
  const [expanded, setExpanded] = useState(group.needsReplyCount > 0)
  const headerDate = new Date(group.latestSentAt)
  const now = new Date()
  const isToday = now.toDateString() === headerDate.toDateString()
  const dateLabel = isToday
    ? headerDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : headerDate.toLocaleDateString([], { month: 'short', day: 'numeric' })

  return (
    <li>
      <button
        type="button"
        onClick={() => setExpanded(x => !x)}
        className="w-full text-left px-4 py-3 bg-slate-50 hover:bg-slate-100 transition flex items-center gap-3"
      >
        <Car className="w-4 h-4 text-slate-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="font-semibold text-sm text-gray-900 truncate">
              {group.claimVehicle || '(vehicle)'}
            </span>
            {group.claimNumber && (
              <span className="text-xs text-gray-500">MA# {group.claimNumber}</span>
            )}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {group.threads.length} chains
            {group.needsReplyCount > 0 && (
              <span className="ml-2 text-red-600 font-medium">
                · {group.needsReplyCount} need{group.needsReplyCount === 1 ? 's' : ''} reply
              </span>
            )}
          </div>
        </div>
        <span className="text-xs text-gray-400">{dateLabel}</span>
        <span className="text-gray-400">{expanded ? '▾' : '▸'}</span>
      </button>
      {expanded && (
        <ul className="divide-y divide-gray-100 bg-white border-l-2 border-slate-200 ml-6">
          {group.threads.map(t => (
            <ThreadRow
              key={t.id}
              thread={t}
              onLinkClaim={() => onLinkClaim(t.id)}
              onChanged={onChanged}
            />
          ))}
        </ul>
      )}
    </li>
  )
}
```

- [ ] **Step 4: Type-check**

```bash
cd "C:/XSFA/Modern Tools Official" && npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 5: Smoke test in dev**

```bash
cd "C:/XSFA/Modern Tools Official" && npm run dev
```

Open `http://localhost:3000/negotiations`. Verify:
- A claim with a single thread renders as a plain row (same as before).
- A claim with 2+ threads renders as a collapsed card showing "N chains" and a reply count. Clicking expands it with each thread indented inside.
- Unmatched threads still render as single rows at the top of the Unmatched tab.
- The gear icon in the header navigates to `/negotiations/muted`.

Report any visual issues before committing.

- [ ] **Step 6: Commit**

```bash
git add src/app/negotiations/negotiations-client.tsx
git commit -m "feat(negotiations): group multi-chain threads under one claim card"
```

---

## Task 9: Full-build + deploy verification

**Files:** (none modified; verification only)

- [ ] **Step 1: Final build check**

```bash
cd "C:/XSFA/Modern Tools Official" && npm run build
```

Expected: build succeeds with no new errors or warnings tied to the modified files.

- [ ] **Step 2: Confirm migration has been applied**

Ask Henry: "Has the Supabase migration `migration-negotiations-matcher-v2.sql` been run? (Needed before deploying this build — pre-migration fallback is present but we want to verify end-to-end on the real columns.)"

If not applied yet, wait until it is. Do not deploy before the SQL runs.

- [ ] **Step 3: Capture current prod deploy for rollback**

```bash
cd "C:/XSFA/Modern Tools Official" && npx vercel inspect modern-tools-rho.vercel.app --scope henry-as-projects-88caed67
```

Expected output includes a line like `Deployment URL: https://modern-tools-xxxxxx-henry-as-projects-88caed67.vercel.app`. Record that URL as the rollback target.

- [ ] **Step 4: Deploy**

```bash
cd "C:/XSFA/Modern Tools Official" && npx vercel --prod --scope henry-as-projects-88caed67 --yes
```

- [ ] **Step 5: Verify alias flipped**

```bash
cd "C:/XSFA/Modern Tools Official" && npx vercel inspect modern-tools-rho.vercel.app --scope henry-as-projects-88caed67
```

Expected: deployment id matches the one just produced; status `● Ready`.

- [ ] **Step 6: Smoke-test production**

Open `https://modern-tools-rho.vercel.app/negotiations` in a browser signed in as Henry. Verify:
- Thread list renders (no console errors).
- Click Sync — syncer runs, processor runs, auto-match counter increments if there's backlog. Expect previously-stuck threads to now auto-link if their subjects contain any `MA#` / `CL#` / Claim # that resolves.
- Click a thread's kebab menu → "Mute this sender" works and the thread disappears.
- `/negotiations/muted` shows the muted entry.

- [ ] **Step 7: Update the session log**

Prepend a new entry to `docs/SESSIONS.md` following the format in `CLAUDE.md`:

```markdown
## 2026-10-01 — Negotiations auto-link v2 + multi-chain grouping + sender muting

- **Worked on:** matcher upgrade, UI grouping by claim, persistent sender/domain mute list
- **Changed:**
  - `src/lib/negotiations/classify.ts` — stripSubjectNoise + MA#/CL# regex + mute-list consultation
  - `src/lib/negotiations/match.ts` — fuzzy carrier-claim-# matching (6-char prefix/suffix)
  - `src/lib/negotiations/process.ts` — matcher_version gating + re-process on bump
  - `src/app/negotiations/negotiations-client.tsx` — group threads by claim + Mute buttons + gear link
  - `src/app/negotiations/muted/page.tsx` + `muted-client.tsx` — admin page
  - `src/app/api/negotiations/mute/*` — POST/GET/DELETE
  - `supabase/migration-negotiations-matcher-v2.sql` (+ rollback)
  - `scripts/verify-neg-regex.mjs`
- **Deploy status:** live at <deploy-url>, alias flipped. Previous good build: <rollback-url>
- **Next:** monitor auto-link rate; if fuzzy fallback misses, consider raising the overlap threshold to 7–8 chars.
```

- [ ] **Step 8: Commit the session log**

```bash
git add docs/SESSIONS.md
git commit -m "docs: SESSIONS entry for 2026-10-01 negotiations matcher v2"
```

---

## Self-review checklist

**Spec coverage:**
- Matcher regex fixes (MA#/CL# + subject strip) → Task 2 ✓
- Fuzzy claim-number matching → Task 3 ✓
- `matcher_version` retry gating → Task 1 (migration) + Task 4 (code) ✓
- Multi-chain grouping → Task 8 ✓
- Sender/domain muting (table + classifier consult + API + UI) → Task 1 + 5 + 6 + 7 ✓
- Pre-migration safety (42703/42P01 handling) → embedded in Tasks 4 + 5 + 6 ✓

**Placeholder scan:** no "TBD" / "implement later" / "handle edge cases" phrases.

**Type consistency:** `MutedSenderRow` defined once in `src/app/api/negotiations/mute/route.ts`, imported by the client component. `CURRENT_MATCHER_VERSION` lives in `process.ts` (constant, exported from there if other code ever needs it).

**Scope:** all tasks are modifications in one feature area with one deploy. Correctly sized for a single plan.
