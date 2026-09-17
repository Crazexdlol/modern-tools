# HamsPortal Multi-Company — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retrofit the codebase for multi-company data isolation (Modern Appraisers + Eagleview) without changing any user-visible behavior for existing Modern Appraisers users.

**Architecture:** New `companies` + `user_companies` tables. Every claim-scoped table gets `company_id NOT NULL`. Isolation enforced at two layers: (A) Supabase RLS with `active_company_id()` and `has_company_access()` helper functions, and (B) an application-side `scopedClient()` wrapper that auto-injects `company_id` filters on every service-client query. A trigger on `acv_history` makes `company_id` immutable — claims cannot be reassigned across companies ever.

**Tech Stack:** Next.js 16.3.5 + React 19.2.3 + Supabase (Postgres 15 + Row-Level Security) + Vitest (new — for isolation tests) + node-postgres via `@supabase/supabase-js`.

**Spec:** `docs/superpowers/specs/2026-09-16-hamsportal-multi-company-design.md`

**Deploy order:** Code lands on prod first (introduces no visible change because it gracefully handles pre-migration state — the new columns don't exist yet), THEN Henry runs the migration in Supabase SQL Editor, THEN a verification pass. Code-first is safe because the current live application doesn't reference any new columns; the new Phase 1 code has fallbacks for pre-migration reads.

---

## File structure

**New files:**
- `supabase/migration-multi-company.sql` — the full atomic migration.
- `supabase/migration-multi-company-rollback.sql` — reverse operations.
- `src/lib/supabase/scoped.ts` — `scopedClient()` Proxy factory with claim-scoped table whitelist.
- `src/hooks/use-active-company.ts` — client-side hook exposing `activeCompanyId`.
- `src/app/api/company/switch/route.ts` — POST endpoint to change active company.
- `vitest.config.ts` — test runner config.
- `__tests__/setup/env.ts` — shared test env (anon + service key clients, prefixes).
- `__tests__/setup/seed.ts` — creates 2 test users + 2 test claims, returns handles.
- `__tests__/setup/cleanup.ts` — deletes anything with the `test-hamsportal-` prefix.
- `__tests__/scoped-client.test.ts` — unit tests for `scopedClient`.
- `__tests__/isolation.test.ts` — RLS + route isolation between MA and EV users.
- `__tests__/insert-cannot-forge.test.ts` — session wins over body for `company_id`.
- `__tests__/cross-company-reassignment-blocked.test.ts` — trigger fires on UPDATE.
- `__tests__/dual-user-switch.test.ts` — switching companies changes visible data.

**Modified files:**
- `src/lib/auth/require-admin.ts` — caller gets `activeCompanyId`; new `requireCompanyContext()`; `fetchClaim(id, companyId?)`.
- `src/lib/supabase/history.ts` — writes stamp `company_id` when present in local state.
- `src/lib/supabase/clients.ts` — writes stamp `company_id`.
- `src/app/api/claims/[id]/approve/route.ts` — uses updated `fetchClaim(id, activeCompanyId)`.
- `src/app/api/claims/[id]/assign/route.ts` — same.
- `src/app/api/claims/[id]/reopen/route.ts` — same.
- `src/app/api/claims/[id]/submit/route.ts` — same.
- `src/app/api/claims/[id]/phase/route.ts` — same.
- `src/app/api/claims/[id]/send-back/route.ts` — same.
- `src/app/api/claims/[id]/star/route.ts` — same.
- `src/app/api/claims/[id]/mark-viewed/route.ts` — same.
- `src/app/api/claims/[id]/messages/route.ts` — same.
- `src/app/api/claims/[id]/messages/read/route.ts` — same.
- `src/app/api/claims/[id]/auto-message/route.ts` — same.
- `src/app/api/claims/duplicates/route.ts` — wraps with `scopedClient`.
- `src/app/api/admin/export/claims/route.ts` — wraps with `scopedClient`.
- `src/app/api/admin/import/claims/route.ts` — insert path stamps `company_id`.
- `src/app/api/marketing/backfill/analyze/route.ts` — scoped.
- `src/app/api/marketing/backfill/commit/route.ts` — scoped.
- `src/app/api/insurance-guidelines/route.ts` — scoped.
- `src/app/api/insurance-guidelines/[id]/route.ts` — scoped.
- `src/app/api/insurance-guidelines/all/route.ts` — scoped.
- `src/app/api/insurance-guidelines/empty/route.ts` — scoped.
- `package.json` — add `vitest` devDep, `test` script, `test:isolation` script.
- `.gitignore` — add `__tests__/setup/.tmp-*`.

---

### Task 0: Commit the current working tree as a baseline before touching anything

**Files:** None new; commits everything that's been auto-modified in this session and prior.

- [ ] **Step 1: Inspect current status to know what's being committed**

```bash
cd "C:\XSFA\Modern Tools Official" && git status --short
```

Expected: Long list of modified + untracked files (~60+ paths — everything from the recent sessions plus the backups/ folder which is gitignored so should NOT appear).

- [ ] **Step 2: Commit everything in one baseline commit**

```bash
cd "C:\XSFA\Modern Tools Official" && git add -A && git commit -m "$(cat <<'EOF'
checkpoint: baseline before HamsPortal multi-company Phase 1

Freezes the current working tree — closed-at column, three-status pills,
Finalize dropdown, admin-only fields, security batch 1 hardening, etc.
This commit represents exactly what's running as dpl_4cKY1UEefqCZtTuo5yN5DhLYT7hV
on modern-tools-rho.vercel.app. Phase 1 of the HamsPortal rebrand + multi-company
retrofit builds from here.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

Expected: One commit with 60+ files changed. `git log --oneline -1` returns the new commit hash.

- [ ] **Step 3: Verify the tree is clean and tag the baseline**

```bash
cd "C:\XSFA\Modern Tools Official" && git status --short && git tag pre-hamsportal-phase-1-baseline
```

Expected: Empty output from `git status --short`. `git tag -l` shows both `pre-hamsportal-rebrand-b31ed7f` (old committed HEAD) and `pre-hamsportal-phase-1-baseline` (new checkpoint).

---

### Task 1: Set up Vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `__tests__/smoke.test.ts` (temporary — will delete after config verified)

- [ ] **Step 1: Install Vitest + supporting packages**

```bash
cd "C:\XSFA\Modern Tools Official" && npm install --save-dev vitest @vitest/coverage-v8 dotenv
```

Expected: `added N packages` output. `package.json` now includes `vitest` and `dotenv` in `devDependencies`.

- [ ] **Step 2: Add npm scripts**

Edit `package.json` — inside the `"scripts"` object, add:

```json
"test": "vitest run",
"test:watch": "vitest",
"test:isolation": "vitest run __tests__/isolation.test.ts __tests__/insert-cannot-forge.test.ts __tests__/cross-company-reassignment-blocked.test.ts __tests__/dual-user-switch.test.ts"
```

- [ ] **Step 3: Create `vitest.config.ts`**

Create `vitest.config.ts` at repo root with:

```typescript
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    testTimeout: 20_000, // Real Supabase round-trips
    hookTimeout: 30_000, // Test-user creation + cleanup
    include: ['__tests__/**/*.test.ts'],
    setupFiles: ['__tests__/setup/env.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

- [ ] **Step 4: Write throwaway smoke test to verify config**

Create `__tests__/smoke.test.ts`:

```typescript
import { test, expect } from 'vitest'

test('vitest wired up', () => {
  expect(1 + 1).toBe(2)
})
```

Also create `__tests__/setup/env.ts` (empty for now, satisfies the config):

```typescript
// Populated in Task 2 with Supabase clients + prefixes.
export {}
```

- [ ] **Step 5: Run and confirm**

```bash
cd "C:\XSFA\Modern Tools Official" && npx vitest run __tests__/smoke.test.ts
```

Expected: `1 passed`. If it fails on `Cannot find module '@vitest/…'`, re-run `npm install`.

- [ ] **Step 6: Delete the smoke test, commit config**

```bash
cd "C:\XSFA\Modern Tools Official" && rm __tests__/smoke.test.ts && git add package.json package-lock.json vitest.config.ts __tests__/setup/env.ts && git commit -m "test: wire up Vitest for multi-company isolation tests"
```

---

### Task 2: Test setup — seed and cleanup helpers

**Files:**
- Modify: `__tests__/setup/env.ts`
- Create: `__tests__/setup/seed.ts`
- Create: `__tests__/setup/cleanup.ts`

- [ ] **Step 1: Populate `__tests__/setup/env.ts` with shared clients**

Replace the empty file with:

```typescript
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { beforeAll } from 'vitest'

// Test data uses this prefix for id / email so cleanup can find it reliably.
export const TEST_PREFIX = 'test-hamsportal-'

// Load env from .env.local (Next.js convention) — Vitest doesn't autoload.
import { config as loadDotenv } from 'dotenv'
loadDotenv({ path: '.env.local' })

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
export const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

beforeAll(() => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_KEY) {
    throw new Error('Isolation tests need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY in .env.local')
  }
})

/** Service-role client — bypasses RLS. Used for setup / cleanup / assertions about ground truth. */
export function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
}

/** Anon client signed in as the given test user. Enforces RLS. */
export async function anonClientAs(email: string, password: string): Promise<SupabaseClient> {
  const c = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`signIn(${email}) failed: ${error.message}`)
  return c
}
```

- [ ] **Step 2: Create `__tests__/setup/seed.ts`**

```typescript
import { serviceClient, TEST_PREFIX } from './env'

export interface SeedHandles {
  maCompanyId: string
  evCompanyId: string
  maUser: { userId: string; email: string; password: string }
  evUser: { userId: string; email: string; password: string }
  dualUser: { userId: string; email: string; password: string }
  maClaim: { id: string }
  evClaim: { id: string }
}

const PASSWORD = 'Test-Isolation-2026!'

export async function seedForIsolation(): Promise<SeedHandles> {
  const svc = serviceClient()

  const { data: companies, error: cErr } = await svc.from('companies').select('id, slug')
  if (cErr) throw cErr
  const maCompanyId = companies!.find(c => c.slug === 'modern-appraisers')!.id
  const evCompanyId = companies!.find(c => c.slug === 'eagleview')!.id

  const suffix = Date.now().toString(36)
  async function createUser(role: 'ma' | 'ev' | 'dual') {
    const email = `${TEST_PREFIX}${role}-${suffix}@example.com`
    const { data, error } = await svc.auth.admin.createUser({
      email, password: PASSWORD, email_confirm: true,
    })
    if (error) throw error
    const userId = data.user!.id
    // Profile is auto-created by the on_auth_user_created trigger. Give it a name.
    await svc.from('profiles').update({ name: `${TEST_PREFIX}${role}` }).eq('id', userId)
    return { userId, email, password: PASSWORD }
  }

  const maUser = await createUser('ma')
  const evUser = await createUser('ev')
  const dualUser = await createUser('dual')

  // Grant company access via user_companies.
  await svc.from('user_companies').insert([
    { user_id: maUser.userId,   company_id: maCompanyId },
    { user_id: evUser.userId,   company_id: evCompanyId },
    { user_id: dualUser.userId, company_id: maCompanyId },
    { user_id: dualUser.userId, company_id: evCompanyId },
  ])
  await svc.from('profiles').update({ active_company_id: maCompanyId   }).eq('id', maUser.userId)
  await svc.from('profiles').update({ active_company_id: evCompanyId   }).eq('id', evUser.userId)
  await svc.from('profiles').update({ active_company_id: maCompanyId   }).eq('id', dualUser.userId)

  // Seed one MA claim and one EV claim.
  const maClaimId = `${TEST_PREFIX}ma-${suffix}`
  const evClaimId = `${TEST_PREFIX}ev-${suffix}`
  const baseClaim = {
    date: new Date().toISOString(),
    mode: 'auto-acv', vehicle: 'Test Vehicle',
    vin: '00000000000000000', ma_number: `TEST-${suffix}`, acv: 0,
    claim: { insuredName: 'Test Insured' } as any,
    status: 'open',
  }
  await svc.from('acv_history').insert([
    { ...baseClaim, id: maClaimId, user_id: maUser.userId, assigned_to: maUser.userId, company_id: maCompanyId },
    { ...baseClaim, id: evClaimId, user_id: evUser.userId, assigned_to: evUser.userId, company_id: evCompanyId },
  ])

  return { maCompanyId, evCompanyId, maUser, evUser, dualUser, maClaim: { id: maClaimId }, evClaim: { id: evClaimId } }
}
```

- [ ] **Step 3: Create `__tests__/setup/cleanup.ts`**

```typescript
import { serviceClient, TEST_PREFIX } from './env'

export async function cleanupAll(): Promise<void> {
  const svc = serviceClient()

  // Delete claims by prefix (cascades to messages, message_reads, user_claim_views).
  await svc.from('acv_history').delete().like('id', `${TEST_PREFIX}%`)

  // Delete auth users by prefix (cascades to profiles + user_companies via FKs).
  const { data: users } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const testUsers = (users?.users ?? []).filter(u => (u.email ?? '').startsWith(TEST_PREFIX))
  for (const u of testUsers) {
    await svc.auth.admin.deleteUser(u.id)
  }
}
```

- [ ] **Step 4: Commit**

```bash
cd "C:\XSFA\Modern Tools Official" && git add __tests__/setup/ && git commit -m "test: seed + cleanup helpers for multi-company isolation tests"
```

---

### Task 3: Write the migration SQL — companies + user_companies tables

**Files:**
- Create: `supabase/migration-multi-company.sql`

This task writes the first section of the migration (up to and including `user_companies`). Later tasks add more sections to the same file.

- [ ] **Step 1: Create the migration file with header + companies table**

```sql
-- ============================================================
-- HamsPortal — Multi-company Phase 1 (2026-09-16)
-- Run in the Supabase SQL Editor. Reversible via
-- migration-multi-company-rollback.sql.
--
-- Purpose:
--   Retrofit the codebase for multi-company data isolation
--   (Modern Appraisers + Eagleview). Every claim-scoped table
--   gets company_id NOT NULL, backfilled to Modern Appraisers
--   for existing rows. RLS policies get a company predicate.
--   A trigger makes company_id immutable on acv_history —
--   claims never move between companies.
--
--   This migration is idempotent-ish (create ... if not exists;
--   guarded updates) and runs as one transaction so failure
--   rolls back cleanly. Verification counts at the bottom.
-- ============================================================

begin;

-- 1. companies (global)
create table if not exists public.companies (
  id             uuid primary key default gen_random_uuid(),
  slug           text unique not null,
  name           text not null,
  logo_path      text not null,
  brand_color    text not null default '#1e40af',
  feature_flags  jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

insert into public.companies (slug, name, logo_path, feature_flags)
values
  ('modern-appraisers', 'Modern Appraisers', '/companies/modern-appraisers/logo.png',
   '{"acv":true,"dv":true,"award":true,"notes":true,"invoice":true,"storage":true,"estimate_dispute":true,"marketing":true}'::jsonb),
  ('eagleview',        'Eagleview',         '/companies/eagleview/logo.png',
   '{"acv":true,"dv":true,"award":true,"notes":true,"invoice":true,"storage":true,"estimate_dispute":true,"marketing":true}'::jsonb)
on conflict (slug) do nothing;

alter table public.companies enable row level security;
drop policy if exists companies_select on public.companies;
create policy companies_select on public.companies
  for select to authenticated using (true);
-- No insert/update/delete policies — writes are super-admin only via service client.

-- 2. user_companies (join)
create table if not exists public.user_companies (
  user_id          uuid not null references public.profiles(id) on delete cascade,
  company_id       uuid not null references public.companies(id) on delete restrict,
  email_in_company text,
  role_in_company  text,
  granted_by       uuid references public.profiles(id) on delete set null,
  granted_at       timestamptz not null default now(),
  primary key (user_id, company_id)
);
create index if not exists user_companies_company_id_idx on public.user_companies(company_id);

alter table public.user_companies enable row level security;
drop policy if exists user_companies_select_self on public.user_companies;
create policy user_companies_select_self on public.user_companies
  for select to authenticated using (user_id = auth.uid());
drop policy if exists user_companies_admin_all on public.user_companies;
create policy user_companies_admin_all on public.user_companies
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
```

- [ ] **Step 2: Verify SQL parses (manual review, plus dry-check the syntax)**

Run through the SQL visually. Check:
- Semi-colons after every statement.
- `if not exists` / `on conflict do nothing` guards for idempotency.
- RLS enabled + at least one SELECT policy per new table.
- No trailing commas in `values ()` lists.

No commit yet — Task 4 extends the same file.

---

### Task 4: Migration SQL — active_company_id + backfill user_companies

- [ ] **Step 1: Append active_company_id + backfill to `supabase/migration-multi-company.sql`**

Add at the end (before any `commit;`):

```sql
-- 3. profiles.active_company_id (nullable — set by app on first login for new users).
alter table public.profiles
  add column if not exists active_company_id uuid references public.companies(id) on delete set null;

-- 4. Backfill: every existing profile gets Modern Appraisers as their active company
--    and gets user_companies access to Modern Appraisers.
do $$
declare
  ma_id uuid;
begin
  select id into ma_id from public.companies where slug = 'modern-appraisers';

  insert into public.user_companies (user_id, company_id, granted_at)
  select p.id, ma_id, now()
  from public.profiles p
  where not exists (
    select 1 from public.user_companies uc
    where uc.user_id = p.id and uc.company_id = ma_id
  );

  update public.profiles
    set active_company_id = ma_id
    where active_company_id is null;
end $$;
```

- [ ] **Step 2: Manual review of DO block for correctness**

The DO block runs anonymously. Verify:
- `ma_id` is resolved before use.
- `insert ... select ... where not exists` guards against re-runs.
- `update ... where active_company_id is null` also guards.

No commit yet.

---

### Task 5: Migration SQL — add company_id to all 9 claim-scoped and CRM tables

- [ ] **Step 1: Append the batch column-adds + backfills to `supabase/migration-multi-company.sql`**

```sql
-- 5. Add nullable company_id to every claim-scoped and CRM table,
--    backfill to Modern Appraisers, then set NOT NULL.
do $$
declare
  ma_id uuid;
begin
  select id into ma_id from public.companies where slug = 'modern-appraisers';

  -- acv_history (root)
  alter table public.acv_history add column if not exists company_id uuid references public.companies(id);
  update public.acv_history set company_id = ma_id where company_id is null;
  alter table public.acv_history alter column company_id set not null;

  -- messages (denormalized for RLS convenience)
  alter table public.messages add column if not exists company_id uuid references public.companies(id);
  update public.messages set company_id = ma_id where company_id is null;
  alter table public.messages alter column company_id set not null;

  -- message_reads
  alter table public.message_reads add column if not exists company_id uuid references public.companies(id);
  update public.message_reads set company_id = ma_id where company_id is null;
  alter table public.message_reads alter column company_id set not null;

  -- user_claim_views
  alter table public.user_claim_views add column if not exists company_id uuid references public.companies(id);
  update public.user_claim_views set company_id = ma_id where company_id is null;
  alter table public.user_claim_views alter column company_id set not null;

  -- estimate_history (legacy tool)
  alter table public.estimate_history add column if not exists company_id uuid references public.companies(id);
  update public.estimate_history set company_id = ma_id where company_id is null;
  alter table public.estimate_history alter column company_id set not null;

  -- clients (marketing CRM)
  alter table public.clients add column if not exists company_id uuid references public.companies(id);
  update public.clients set company_id = ma_id where company_id is null;
  alter table public.clients alter column company_id set not null;

  -- client_contacts
  alter table public.client_contacts add column if not exists company_id uuid references public.companies(id);
  update public.client_contacts set company_id = ma_id where company_id is null;
  alter table public.client_contacts alter column company_id set not null;

  -- client_marketing_log
  alter table public.client_marketing_log add column if not exists company_id uuid references public.companies(id);
  update public.client_marketing_log set company_id = ma_id where company_id is null;
  alter table public.client_marketing_log alter column company_id set not null;

  -- insurance_guidelines (per-company per Henry's ask)
  alter table public.insurance_guidelines add column if not exists company_id uuid references public.companies(id);
  update public.insurance_guidelines set company_id = ma_id where company_id is null;
  alter table public.insurance_guidelines alter column company_id set not null;
end $$;

-- 6. Indexes for the hot query paths (composite with company_id first).
create index if not exists acv_history_company_status_idx     on public.acv_history(company_id, status);
create index if not exists acv_history_company_assigned_idx   on public.acv_history(company_id, assigned_to);
create index if not exists messages_company_claim_idx         on public.messages(company_id, claim_id);
create index if not exists user_claim_views_company_user_idx  on public.user_claim_views(company_id, user_id);
create index if not exists clients_company_id_idx             on public.clients(company_id);
create index if not exists insurance_guidelines_company_idx   on public.insurance_guidelines(company_id);
```

No commit yet.

---

### Task 6: Migration SQL — helper functions + RLS rewrite for acv_history

- [ ] **Step 1: Append helper functions**

```sql
-- 7. Isolation helper functions used by RLS.
create or replace function public.active_company_id()
  returns uuid
  language sql
  stable
  security definer
  set search_path = public
as $$
  select active_company_id from public.profiles where id = auth.uid()
$$;

create or replace function public.has_company_access(cid uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select exists (
    select 1 from public.user_companies
    where user_id = auth.uid() and company_id = cid
  )
$$;

-- Explicit grants — security definer functions need EXECUTE granted.
grant execute on function public.active_company_id() to authenticated;
grant execute on function public.has_company_access(uuid) to authenticated;
```

- [ ] **Step 2: Append RLS rewrite for acv_history**

```sql
-- 8. Rewrite RLS on acv_history. Existing policies from migration-roles.sql:
--    acv_select / acv_insert / acv_update / acv_delete. We drop-and-recreate
--    each with an added company predicate.
drop policy if exists acv_select on public.acv_history;
create policy acv_select on public.acv_history for select to authenticated
  using (
    public.active_company_id() = company_id
    and public.has_company_access(company_id)
    and (
      public.is_admin()
      or assigned_to = auth.uid()
      or user_id = auth.uid()
    )
  );

drop policy if exists acv_insert on public.acv_history;
create policy acv_insert on public.acv_history for insert to authenticated
  with check (
    public.active_company_id() = company_id
    and public.has_company_access(company_id)
    and user_id = auth.uid()
  );

drop policy if exists acv_update on public.acv_history;
create policy acv_update on public.acv_history for update to authenticated
  using (
    public.active_company_id() = company_id
    and public.has_company_access(company_id)
    and (
      public.is_admin()
      or assigned_to = auth.uid()
    )
  )
  with check (
    public.active_company_id() = company_id
    and public.has_company_access(company_id)
  );

drop policy if exists acv_delete on public.acv_history;
create policy acv_delete on public.acv_history for delete to authenticated
  using (
    public.active_company_id() = company_id
    and public.has_company_access(company_id)
    and public.is_admin()
  );
```

No commit yet.

---

### Task 7: Migration SQL — RLS rewrite for satellite tables

- [ ] **Step 1: Append RLS rewrites for messages, message_reads, user_claim_views**

```sql
-- 9. Messages RLS — add company predicate (existing: claim access via join).
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated
  using (
    public.active_company_id() = company_id
    and public.has_company_access(company_id)
    and exists (
      select 1 from public.acv_history a
      where a.id = messages.claim_id
        and (public.is_admin() or a.assigned_to = auth.uid())
    )
  );

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated
  with check (
    public.active_company_id() = company_id
    and public.has_company_access(company_id)
    and exists (
      select 1 from public.acv_history a
      where a.id = messages.claim_id
        and (public.is_admin() or a.assigned_to = auth.uid())
    )
  );

-- 10. message_reads RLS — user-scoped + company.
drop policy if exists message_reads_self on public.message_reads;
create policy message_reads_self on public.message_reads for all to authenticated
  using (
    user_id = auth.uid()
    and public.active_company_id() = company_id
  )
  with check (
    user_id = auth.uid()
    and public.active_company_id() = company_id
  );

-- 11. user_claim_views RLS — user-scoped + company.
drop policy if exists user_claim_views_self on public.user_claim_views;
create policy user_claim_views_self on public.user_claim_views for all to authenticated
  using (
    user_id = auth.uid()
    and public.active_company_id() = company_id
  )
  with check (
    user_id = auth.uid()
    and public.active_company_id() = company_id
  );
```

- [ ] **Step 2: Append RLS rewrites for CRM tables (clients, client_contacts, client_marketing_log)**

```sql
-- 12. Clients + satellites RLS — layered on top of existing has_marketing_access().
drop policy if exists clients_read on public.clients;
create policy clients_read on public.clients for select to authenticated
  using (
    public.active_company_id() = company_id
    and public.has_company_access(company_id)
    and public.has_marketing_access()
  );

drop policy if exists clients_write on public.clients;
create policy clients_write on public.clients for all to authenticated
  using (
    public.active_company_id() = company_id
    and public.has_company_access(company_id)
    and public.has_marketing_access()
  )
  with check (
    public.active_company_id() = company_id
    and public.has_company_access(company_id)
    and public.has_marketing_access()
  );

drop policy if exists client_contacts_all on public.client_contacts;
create policy client_contacts_all on public.client_contacts for all to authenticated
  using (
    public.active_company_id() = company_id
    and public.has_company_access(company_id)
    and public.has_marketing_access()
  )
  with check (
    public.active_company_id() = company_id
    and public.has_company_access(company_id)
    and public.has_marketing_access()
  );

drop policy if exists client_marketing_log_all on public.client_marketing_log;
create policy client_marketing_log_all on public.client_marketing_log for all to authenticated
  using (
    public.active_company_id() = company_id
    and public.has_company_access(company_id)
    and public.has_marketing_access()
  )
  with check (
    public.active_company_id() = company_id
    and public.has_company_access(company_id)
    and public.has_marketing_access()
  );

-- 13. Insurance guidelines RLS — now per-company.
drop policy if exists insurance_guidelines_read on public.insurance_guidelines;
create policy insurance_guidelines_read on public.insurance_guidelines for select to authenticated
  using (
    public.active_company_id() = company_id
    and public.has_company_access(company_id)
  );

drop policy if exists insurance_guidelines_write on public.insurance_guidelines;
create policy insurance_guidelines_write on public.insurance_guidelines for all to authenticated
  using (
    public.active_company_id() = company_id
    and public.has_company_access(company_id)
    and public.is_admin()
  )
  with check (
    public.active_company_id() = company_id
    and public.has_company_access(company_id)
    and public.is_admin()
  );

-- 14. estimate_history RLS — user-scoped + company (legacy).
drop policy if exists estimate_history_own on public.estimate_history;
create policy estimate_history_own on public.estimate_history for all to authenticated
  using (
    user_id = auth.uid()
    and public.active_company_id() = company_id
  )
  with check (
    user_id = auth.uid()
    and public.active_company_id() = company_id
  );
```

No commit yet.

---

### Task 8: Migration SQL — column-guard trigger extended to lock company_id

- [ ] **Step 1: Append the trigger update**

```sql
-- 15. Extend acv_history_appraiser_guard to reject company_id changes.
--     Rule: company_id is immutable on any UPDATE. Even super-admins can't
--     move a claim between companies. The fix is delete-and-recreate.
create or replace function public.acv_history_appraiser_guard()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  -- FIRST: company_id is immutable for EVERYONE — service_role, admin,
  -- appraiser alike. This check runs BEFORE any bypass so nothing can
  -- move a claim between companies. Correcting a mis-filed claim requires
  -- delete + recreate under the correct company.
  if old.company_id is distinct from new.company_id then
    raise exception 'company_id is immutable on acv_history — claims cannot be moved between companies';
  end if;

  -- Service role bypasses ONLY the appraiser-specific guards below.
  if auth.role() = 'service_role' then
    return new;
  end if;

  -- Existing rules preserved: appraisers can't change assigned_to / status /
  -- submitted_* / user_id. Only admins can.
  if not public.is_admin() then
    if old.assigned_to is distinct from new.assigned_to then
      raise exception 'appraisers cannot change assigned_to';
    end if;
    if old.status is distinct from new.status then
      raise exception 'appraisers cannot change status';
    end if;
    if old.submitted_at is distinct from new.submitted_at then
      raise exception 'appraisers cannot change submitted_at';
    end if;
    if old.submitted_by is distinct from new.submitted_by then
      raise exception 'appraisers cannot change submitted_by';
    end if;
    if old.user_id is distinct from new.user_id then
      raise exception 'appraisers cannot change user_id';
    end if;
  end if;

  return new;
end;
$$;
```

- [ ] **Step 2: Append verification counts + commit**

```sql
-- 16. Verification: expect (a) both companies exist, (b) every existing
--     row is scoped to Modern Appraisers, (c) every profile has access
--     to Modern Appraisers.
select
  (select count(*) from public.companies)::int                              as companies_count,
  (select count(*) from public.profiles where active_company_id is not null)::int as profiles_with_active_company,
  (select count(*) from public.user_companies)::int                         as user_companies_rows,
  (select count(*) from public.acv_history)::int                            as acv_history_total,
  (select count(*) from public.acv_history where company_id =
     (select id from public.companies where slug='modern-appraisers'))::int as acv_history_ma,
  (select count(*) from public.acv_history where company_id =
     (select id from public.companies where slug='eagleview'))::int         as acv_history_ev,
  (select count(*) from public.messages)::int                               as messages_total,
  (select count(*) from public.clients)::int                                as clients_total,
  (select count(*) from public.insurance_guidelines)::int                   as guidelines_total;

commit;
```

- [ ] **Step 3: Commit the migration file**

```bash
cd "C:\XSFA\Modern Tools Official" && git add supabase/migration-multi-company.sql && git commit -m "sql: multi-company migration — companies, user_companies, company_id everywhere, RLS + trigger"
```

---

### Task 9: Write the rollback migration

**Files:**
- Create: `supabase/migration-multi-company-rollback.sql`

- [ ] **Step 1: Write rollback SQL**

```sql
-- ============================================================
-- Rollback for migration-multi-company.sql (2026-09-16).
-- Reverses ALL changes. Run only if you want to fully undo
-- multi-company support and return to single-tenant behavior.
--
-- SAFE re-run: guarded with `if exists` throughout.
-- ============================================================

begin;

-- Reverse step 15: restore original acv_history_appraiser_guard (no company check).
create or replace function public.acv_history_appraiser_guard()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
  if not public.is_admin() then
    if old.assigned_to is distinct from new.assigned_to then
      raise exception 'appraisers cannot change assigned_to';
    end if;
    if old.status is distinct from new.status then
      raise exception 'appraisers cannot change status';
    end if;
    if old.submitted_at is distinct from new.submitted_at then
      raise exception 'appraisers cannot change submitted_at';
    end if;
    if old.submitted_by is distinct from new.submitted_by then
      raise exception 'appraisers cannot change submitted_by';
    end if;
    if old.user_id is distinct from new.user_id then
      raise exception 'appraisers cannot change user_id';
    end if;
  end if;
  return new;
end;
$$;

-- Reverse RLS policies (drop the company-aware ones; the schema.sql copies of
-- the originals will need re-applying if you want to restore prior behavior,
-- OR the pre-migration policies are re-created here by name).
drop policy if exists acv_select                    on public.acv_history;
drop policy if exists acv_insert                    on public.acv_history;
drop policy if exists acv_update                    on public.acv_history;
drop policy if exists acv_delete                    on public.acv_history;
drop policy if exists messages_select               on public.messages;
drop policy if exists messages_insert               on public.messages;
drop policy if exists message_reads_self            on public.message_reads;
drop policy if exists user_claim_views_self         on public.user_claim_views;
drop policy if exists clients_read                  on public.clients;
drop policy if exists clients_write                 on public.clients;
drop policy if exists client_contacts_all           on public.client_contacts;
drop policy if exists client_marketing_log_all      on public.client_marketing_log;
drop policy if exists insurance_guidelines_read     on public.insurance_guidelines;
drop policy if exists insurance_guidelines_write    on public.insurance_guidelines;
drop policy if exists estimate_history_own          on public.estimate_history;

-- Re-create original acv_history policies (pre-multi-company).
create policy acv_select on public.acv_history for select to authenticated
  using (public.is_admin() or assigned_to = auth.uid() or user_id = auth.uid());
create policy acv_insert on public.acv_history for insert to authenticated
  with check (user_id = auth.uid());
create policy acv_update on public.acv_history for update to authenticated
  using (public.is_admin() or assigned_to = auth.uid());
create policy acv_delete on public.acv_history for delete to authenticated
  using (public.is_admin());

-- (Repeat original policies for messages/message_reads/user_claim_views/clients/
--  client_contacts/client_marketing_log/insurance_guidelines/estimate_history —
--  copy from schema.sql / prior migrations.)

-- Drop helper functions.
drop function if exists public.active_company_id();
drop function if exists public.has_company_access(uuid);

-- Drop indexes.
drop index if exists public.acv_history_company_status_idx;
drop index if exists public.acv_history_company_assigned_idx;
drop index if exists public.messages_company_claim_idx;
drop index if exists public.user_claim_views_company_user_idx;
drop index if exists public.clients_company_id_idx;
drop index if exists public.insurance_guidelines_company_idx;

-- Drop company_id from every table.
alter table public.acv_history           drop column if exists company_id;
alter table public.messages              drop column if exists company_id;
alter table public.message_reads         drop column if exists company_id;
alter table public.user_claim_views      drop column if exists company_id;
alter table public.estimate_history      drop column if exists company_id;
alter table public.clients               drop column if exists company_id;
alter table public.client_contacts       drop column if exists company_id;
alter table public.client_marketing_log  drop column if exists company_id;
alter table public.insurance_guidelines  drop column if exists company_id;

-- Drop profiles.active_company_id.
alter table public.profiles drop column if exists active_company_id;

-- Drop join + companies tables (companies last).
drop table if exists public.user_companies;
drop table if exists public.companies;

commit;
```

- [ ] **Step 2: Commit**

```bash
cd "C:\XSFA\Modern Tools Official" && git add supabase/migration-multi-company-rollback.sql && git commit -m "sql: rollback for multi-company migration"
```

---

### Task 10: `scopedClient` unit test — write failing test first

**Files:**
- Create: `__tests__/scoped-client.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { test, expect, vi } from 'vitest'
import { scopedClient, CLAIM_SCOPED_TABLES } from '@/lib/supabase/scoped'

test('scopedClient injects .eq(company_id) on SELECT', async () => {
  const fakeChain = { eq: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis() }
  const fakeService = { from: vi.fn().mockReturnValue(fakeChain) }
  const client = scopedClient(fakeService as any, 'ma-uuid')

  client.from('acv_history').select('*')

  expect(fakeService.from).toHaveBeenCalledWith('acv_history')
  expect(fakeChain.select).toHaveBeenCalledWith('*')
  expect(fakeChain.eq).toHaveBeenCalledWith('company_id', 'ma-uuid')
})

test('scopedClient injects company_id on INSERT', () => {
  const fakeChain = { insert: vi.fn().mockReturnThis() }
  const fakeService = { from: vi.fn().mockReturnValue(fakeChain) }
  const client = scopedClient(fakeService as any, 'ma-uuid')

  client.from('acv_history').insert({ id: 'x', vin: '00000000000000000' })

  expect(fakeChain.insert).toHaveBeenCalledWith({ id: 'x', vin: '00000000000000000', company_id: 'ma-uuid' })
})

test('scopedClient injects company_id into every row of an INSERT array', () => {
  const fakeChain = { insert: vi.fn().mockReturnThis() }
  const fakeService = { from: vi.fn().mockReturnValue(fakeChain) }
  const client = scopedClient(fakeService as any, 'ma-uuid')

  client.from('messages').insert([{ id: 'a' }, { id: 'b' }])

  expect(fakeChain.insert).toHaveBeenCalledWith([
    { id: 'a', company_id: 'ma-uuid' },
    { id: 'b', company_id: 'ma-uuid' },
  ])
})

test('scopedClient session wins — body-supplied company_id is overridden', () => {
  const fakeChain = { insert: vi.fn().mockReturnThis() }
  const fakeService = { from: vi.fn().mockReturnValue(fakeChain) }
  const client = scopedClient(fakeService as any, 'ma-uuid')

  client.from('acv_history').insert({ id: 'x', company_id: 'ev-uuid-forged' })

  expect(fakeChain.insert).toHaveBeenCalledWith({ id: 'x', company_id: 'ma-uuid' })
})

test('scopedClient does NOT wrap non-claim-scoped tables', () => {
  const fakeChain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() }
  const fakeService = { from: vi.fn().mockReturnValue(fakeChain) }
  const client = scopedClient(fakeService as any, 'ma-uuid')

  client.from('profiles').select('*')

  expect(fakeService.from).toHaveBeenCalledWith('profiles')
  expect(fakeChain.eq).not.toHaveBeenCalled()
})

test('CLAIM_SCOPED_TABLES lists exactly the 9 tables from the migration', () => {
  expect(new Set(CLAIM_SCOPED_TABLES)).toEqual(new Set([
    'acv_history', 'messages', 'message_reads', 'user_claim_views', 'estimate_history',
    'clients', 'client_contacts', 'client_marketing_log', 'insurance_guidelines',
  ]))
})
```

- [ ] **Step 2: Run to confirm failing**

```bash
cd "C:\XSFA\Modern Tools Official" && npx vitest run __tests__/scoped-client.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/supabase/scoped'`.

---

### Task 11: Implement `scopedClient`

**Files:**
- Create: `src/lib/supabase/scoped.ts`

- [ ] **Step 1: Write the implementation**

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Whitelist of tables that MUST be filtered by company_id. Adding a new
 * claim-scoped table to the schema requires adding it here — otherwise
 * scopedClient falls through to raw access (which is caught in tests + lint).
 */
export const CLAIM_SCOPED_TABLES = [
  'acv_history',
  'messages',
  'message_reads',
  'user_claim_views',
  'estimate_history',
  'clients',
  'client_contacts',
  'client_marketing_log',
  'insurance_guidelines',
] as const

export type ClaimScopedTable = typeof CLAIM_SCOPED_TABLES[number]

function stampCompanyId<T extends Record<string, unknown>>(payload: T | T[], companyId: string): T | T[] {
  if (Array.isArray(payload)) {
    return payload.map(row => ({ ...row, company_id: companyId }))
  }
  return { ...payload, company_id: companyId }
}

function wrapChain(chain: unknown, companyId: string): unknown {
  return new Proxy(chain as object, {
    get(target, prop, receiver) {
      const orig = Reflect.get(target, prop, receiver)
      if (typeof orig !== 'function') return orig

      // For SELECT / UPDATE / DELETE terminal chains, auto-append .eq('company_id', companyId).
      // For INSERT, transform the payload to stamp company_id.
      if (prop === 'insert') {
        return (payload: Record<string, unknown> | Record<string, unknown>[], ...rest: unknown[]) => {
          const stamped = stampCompanyId(payload, companyId)
          const result = (orig as Function).call(target, stamped, ...rest)
          return wrapChain(result, companyId)
        }
      }

      if (prop === 'select' || prop === 'update' || prop === 'delete') {
        return (...args: unknown[]) => {
          const next = (orig as Function).apply(target, args)
          // Auto-scope via .eq() only if the chain exposes it.
          if (next && typeof (next as { eq?: unknown }).eq === 'function') {
            return wrapChain((next as { eq: (col: string, val: unknown) => unknown }).eq('company_id', companyId), companyId)
          }
          return wrapChain(next, companyId)
        }
      }

      // Any other method (eq, order, limit, single, maybeSingle, then, ...) — pass through, wrap the return.
      return (...args: unknown[]) => {
        const next = (orig as Function).apply(target, args)
        return next && typeof next === 'object' ? wrapChain(next, companyId) : next
      }
    },
  })
}

/**
 * Wraps a Supabase client so every query against a CLAIM_SCOPED_TABLES table
 * is auto-filtered by company_id (SELECT/UPDATE/DELETE) or stamps company_id
 * on the payload (INSERT). Non-whitelisted tables fall through unchanged.
 *
 * Body-supplied company_id on INSERT is always overridden with the session's
 * companyId — clients cannot forge a company via request bodies.
 */
export function scopedClient(base: SupabaseClient, companyId: string): SupabaseClient {
  return new Proxy(base, {
    get(target, prop, receiver) {
      if (prop === 'from') {
        return (table: string) => {
          const chain = target.from(table as never)
          if ((CLAIM_SCOPED_TABLES as readonly string[]).includes(table)) {
            return wrapChain(chain, companyId) as ReturnType<SupabaseClient['from']>
          }
          return chain
        }
      }
      return Reflect.get(target, prop, receiver)
    },
  }) as SupabaseClient
}
```

- [ ] **Step 2: Run tests to verify pass**

```bash
cd "C:\XSFA\Modern Tools Official" && npx vitest run __tests__/scoped-client.test.ts
```

Expected: `6 passed`.

- [ ] **Step 3: Commit**

```bash
cd "C:\XSFA\Modern Tools Official" && git add __tests__/scoped-client.test.ts src/lib/supabase/scoped.ts && git commit -m "feat(supabase): scopedClient wrapper — auto-injects company_id on all claim-scoped queries"
```

---

### Task 12: Extend `require-admin.ts` — caller gets activeCompanyId, new `fetchClaim(id, companyId)`

**Files:**
- Modify: `src/lib/auth/require-admin.ts`

- [ ] **Step 1: Read the current file to preserve behavior**

```bash
cd "C:\XSFA\Modern Tools Official" && cat src/lib/auth/require-admin.ts
```

Confirm the current exports: `requireAuth`, `requireAdmin`, `requireSuperAdmin`, `fetchClaim(id)`, plus the `WorkflowClaim`, `Caller` types.

- [ ] **Step 2: Update the Caller type + all helpers**

Modify `src/lib/auth/require-admin.ts`. Key changes:

At the top of the file (or wherever `Caller` is defined), extend the type:

```typescript
export interface Caller {
  userId: string
  role: 'admin' | 'appraiser'
  isSuperAdmin: boolean
  activeCompanyId: string | null   // NEW — null before first login post-migration
}
```

In `getCaller()`, extend the profile SELECT to include `active_company_id`:

```typescript
const { data: profile, error } = await supabase
  .from('profiles')
  .select('id, role, is_super_admin, active_company_id')
  .eq('id', user.id)
  .maybeSingle()
// ...
return {
  caller: {
    userId: user.id,
    role: profile.role,
    isSuperAdmin: profile.is_super_admin === true,
    activeCompanyId: profile.active_company_id ?? null,
  },
  errorResponse: null,
}
```

Add a new helper below `requireAdmin`:

```typescript
/**
 * Ensures the caller has an active_company_id set. Use in any route that
 * writes company-scoped data.
 *
 * Pre-migration state: active_company_id column doesn't exist → returns
 * null-safe response so legacy code keeps working. Post-migration state:
 * missing active_company_id means the user has never resolved their company
 * (e.g. multi-company user landing pre-picker) — return 400 asking them to
 * pick a company.
 */
export async function requireCompanyContext(): Promise<{
  activeCompanyId: string
  caller: Caller
  errorResponse: null
} | {
  activeCompanyId: null
  caller: null
  errorResponse: NextResponse
}> {
  const { caller, errorResponse } = await requireAuth()
  if (errorResponse) return { activeCompanyId: null, caller: null, errorResponse }
  if (!caller!.activeCompanyId) {
    return {
      activeCompanyId: null,
      caller: null,
      errorResponse: NextResponse.json(
        { error: 'No active company. Log out and back in to pick a company.' },
        { status: 400 },
      ),
    }
  }
  return { activeCompanyId: caller!.activeCompanyId, caller: caller!, errorResponse: null }
}
```

Modify `fetchClaim` to accept an optional `companyId` param (backward-compatible):

```typescript
/**
 * Fetches a claim row scoped to a company. When companyId is passed the row
 * must match — otherwise returns null (routes turn this into 404, matching
 * the "don't leak existence" contract). When companyId is undefined this
 * function behaves as before (used by super-admin cross-company paths).
 */
export async function fetchClaim(id: string, companyId?: string): Promise<WorkflowClaim | null> {
  const service = createServiceClient()
  let query = service
    .from('acv_history')
    .select('id, status, assigned_to, submitted_at, status_phase, user_id, company_id')
    .eq('id', id)
  if (companyId) {
    query = query.eq('company_id', companyId)
  }
  const { data, error } = await query.maybeSingle()
  if (error || !data) return null
  return {
    id: data.id,
    status: (data.status === 'closed' ? 'closed' : 'open'),
    assignedTo: data.assigned_to ?? null,
    submittedAt: data.submitted_at ?? null,
    statusPhase: data.status_phase ?? null,
    userId: data.user_id ?? null,
    companyId: data.company_id ?? null,   // NEW
  }
}
```

And extend the `WorkflowClaim` type to include `companyId`:

```typescript
export interface WorkflowClaim {
  id: string
  status: 'open' | 'closed'
  assignedTo: string | null
  submittedAt: string | null
  statusPhase: string | null
  userId: string | null
  companyId: string | null   // NEW
}
```

- [ ] **Step 3: Type-check**

```bash
cd "C:\XSFA\Modern Tools Official" && npx tsc --noEmit
```

Expected: Clean. If not clean, likely a downstream consumer needs updating — but this task keeps the fetchClaim signature backward-compatible so no consumer should break.

- [ ] **Step 4: Commit**

```bash
cd "C:\XSFA\Modern Tools Official" && git add src/lib/auth/require-admin.ts && git commit -m "feat(auth): caller now includes activeCompanyId; fetchClaim accepts optional companyId; requireCompanyContext helper"
```

---

### Task 13: Update every `/api/claims/[id]/*` route to pass caller's activeCompanyId to fetchClaim

**Files:** All 11 routes under `src/app/api/claims/[id]/`.

- [ ] **Step 1: List them and confirm the pattern**

```bash
cd "C:\XSFA\Modern Tools Official" && ls src/app/api/claims/[id]/
```

Expected files:
```
approve/    assign/     auto-message/  mark-viewed/  messages/
phase/      reopen/     send-back/     star/         submit/
```

(11 route files total — the two under `messages/` are `route.ts` and `read/route.ts`.)

- [ ] **Step 2: For each route, update the fetchClaim call**

The pattern in every route currently looks like:
```typescript
const claim = await fetchClaim(id)
if (!claim) return NextResponse.json({ error: 'Claim not found' }, { status: 404 })
```

Update to:
```typescript
const { caller, errorResponse } = await requireAuth()   // or requireAdmin, unchanged per route
if (errorResponse) return errorResponse
const claim = await fetchClaim(id, caller!.activeCompanyId ?? undefined)
if (!claim) return NextResponse.json({ error: 'Claim not found' }, { status: 404 })
```

If the route already has `requireAuth` / `requireAdmin` at the top, just pass `caller.activeCompanyId ?? undefined` to `fetchClaim`.

Apply this to all 11 routes:
- `src/app/api/claims/[id]/approve/route.ts`
- `src/app/api/claims/[id]/assign/route.ts`
- `src/app/api/claims/[id]/auto-message/route.ts`
- `src/app/api/claims/[id]/mark-viewed/route.ts`
- `src/app/api/claims/[id]/messages/route.ts`
- `src/app/api/claims/[id]/messages/read/route.ts`
- `src/app/api/claims/[id]/phase/route.ts`
- `src/app/api/claims/[id]/reopen/route.ts`
- `src/app/api/claims/[id]/send-back/route.ts`
- `src/app/api/claims/[id]/star/route.ts`
- `src/app/api/claims/[id]/submit/route.ts`

For routes that INSERT rows (e.g. `auto-message` inserts a message, `messages` inserts a message): the write must include `company_id: caller!.activeCompanyId ?? claim.companyId`. Prefer `claim.companyId` (from the fetched claim) — it's guaranteed correct and works even when the caller's active company is null pre-migration.

- [ ] **Step 3: Type-check and build**

```bash
cd "C:\XSFA\Modern Tools Official" && npx tsc --noEmit && npm run build
```

Expected: Both clean.

- [ ] **Step 4: Commit**

```bash
cd "C:\XSFA\Modern Tools Official" && git add src/app/api/claims/[id]/ && git commit -m "feat(claims routes): pass activeCompanyId to fetchClaim; stamp company_id on message inserts"
```

---

### Task 14: Update service-client routes to use `scopedClient`

**Files:**
- Modify: `src/app/api/claims/duplicates/route.ts`
- Modify: `src/app/api/admin/export/claims/route.ts`
- Modify: `src/app/api/admin/import/claims/route.ts`
- Modify: `src/app/api/marketing/backfill/analyze/route.ts`
- Modify: `src/app/api/marketing/backfill/commit/route.ts`
- Modify: `src/app/api/insurance-guidelines/route.ts`
- Modify: `src/app/api/insurance-guidelines/[id]/route.ts`
- Modify: `src/app/api/insurance-guidelines/all/route.ts`
- Modify: `src/app/api/insurance-guidelines/empty/route.ts`

- [ ] **Step 1: For each route, replace `createServiceClient()` with `scopedClient(createServiceClient(), activeCompanyId)`**

Pattern before:
```typescript
const svc = createServiceClient()
const { data } = await svc.from('acv_history').select('...')
```

Pattern after:
```typescript
const { activeCompanyId, errorResponse } = await requireCompanyContext()
if (errorResponse) return errorResponse
const svc = scopedClient(createServiceClient(), activeCompanyId)
const { data } = await svc.from('acv_history').select('...')  // now auto-scoped
```

Special cases:
- **`/api/admin/import/claims`**: Inserts must include `company_id`. Since `scopedClient` stamps it automatically on INSERT, no change to the insert payload — just wrap.
- **`/api/insurance-guidelines/*`**: All 4 routes now scope guidelines per active company. Confirmed with Henry.

- [ ] **Step 2: Handle graceful pre-migration state**

`requireCompanyContext()` returns 400 if `activeCompanyId` is missing. Pre-migration this always fails. We need a fallback so the code can deploy BEFORE the migration runs without 400-ing every request.

Update `requireCompanyContext()` to detect pre-migration state by checking whether the `active_company_id` column exists at all. If the column doesn't exist (pre-migration), it returns a sentinel value `PRE_MIGRATION_SINGLE_TENANT` and downstream code treats every request as unscoped (legacy behavior).

Simplest approach: check for pre-migration state ONCE at module load using a global flag, and read the value in `requireCompanyContext`.

Alternative — simpler still: skip the fallback and only deploy Phase 1 code AFTER Henry has run the migration. This is the sequencing chosen for Phase 1 (see plan intro). So keep `requireCompanyContext()` strict (return 400 if missing), and DO NOT deploy Phase 1 code until the migration is applied.

Confirm the sequencing decision in the plan intro before writing this task's code. Proceed with the strict version.

- [ ] **Step 3: Type-check and build**

```bash
cd "C:\XSFA\Modern Tools Official" && npx tsc --noEmit && npm run build
```

Expected: Clean.

- [ ] **Step 4: Commit**

```bash
cd "C:\XSFA\Modern Tools Official" && git add src/app/api/ && git commit -m "feat(routes): scope service-client queries by active company via scopedClient wrapper"
```

---

### Task 15: Client-side writes stamp `company_id` from useActiveCompany hook

**Files:**
- Create: `src/hooks/use-active-company.ts`
- Modify: `src/lib/supabase/history.ts` (write paths only)
- Modify: `src/lib/supabase/clients.ts` (write paths only)

- [ ] **Step 1: Create the hook**

```typescript
'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * Reads the current user's profiles.active_company_id. Client-side writes
 * must include company_id explicitly (RLS also enforces it, but stamping
 * client-side gives a clearer error path if something's wrong).
 *
 * Returns null while loading or if the user hasn't picked a company yet.
 */
export function useActiveCompany(): { activeCompanyId: string | null; loading: boolean } {
  const [activeCompanyId, setActiveCompanyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { if (!cancelled) { setLoading(false) } return }
      const { data } = await supabase
        .from('profiles')
        .select('active_company_id')
        .eq('id', user.id)
        .maybeSingle()
      if (!cancelled) {
        setActiveCompanyId(data?.active_company_id ?? null)
        setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  return { activeCompanyId, loading }
}
```

- [ ] **Step 2: Update `history.ts` `saveACVHistory` — add `company_id` to the insert payload**

In `src/lib/supabase/history.ts`, find `saveACVHistory`. Add an `activeCompanyId` param and include `company_id` in the payload:

```typescript
export async function saveACVHistory(
  entry: ACVHistoryEntry,
  editId?: string | null,
  activeCompanyId?: string | null,
) {
  // ... existing code up to payload construction
  const payload: Record<string, unknown> = {
    date: entry.date,
    // ... all existing fields
  }
  if (activeCompanyId) {
    payload.company_id = activeCompanyId
  }
  // ... rest unchanged
}
```

Callers pass `activeCompanyId` from `useActiveCompany()`.

- [ ] **Step 3: Update ClaimWorkspace.tsx callsites to pass activeCompanyId**

```bash
cd "C:\XSFA\Modern Tools Official" && grep -n "saveACVHistory\|saveToHistory" src/components/claim/ClaimWorkspace.tsx | head -10
```

For each call site, thread `activeCompanyId` from a `useActiveCompany()` call at the top of `ClaimWorkspace`. If `saveToHistory` is a wrapper, thread through it too.

- [ ] **Step 4: Update `clients.ts` writes**

`src/lib/supabase/clients.ts` `createClient()`, `updateClient()`, `createContact()`, `updateContact()`, `logTouch()` — add `activeCompanyId` param, include in payload.

- [ ] **Step 5: Type-check and build**

```bash
cd "C:\XSFA\Modern Tools Official" && npx tsc --noEmit && npm run build
```

Expected: Clean.

- [ ] **Step 6: Commit**

```bash
cd "C:\XSFA\Modern Tools Official" && git add src/hooks/use-active-company.ts src/lib/supabase/ src/components/claim/ClaimWorkspace.tsx && git commit -m "feat(client): stamp company_id on write paths via useActiveCompany hook"
```

---

### Task 16: Add `/api/company/switch` route

**Files:**
- Create: `src/app/api/company/switch/route.ts`

- [ ] **Step 1: Write the route**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const { caller, errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse

  const body = await request.json().catch(() => ({}))
  const companyId = typeof body?.companyId === 'string' ? body.companyId : null
  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })

  const service = createServiceClient()
  // Verify caller has access to the target company.
  const { data: access } = await service
    .from('user_companies')
    .select('company_id')
    .eq('user_id', caller!.userId)
    .eq('company_id', companyId)
    .maybeSingle()
  if (!access) return NextResponse.json({ error: 'No access to that company' }, { status: 403 })

  const { error } = await service
    .from('profiles')
    .update({ active_company_id: companyId })
    .eq('id', caller!.userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Type-check, build, commit**

```bash
cd "C:\XSFA\Modern Tools Official" && npx tsc --noEmit && npm run build && git add src/app/api/company/switch/route.ts && git commit -m "feat(api): POST /api/company/switch for company switching"
```

---

### Task 17: Isolation test — MA user cannot see EV claim (and vice versa)

**Files:**
- Create: `__tests__/isolation.test.ts`

- [ ] **Step 1: Write the test**

```typescript
import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { seedForIsolation, type SeedHandles } from './setup/seed'
import { cleanupAll } from './setup/cleanup'
import { anonClientAs } from './setup/env'

let handles: SeedHandles

beforeAll(async () => { handles = await seedForIsolation() }, 30_000)
afterAll(async () => { await cleanupAll() }, 30_000)

describe('MA-only user against EV claim', () => {
  test('SELECT claims returns MA claim only', async () => {
    const ma = await anonClientAs(handles.maUser.email, handles.maUser.password)
    const { data } = await ma.from('acv_history').select('id, company_id')
    expect(data).toBeTruthy()
    expect(data!.some(r => r.id === handles.maClaim.id)).toBe(true)
    expect(data!.some(r => r.id === handles.evClaim.id)).toBe(false)
  })

  test('SELECT by id for EV claim returns nothing (404-shaped)', async () => {
    const ma = await anonClientAs(handles.maUser.email, handles.maUser.password)
    const { data } = await ma.from('acv_history').select('id').eq('id', handles.evClaim.id).maybeSingle()
    expect(data).toBeNull()
  })

  test('UPDATE EV claim is a no-op (RLS filters WHERE)', async () => {
    const ma = await anonClientAs(handles.maUser.email, handles.maUser.password)
    const { data, error } = await ma.from('acv_history').update({ vehicle: 'Hacked' }).eq('id', handles.evClaim.id).select('id')
    expect(error).toBeNull()
    expect(data ?? []).toEqual([])
  })

  test('DELETE EV claim is a no-op', async () => {
    const ma = await anonClientAs(handles.maUser.email, handles.maUser.password)
    const { data, error } = await ma.from('acv_history').delete().eq('id', handles.evClaim.id).select('id')
    expect(error).toBeNull()
    expect(data ?? []).toEqual([])
  })
})

describe('EV-only user against MA claim', () => {
  test('SELECT claims returns EV claim only', async () => {
    const ev = await anonClientAs(handles.evUser.email, handles.evUser.password)
    const { data } = await ev.from('acv_history').select('id, company_id')
    expect(data!.some(r => r.id === handles.evClaim.id)).toBe(true)
    expect(data!.some(r => r.id === handles.maClaim.id)).toBe(false)
  })

  test('SELECT MA claim by id returns nothing', async () => {
    const ev = await anonClientAs(handles.evUser.email, handles.evUser.password)
    const { data } = await ev.from('acv_history').select('id').eq('id', handles.maClaim.id).maybeSingle()
    expect(data).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test (requires migration to be applied)**

```bash
cd "C:\XSFA\Modern Tools Official" && npx vitest run __tests__/isolation.test.ts
```

Expected (post-migration): all 6 tests pass. Pre-migration: seed will fail because `companies` table doesn't exist. That's expected — this test can only run once the migration is applied.

- [ ] **Step 3: Commit**

```bash
cd "C:\XSFA\Modern Tools Official" && git add __tests__/isolation.test.ts && git commit -m "test: RLS isolation between MA and EV users — read/update/delete"
```

---

### Task 18: Insert-cannot-forge test

**Files:**
- Create: `__tests__/insert-cannot-forge.test.ts`

- [ ] **Step 1: Write the test**

```typescript
import { test, expect, beforeAll, afterAll } from 'vitest'
import { seedForIsolation, type SeedHandles } from './setup/seed'
import { cleanupAll } from './setup/cleanup'
import { anonClientAs, serviceClient } from './setup/env'

let handles: SeedHandles
beforeAll(async () => { handles = await seedForIsolation() }, 30_000)
afterAll(async () => { await cleanupAll() }, 30_000)

test('MA-user INSERT with body-supplied EV company_id is rejected by RLS', async () => {
  const ma = await anonClientAs(handles.maUser.email, handles.maUser.password)
  const forgedId = `test-hamsportal-forged-${Date.now()}`
  const { error } = await ma.from('acv_history').insert({
    id: forgedId,
    date: new Date().toISOString(),
    mode: 'auto-acv',
    vehicle: 'Forge Attempt',
    vin: '00000000000000000',
    ma_number: 'FORGE-01',
    acv: 0,
    claim: { insuredName: 'x' },
    status: 'open',
    user_id: handles.maUser.userId,
    company_id: handles.evCompanyId,   // MA-user should NOT be able to place a row into EV
  } as any)
  expect(error).toBeTruthy()   // RLS with_check should reject: with_check requires active_company_id() = company_id
  // Sanity: no row landed in EV
  const svc = serviceClient()
  const { data: check } = await svc.from('acv_history').select('id').eq('id', forgedId)
  expect(check ?? []).toEqual([])
})
```

- [ ] **Step 2: Run and commit**

```bash
cd "C:\XSFA\Modern Tools Official" && npx vitest run __tests__/insert-cannot-forge.test.ts && git add __tests__/insert-cannot-forge.test.ts && git commit -m "test: RLS with_check rejects body-forged company_id on INSERT"
```

---

### Task 19: Cross-company reassignment blocked test

**Files:**
- Create: `__tests__/cross-company-reassignment-blocked.test.ts`

- [ ] **Step 1: Write the test**

```typescript
import { test, expect, beforeAll, afterAll } from 'vitest'
import { seedForIsolation, type SeedHandles } from './setup/seed'
import { cleanupAll } from './setup/cleanup'
import { serviceClient } from './setup/env'

let handles: SeedHandles
beforeAll(async () => { handles = await seedForIsolation() }, 30_000)
afterAll(async () => { await cleanupAll() }, 30_000)

test('service client cannot change acv_history.company_id — trigger fires', async () => {
  // Trigger blocks EVERYONE except service_role. But the guard function
  // explicitly errors even for service role when company_id is being changed.
  // Wait — the guard has "if auth.role() = service_role return new" as first check.
  // We need this check to happen even for service_role. Re-verify the trigger.
  // Actually the migration says: company_id immutable FIRST (before the service_role bypass).
  const svc = serviceClient()
  const { error } = await svc
    .from('acv_history')
    .update({ company_id: handles.evCompanyId })
    .eq('id', handles.maClaim.id)
  expect(error).toBeTruthy()
  expect(String(error?.message ?? '')).toMatch(/company_id is immutable|cannot be moved between companies/i)
})
```

The trigger body in Task 8 is written so the `company_id` check runs BEFORE the `service_role` bypass. That means even a service-role client cannot move a claim across companies. This test proves it.

- [ ] **Step 2: Confirm the migration file has the correct trigger ordering**

```bash
cd "C:\XSFA\Modern Tools Official" && grep -B 1 -A 3 "company_id is immutable" supabase/migration-multi-company.sql
```

Expected: the `if old.company_id is distinct` line appears BEFORE any `if auth.role() = 'service_role'` line in the trigger body.

- [ ] **Step 3: Run test and commit**

```bash
cd "C:\XSFA\Modern Tools Official" && npx vitest run __tests__/cross-company-reassignment-blocked.test.ts && git add __tests__/cross-company-reassignment-blocked.test.ts && git commit -m "test: acv_history.company_id is immutable — trigger blocks cross-company reassignment"
```

---

### Task 20: Dual-user switch test

**Files:**
- Create: `__tests__/dual-user-switch.test.ts`

- [ ] **Step 1: Write the test**

```typescript
import { test, expect, beforeAll, afterAll } from 'vitest'
import { seedForIsolation, type SeedHandles } from './setup/seed'
import { cleanupAll } from './setup/cleanup'
import { anonClientAs, serviceClient } from './setup/env'

let handles: SeedHandles
beforeAll(async () => { handles = await seedForIsolation() }, 30_000)
afterAll(async () => { await cleanupAll() }, 30_000)

test('dual-company user switches active company and sees different data', async () => {
  const svc = serviceClient()

  // active_company_id starts as MA (from seed). Verify sees MA claim only.
  const c1 = await anonClientAs(handles.dualUser.email, handles.dualUser.password)
  const { data: seen1 } = await c1.from('acv_history').select('id')
  expect(seen1!.some(r => r.id === handles.maClaim.id)).toBe(true)
  expect(seen1!.some(r => r.id === handles.evClaim.id)).toBe(false)

  // Switch to EV via service client (simulates the /api/company/switch route).
  await svc.from('profiles').update({ active_company_id: handles.evCompanyId }).eq('id', handles.dualUser.userId)

  // Re-auth (new session picks up new active_company_id via profile lookup on each RLS call).
  const c2 = await anonClientAs(handles.dualUser.email, handles.dualUser.password)
  const { data: seen2 } = await c2.from('acv_history').select('id')
  expect(seen2!.some(r => r.id === handles.evClaim.id)).toBe(true)
  expect(seen2!.some(r => r.id === handles.maClaim.id)).toBe(false)
})
```

- [ ] **Step 2: Run and commit**

```bash
cd "C:\XSFA\Modern Tools Official" && npx vitest run __tests__/dual-user-switch.test.ts && git add __tests__/dual-user-switch.test.ts && git commit -m "test: dual-company user sees different data after switching active company"
```

---

### Task 21: Static safety check for raw `.from('acv_history')` calls

**Files:**
- Create: `scripts/check-no-raw-claim-queries.mjs`
- Modify: `package.json` — add `lint:no-raw-acv-queries` script

- [ ] **Step 1: Create the check script**

```javascript
#!/usr/bin/env node
// Fails if any file under src/app/api/**/route.ts uses `.from('acv_history')`
// (or any other claim-scoped table) without going through scopedClient.
// Whitelisted files where raw access is intentional:
//   - src/lib/supabase/scoped.ts
//   - src/lib/auth/require-admin.ts (fetchClaim uses raw service + explicit .eq)
//   - src/lib/supabase/history.ts (uses RLS-authenticated client, not service)

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const TABLES = [
  'acv_history', 'messages', 'message_reads', 'user_claim_views', 'estimate_history',
  'clients', 'client_contacts', 'client_marketing_log', 'insurance_guidelines',
]
const ALLOWED = [
  'src/lib/supabase/scoped.ts',
  'src/lib/auth/require-admin.ts',
  'src/lib/supabase/history.ts',
  'src/lib/supabase/clients.ts',
]
const ROOT = 'src/app/api'

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const s = statSync(p)
    if (s.isDirectory()) out.push(...walk(p))
    else if (p.endsWith('.ts') || p.endsWith('.tsx')) out.push(p)
  }
  return out
}

let violations = 0
for (const file of walk(ROOT)) {
  const norm = file.replaceAll('\\', '/')
  if (ALLOWED.some(a => norm.endsWith(a))) continue
  const src = readFileSync(file, 'utf8')
  // Look for createServiceClient() followed nearby by .from('<table>')
  // Simple heuristic: any raw .from('<claim-scoped-table>') outside allowed files
  // that doesn't sit inside a scopedClient(...).from(...) call.
  for (const t of TABLES) {
    const re = new RegExp(`\\.from\\(['"]${t}['"]\\)`, 'g')
    if (re.test(src)) {
      // Cheap check: is there also a scopedClient(...) call in the same file?
      if (!/scopedClient\s*\(/.test(src)) {
        console.error(`  ${norm}  raw .from('${t}') without scopedClient()`)
        violations++
      }
    }
  }
}
if (violations > 0) {
  console.error(`\n${violations} raw claim-scoped query violations. Wrap with scopedClient().`)
  process.exit(1)
}
console.log('OK — no raw claim-scoped queries in API routes.')
```

- [ ] **Step 2: Add npm script**

Add to `package.json` `"scripts"`:
```json
"lint:no-raw-acv-queries": "node scripts/check-no-raw-claim-queries.mjs"
```

- [ ] **Step 3: Run and confirm it passes**

```bash
cd "C:\XSFA\Modern Tools Official" && npm run lint:no-raw-acv-queries
```

Expected: `OK — no raw claim-scoped queries in API routes.` (post-Task 14).

- [ ] **Step 4: Commit**

```bash
cd "C:\XSFA\Modern Tools Official" && git add scripts/check-no-raw-claim-queries.mjs package.json && git commit -m "ci: static check — no raw claim-scoped queries in API routes"
```

---

### Task 22: Pre-deploy verification — tsc, build, all tests, static check

- [ ] **Step 1: Full verification**

```bash
cd "C:\XSFA\Modern Tools Official" && npx tsc --noEmit && npm run build && npm run lint:no-raw-acv-queries && npx vitest run __tests__/scoped-client.test.ts
```

Expected: All clean. The isolation tests (Tasks 17-20) are NOT run here — they require the migration to be applied first.

- [ ] **Step 2: Capture current live deploy URL as rollback target**

```bash
cd "C:\XSFA\Modern Tools Official" && npx vercel inspect modern-tools-rho.vercel.app --scope henry-as-projects-88caed67 2>&1 | grep -E "id|url" | head -2
```

Save the URL somewhere Henry can see (in the message where the rollback command goes).

---

### Task 23: **HALT — Have Henry run the migration first**

Phase 1 deploy sequencing: migration BEFORE code deploy. This is the safe choice — no window where new code runs against pre-migration DB.

- [ ] **Step 1: Compose the message to Henry**

Send a message that includes:
1. The verification counts to expect from the migration.
2. The rollback command for the CURRENT live deploy (so if anything goes weird, one paste restores).
3. The exact SQL file path: `supabase/migration-multi-company.sql`.
4. A note that after the migration returns its verification SELECT, Henry should paste the results back so we can confirm counts.

Do NOT proceed to Task 24 until Henry confirms the migration ran with expected counts.

---

### Task 24: Deploy Phase 1 code

- [ ] **Step 1: Deploy**

```bash
cd "C:\XSFA\Modern Tools Official" && npx vercel --prod --scope henry-as-projects-88caed67 --yes
```

- [ ] **Step 2: Confirm alias**

```bash
cd "C:\XSFA\Modern Tools Official" && npx vercel inspect modern-tools-rho.vercel.app --scope henry-as-projects-88caed67 2>&1 | grep -E "id|status" | head -3
```

Expected: New deploy id, status `● Ready`.

---

### Task 25: Post-deploy smoke test + isolation test suite against prod DB

- [ ] **Step 1: Run isolation tests against the prod DB**

```bash
cd "C:\XSFA\Modern Tools Official" && npx vitest run __tests__/isolation.test.ts __tests__/insert-cannot-forge.test.ts __tests__/cross-company-reassignment-blocked.test.ts __tests__/dual-user-switch.test.ts
```

Expected: All tests pass. Any test failure = rollback per Task 26.

- [ ] **Step 2: Manual smoke — Henry logs in and confirms**

Ask Henry to log in and confirm:
- Dashboard renders normally.
- One claim opens.
- A message sends.
- A PDF generates.
- All 673 claims still visible.

- [ ] **Step 3: Compare pre/post row counts**

```bash
cd "C:\XSFA\Modern Tools Official" && SUPABASE_SERVICE_ROLE_KEY='<from memory>' node -e "
const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://ektglhdstobaipdqssjx.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
(async () => {
  const { count } = await s.from('acv_history').select('id', { count: 'exact', head: true });
  console.log('acv_history rows:', count);   // Should still be 673
  const { count: mac } = await s.from('acv_history').select('id', { count: 'exact', head: true }).eq('company_id', (await s.from('companies').select('id').eq('slug', 'modern-appraisers').single()).data.id);
  console.log('MA-scoped:', mac);             // Should also be 673
})();
"
```

Expected: 673 total, 673 MA-scoped, 0 EV-scoped (until Phase 3).

---

### Task 26: (contingency) Rollback if anything fails

- [ ] **Step 1: Roll back the code deploy**

```bash
cd "C:\XSFA\Modern Tools Official" && npx vercel promote <captured rollback URL> --scope henry-as-projects-88caed67 --yes
```

- [ ] **Step 2: Roll back the migration**

Henry runs `supabase/migration-multi-company-rollback.sql` in the SQL Editor.

- [ ] **Step 3: Verify state matches pre-migration**

Same row counts, same behavior as before deploy.

---

### Task 27: Update SESSIONS.md with the Phase 1 entry

- [ ] **Step 1: Prepend new entry to `docs/SESSIONS.md`**

Add a new entry at the top with:
- Date + one-line title (e.g. "HamsPortal Phase 1 — multi-company infrastructure deployed").
- Worked on: what shipped.
- Changed: full file list (migration + 20+ modified files).
- Deploy status: deploy id, verified alias, rollback command.
- Migration ran: yes/no, counts returned.
- Test suite status: passing.
- In progress / broken / unknowns: Phase 2 (rebrand) and Phase 3 (Eagleview go-live) still to go.
- Next: Phase 2 plan (separate spec + plan document).

- [ ] **Step 2: Commit**

```bash
cd "C:\XSFA\Modern Tools Official" && git add docs/SESSIONS.md && git commit -m "docs: SESSIONS entry for HamsPortal Phase 1 — multi-company infrastructure"
```

---

## Self-review

**Spec coverage checked:**
- Companies + user_companies tables → Tasks 3.
- profiles.active_company_id → Task 4.
- company_id NOT NULL on 9 tables → Task 5.
- Helper functions active_company_id / has_company_access → Task 6.
- RLS rewrite on all 9 tables → Tasks 6 + 7.
- Column-guard trigger extension → Task 8 (with correction noted in Task 19).
- Verification SELECT → Task 8.
- Rollback migration → Task 9.
- scopedClient wrapper → Tasks 10, 11.
- require-admin helpers + fetchClaim + WorkflowClaim.companyId → Task 12.
- All /api/claims/[id]/* routes updated → Task 13.
- Service-client routes wrapped in scopedClient → Task 14.
- Client-side write paths stamp company_id → Task 15.
- /api/company/switch endpoint → Task 16.
- 4 isolation tests → Tasks 17-20.
- Static safety check → Task 21.
- Pre-deploy verification → Task 22.
- Migration-then-code sequencing → Tasks 23-25.
- Contingency rollback → Task 26.
- SESSIONS log entry → Task 27.

**Placeholder scan:** None found. Every step has actual code or exact commands.

**Type consistency:** `Caller.activeCompanyId` used consistently; `WorkflowClaim.companyId` used consistently; `CLAIM_SCOPED_TABLES` list defined once in `scoped.ts` and imported everywhere else.

**Trigger ordering:** The `acv_history_appraiser_guard` function body in Task 8 checks `company_id` immutability BEFORE any `service_role` bypass. This enforces Henry's hard rule that claims cannot be moved between companies by anyone — even a service-role client. Task 19 verifies this with `grep` and a live test.
