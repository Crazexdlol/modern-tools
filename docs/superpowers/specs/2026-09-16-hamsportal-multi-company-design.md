# Design: HamsPortal rebrand + multi-company (Modern Appraisers + Eagleview)

**Date:** 2026-09-16
**Status:** Approved — Phase 1 proceeding to implementation
**Scope:** Two simultaneous initiatives on one codebase — a platform rebrand and a multi-tenancy retrofit.

## Motivation

Modern Appraisers is spinning up a sister company called **Eagleview**. Both companies need to share the platform Henry built. The current "Modern Tools" name is being retired in favor of the platform name **HamsPortal** — the neutral platform that hosts one or more claims-handling companies.

Many appraisers (Henry included) will work claims for both companies. They need a single login. A user in a Modern Appraisers session must never see Eagleview data (and vice versa), never accidentally submit an Eagleview claim to Modern Appraisers, and never be able to reassign a claim across the company boundary.

## Non-goals

- Eagleview report templates. Henry will build these later; the system must render an empty state (no fallback to Modern Appraisers' templates).
- Any change to existing Modern Appraisers claim IDs, URLs, PDFs, phases, workflow, or tool behavior. The retrofit is invisible to a Modern-Appraisers-only user on day one.
- Cross-company reporting or admin surfaces. Even super-admins operate in one company at a time in Phase 3; unified cross-company views are a future initiative.
- Renaming the local development folder `C:\XSFA\Modern Tools Official`. Decision made 2026-09-16 to preserve git/Claude Code memory state.

## Guarantees (what will NOT change for Modern Appraisers on day one)

- Every existing claim keeps its `id`, URL, jsonb blobs, storage paths, and PDF output.
- Every existing user keeps their login and password and lands directly in Modern Appraisers (backfill grants access).
- Every existing tool renders identically (same tabs, phases, workflow, PDFs).
- The Modern Appraisers logo, "Us vs. IA" framing, and every PDF template are preserved. Assets move from `/logo.png` to `/companies/modern-appraisers/logo.png` but the bytes are identical.
- Every existing SQL trigger, RPC, RLS policy behavior is preserved as-is *for Modern Appraisers users*. New predicates layer on top.
- Vercel alias `modern-tools-rho.vercel.app` stays working as a legacy alias forever. Primary URL becomes `hamsportal.com`.

## Backups captured before any change (2026-09-16 20:37 PT)

- `backups/pre-hamsportal-2026-09-16/working-tree.tar.gz` — 32MB full source snapshot (excludes node_modules, .next, .vercel, .git).
- `backups/pre-hamsportal-2026-09-16/*.json` — full row dumps of 21 application tables (1,538 rows total).
- `backups/pre-hamsportal-2026-09-16/hamsportal-logo.png` (315KB) and `eagleview-logo.png` (56KB) — both branded assets staged.
- Git tag `pre-hamsportal-rebrand-b31ed7f` at the last-committed HEAD.
- Live production deploy `dpl_4cKY1UEefqCZtTuo5yN5DhLYT7hV` — Vercel keeps immutable; rollback via `vercel promote`.

## Rollout order

Three independently deployable, independently reversible phases.

### Phase 1 — Multi-company infrastructure (no visible change)

Adds tables, `company_id` columns, RLS policies, application-side scope enforcement, and all tests. Every existing row is tagged as Modern Appraisers via backfill. Modern Appraisers users see zero difference. Eagleview row exists in `companies` but has no users, no claims, no logo (yet).

### Phase 2 — HamsPortal rebrand (visible on login only)

Login page → HamsPortal logo + "HamsPortal" name. Browser tab title, metadata, package name, deploy aliases, auto-message senders, help-assistant prompts all flip to "HamsPortal". Post-login the Modern Appraisers logo still renders because it's now sourced from the active company row.

### Phase 3 — Eagleview goes live

Eagleview logo file lands at `public/companies/eagleview/logo.png`. Admin grants first Eagleview appraiser access via a new checkbox in the user settings screen. Empty template state confirmed. Company switcher appears in the header for users with access to multiple companies.

---

# Phase 1 — Multi-company infrastructure (this document scopes here)

## Data model

### New tables

**`public.companies`** (global, seeded with 2 rows)

```sql
create table public.companies (
  id             uuid primary key default gen_random_uuid(),
  slug           text unique not null,       -- 'modern-appraisers' | 'eagleview'
  name           text not null,              -- 'Modern Appraisers' | 'Eagleview'
  logo_path      text not null,              -- '/companies/{slug}/logo.png'
  brand_color    text not null default '#1e40af',
  feature_flags  jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
```

Seeded rows (both inserted in the migration, IDs captured into variables for the FK backfill):
- `('modern-appraisers', 'Modern Appraisers', '/companies/modern-appraisers/logo.png', '#1e40af', '{"acv":true,"dv":true,"award":true,"notes":true,"invoice":true,"storage":true,"estimate_dispute":true,"marketing":true}')`
- `('eagleview', 'Eagleview', '/companies/eagleview/logo.png', '#1e40af', '{"acv":true,"dv":true,"award":true,"notes":true,"invoice":true,"storage":true,"estimate_dispute":true,"marketing":true}')`

**`public.user_companies`** (join)

```sql
create table public.user_companies (
  user_id            uuid not null references public.profiles(id) on delete cascade,
  company_id         uuid not null references public.companies(id) on delete restrict,
  email_in_company   text,                    -- optional per-company reply-to; falls back to profiles.email
  role_in_company    text,                    -- reserved for future per-company role override
  granted_by         uuid references public.profiles(id) on delete set null,
  granted_at         timestamptz not null default now(),
  primary key (user_id, company_id)
);

create index user_companies_company_id_idx on public.user_companies(company_id);
```

Backfill: `insert into user_companies (user_id, company_id) select id, <ma_id> from profiles`.

### Modified tables

**`public.profiles`** — add nullable pointer to the user's active company:

```sql
alter table public.profiles
  add column active_company_id uuid references public.companies(id) on delete set null;
```

Backfill: `update profiles set active_company_id = <ma_id>` for every existing user (they all get Modern Appraisers as active). Left nullable so future users get a clean "must choose" state on first login.

### Claim-scoped and company-book-of-business tables getting `company_id`

Every one gets `company_id uuid not null references companies(id)`. Added nullable → backfilled → set NOT NULL, in that order per table.

Claim-scoped (5 tables):
1. `acv_history` — the claim row. Root of company scope.
2. `messages` — inherits via `claim_id → acv_history`. Own `company_id` denormalized for RLS to avoid a join on every read.
3. `message_reads` — same rationale.
4. `user_claim_views` — same.
5. `estimate_history` — legacy per-user tool; scoped for future-proofing.

Company book-of-business (4 tables):
6. `clients` — marketing CRM.
7. `client_contacts` — inherits via `client_id`; own `company_id` for RLS convenience.
8. `client_marketing_log` — same.
9. `insurance_guidelines` — per Henry's ask, per-company (previously global). New admin UI action `Import from other company` will exist in Phase 2 or later; Phase 1 just adds the column and backfills all existing rows to Modern Appraisers.

Global tables that stay company-less (no `company_id` added):
- `auth.users`, `profiles` (identity is global; per-company overlay lives in `user_companies`)
- `site_settings`, `status_phase_configs`, `fee_catalog`, `appraiser_fees`, `appraiser_licenses`, `appraiser_documents`, `licensed_states`, `help_articles`, `state_tax_rules`, `guideline_documents`, `user_activity_daily`, `summaries`.

Storage buckets stay path-scoped:
- `claim-documents/{claim_id}/...` — access flows through `acv_history.company_id` via the RLS policy update.
- `appraiser-documents/{user_id}/...` — user-scoped, no change.
- `guideline-library` — global reference, no change.

## Central isolation mechanism

Two layers, both enforced. A leak requires both to fail simultaneously.

### Layer A — Database RLS (defense in depth)

New helper SQL functions:

```sql
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
```

Every RLS policy on the 9 tables above is rewritten to `USING (active_company_id() = company_id AND has_company_access(company_id))` layered on top of the existing role/assignment predicates. Failing either yields "row does not exist" semantics — indistinguishable from 404, never 403. This satisfies the "don't leak existence" requirement.

Trigger update on `acv_history` — `acv_history_appraiser_guard()` extended to reject any UPDATE that changes `company_id`. This enforces the hard rule: **claims never move between companies**. Even a super-admin can't reassign across the boundary — the correct fix is delete-and-recreate.

### Layer B — Application-side scope helper (for service-client routes)

New file `src/lib/supabase/scoped.ts` exports `scopedClient(activeCompanyId)`. Returns a Proxy around the service client that:

- Intercepts `.from('<whitelisted-table>')` and appends `.eq('company_id', activeCompanyId)` on every subsequent `.select()`, `.update()`, `.delete()` chain.
- Injects `company_id: activeCompanyId` into every `.insert(payload)` (overrides any body-supplied value — bodies never trusted for company).
- Whitelist of claim-scoped tables lives in this file. Calling `.from()` for any other table falls through to the raw service client. Adding a new claim-scoped table requires adding it here — fail-loud, not fail-open.

Modified `src/lib/auth/require-admin.ts` helpers:
- `requireAuth()` and `requireAdmin()` return `{ caller: { userId, role, isSuperAdmin, activeCompanyId }, errorResponse }`.
- New `requireCompanyContext()` returns `activeCompanyId` or a 400 error response (`{ error: 'No active company. Log out and back in.' }`).
- `fetchClaim(id, activeCompanyId)` gains a required company param and adds `.eq('company_id', activeCompanyId)` to its lookup. Any claim not in the caller's active company returns null (routes turn this into 404).

## Files touched (Phase 1)

### Migration files (new)

- `supabase/migration-multi-company.sql` — full multi-step migration (see next section for order).
- `supabase/migration-multi-company-rollback.sql` — reverse in the exact opposite order.

### Application code (modified)

- `src/lib/auth/require-admin.ts` — extended helpers, new `requireCompanyContext()`, `fetchClaim()` gains a required `companyId` param.
- `src/lib/supabase/scoped.ts` — **NEW**. Exports `scopedClient()`. Whitelist of claim-scoped tables.
- `src/lib/supabase/history.ts` — all reads use RLS (client-authenticated, no explicit `.eq`); all writes stamp `company_id` from a new `useActiveCompany()` hook (client-side) or from session (server-side).
- `src/lib/supabase/clients.ts` — same.
- `src/hooks/use-active-company.ts` — **NEW**. Client-side hook that reads `active_company_id` from the profile fetched during session bootstrap. Feeds writes; not needed for reads (RLS handles).
- Every API route in `src/app/api/claims/[id]/*` — uses updated `fetchClaim(id, activeCompanyId)` via `requireAuth`.
- `src/app/api/claims/duplicates/route.ts` — wraps with `scopedClient(activeCompanyId)`.
- `src/app/api/admin/export/claims/route.ts` — same.
- `src/app/api/admin/import/claims/route.ts` — same; every inserted row stamps `company_id` from session.
- `src/app/api/marketing/backfill/*/route.ts` — scoped.
- `src/app/api/insurance-guidelines/*` — scoped.
- Every `/api/acv/generate-*-pdf`, `/api/invoices/generate-pdf`, `/api/acv/generate-dv-pdf`, `/api/storage/generate-pdf` route — resolves claim's `company_id` (already scoped by RLS/scopedClient) and passes it through to the filler (used in Phase 2 for template resolution; wired in Phase 1 as a no-op parameter for now).
- `/api/activity/summary` — left unscoped for super-admin (documented deliberate cross-company view).

### Files NOT touched in Phase 1

- Login page, header, layout metadata, package.json name — Phase 2.
- PDF template files (all stay under `public/`) — Phase 2 moves them under `public/companies/modern-appraisers/`.
- Auto-message sender strings ("Modern Tools (Auto)") — Phase 2.
- Help assistant prompts — Phase 2.

## Migration order (single file, atomic transaction where possible)

```
BEGIN;

-- 1. Create companies table + seed both rows.
create table public.companies (…);
insert into public.companies (slug, name, logo_path, feature_flags) values …;

-- 2. Create user_companies table.
create table public.user_companies (…);

-- 3. Backfill user_companies with (every existing profile, modern-appraisers).
insert into public.user_companies (user_id, company_id)
  select id, (select id from public.companies where slug='modern-appraisers')
  from public.profiles;

-- 4. Add active_company_id to profiles + backfill all existing users to MA.
alter table public.profiles
  add column active_company_id uuid references public.companies(id) on delete set null;
update public.profiles
  set active_company_id = (select id from public.companies where slug='modern-appraisers');

-- 5. For each of the 9 tables: add nullable company_id, backfill = MA, set NOT NULL.
alter table public.acv_history add column company_id uuid references public.companies(id);
update public.acv_history set company_id = (select id from public.companies where slug='modern-appraisers');
alter table public.acv_history alter column company_id set not null;
-- (repeat for messages, message_reads, user_claim_views, estimate_history,
--  clients, client_contacts, client_marketing_log, insurance_guidelines)

-- 6. Indexes on (company_id, ...) for the hot query paths.
create index acv_history_company_id_idx on public.acv_history(company_id);
create index acv_history_company_status_idx on public.acv_history(company_id, status);
-- (similar for other tables)

-- 7. Helper functions.
create or replace function public.active_company_id() … ;
create or replace function public.has_company_access(cid uuid) … ;

-- 8. Drop and recreate every affected RLS policy with the company predicate.
--    For each policy, wrap the existing USING clause with:
--    (active_company_id() = <table>.company_id AND has_company_access(<table>.company_id))
--    AND (existing predicate)

-- 9. Update column-guard trigger to reject company_id changes.
create or replace function public.acv_history_appraiser_guard() … ;
-- Adds: if old.company_id is distinct from new.company_id
--         then raise exception 'company_id is immutable on acv_history';

-- 10. Verification SELECT — returns row counts per table + per company for sanity check.

COMMIT;
```

The migration is written to run as ONE transaction so a mid-way failure rolls the whole thing back. Idempotency: every `create` uses `if not exists`; backfill `update` clauses are guarded by `where company_id is null`; the `alter … set not null` will fail-loud if backfill missed a row.

Rollback file drops the new columns/tables/functions in reverse. Existing Modern Appraisers data remains intact throughout because backfill precedes NOT NULL.

## Testing strategy

New test infrastructure — the project currently has no test framework. Adding **Vitest** (matches Vite's Next-friendly setup; minimal config; ~10s startup on this codebase).

Test module `__tests__/multi-company-isolation/`:

1. **`isolation.test.ts`** — the primary spec:
   - Setup: two seeded companies. Two users: `ma-only@test`, `ev-only@test`. One MA claim, one EV claim. Test uses the anon key + a real Supabase client with a mocked JWT for each user.
   - Assertion set A (MA-only user):
     - `fetchACVHistory()` returns exactly the MA claim, never EV.
     - `fetchACVEntry(evClaimId)` returns null.
     - `GET /api/claims/[evClaimId]/messages` → 404.
     - `POST /api/claims/[evClaimId]/star` → 404.
     - `POST /api/claims/[evClaimId]/approve` → 404.
     - `GET /api/admin/export/claims` CSV never contains the EV claim.
     - `GET /api/claims/duplicates?vin=<ev-claim-vin>` returns zero hits.
   - Assertion set B: mirror A with roles reversed (EV-only user against MA claim).

2. **`dual-user-switch.test.ts`** — one user with both companies:
   - Set `active_company_id = MA` → `fetchACVHistory()` returns only MA claims.
   - `POST /api/company/switch { companyId: EV }` → 200; profile updated.
   - `fetchACVHistory()` now returns only EV claims.

3. **`insert-cannot-forge.test.ts`** — MA user POSTs a claim create with `company_id = EV` in the request body → row lands as MA (session wins over body).

4. **`cross-company-reassignment-blocked.test.ts`** — direct UPDATE against `acv_history` (via service client) attempting to change `company_id` on any existing claim → PostgreSQL exception from the trigger.

5. **`no-template-empty-state.test.ts`** — EV user (once Eagleview users exist in Phase 3) hits `/api/acv/generate-pdf` for an EV claim → 400 with `code: 'NO_TEMPLATE'`, human message in body, no 500. **(Note: this test can be written in Phase 1 but will initially skip because no EV users exist yet.)**

Test runner: `npm test` (new script in package.json). Wired into the deploy checklist as a manual step (`npm test` before `vercel --prod`).

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Migration hits `NOT NULL` before backfill completes | Migration wraps in a transaction; the backfill `update` is on the immediately-preceding line for each table. `alter column set not null` fails loudly and rolls back the transaction if a row was missed. |
| Column-guard trigger drift lets a claim slip company | Trigger is extended in the same migration that introduces the column; `cross-company-reassignment-blocked.test.ts` proves it fires. |
| Client-side stale `active_company_id` after switching | Company switch always triggers `window.location.reload()` — no in-memory React state survives. |
| Service-client route forgets to wrap in `scopedClient` | The whitelist in `scoped.ts` throws on unrecognized tables; every acv_history query goes through it. Static grep on `.from('acv_history')` outside `scoped.ts` runs in CI (`npm run lint:no-raw-acv-queries`). |
| Existing RLS policy has a corner case the audit missed | Isolation test suite is exhaustive across all 7 modification vectors (read/list/search/export/insert/update/delete). |
| An in-flight session pre-migration doesn't have `active_company_id` set | Middleware bootstraps `active_company_id` on the first request post-migration by looking up the caller's `user_companies` — if exactly one, sets it silently; if more (won't happen in Phase 1 since no Eagleview users exist), forces a redirect to `/select-company`. |
| Legacy code assumes `logo.png` at root | Phase 1 doesn't move the logo. Phase 2 handles that with a symlink/redirect fallback for a full release cycle before the file physically moves. |

## Success criteria for Phase 1

- Migration runs cleanly on production (Henry executes manually via Supabase SQL Editor).
- Test suite passes: all 4 available tests green (test 5 skipped until Phase 3).
- Deploy goes live; every existing Modern Appraisers user's next login is seamless — they log in, land on their dashboard, see their claims, work as normal.
- Deep verification query (run against prod after migration): count rows per company on all 9 tables → 100% Modern Appraisers, 0 Eagleview, sum matches pre-migration totals.
- No user-visible change. No PDF change. No workflow change.

## Deploy checklist (Phase 1)

1. Confirm backups exist at `backups/pre-hamsportal-2026-09-16/`.
2. Run `npm test` → all green (except `no-template-empty-state.test.ts` skipped).
3. Run `npx tsc --noEmit` and `npm run build` — both clean.
4. Capture current live deploy URL as rollback target.
5. Deploy code: `npx vercel --prod --scope henry-as-projects-88caed67 --yes`.
6. Confirm alias flipped.
7. **Ask Henry to run** `supabase/migration-multi-company.sql` in the Supabase SQL Editor. Report the verification counts.
8. Post-migration smoke: log in as Henry, verify dashboard renders, verify one claim opens, verify a message sends, verify a PDF generates.
9. Prepend entry to `docs/SESSIONS.md`.

Phase 2 and Phase 3 are separate follow-up specs, each with their own approval gate.
