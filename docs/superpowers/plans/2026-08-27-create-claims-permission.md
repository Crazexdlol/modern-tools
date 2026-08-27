# Per-appraiser create-claims permission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-user grant (`profiles.can_create_claims`) that, together with the existing site-wide master switch, controls whether an appraiser can create claims. Restructure the Access settings page from three per-permission sections into a single search-first per-appraiser view.

**Architecture:** Master-plus-grant model. `site_settings.allow_regular_create_claims` is a kill switch; when ON, each appraiser's `profiles.can_create_claims` boolean is the actual gate. Admins bypass both. Enforced at three layers: PostgreSQL RLS (server-of-record), the admin PATCH endpoint (accepts new field), and the client UI (hides "New Claim" button + redirects direct URL hits). Access page redesigned as a searchable `<datalist>`-driven picker; selecting a user reveals their three toggles (Create, Reassign, Edit Info) — no scrolling list of all users.

**Tech Stack:** Next.js 16 (React 19, App Router), TypeScript 5, Tailwind v4, Supabase (`@supabase/ssr`), shadcn base primitives.

**Project convention note:** No test framework is configured. Per `CLAUDE.md`, verification is `npx tsc --noEmit` + `npm run build` + manual browser testing. Individual task "verify" steps use `npx tsc --noEmit`; the final task runs the full build + manual test matrix. Commits happen at task boundaries — Henry's standing instruction is that autonomous deploys are authorized, but each `git commit` in this plan is a discrete step that should be run only when the user has said "execute this plan" (or equivalent).

**Spec reference:** `docs/superpowers/specs/2026-08-27-create-claims-permission-design.md`

---

## Task 1: Write the SQL migration + rollback

**Files:**
- Create: `supabase/migration-can-create-claims.sql`
- Create: `supabase/migration-can-create-claims-rollback.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migration-can-create-claims.sql` with:

```sql
-- =========================================================================
-- Modern Tools — Per-appraiser can_create_claims permission (2026-08-27)
-- Run in the Supabase SQL Editor (Dashboard -> SQL Editor).
-- Spec: docs/superpowers/specs/2026-08-27-create-claims-permission-design.md
-- Rollback: supabase/migration-can-create-claims-rollback.sql
--
-- Adds a per-user grant column on top of the existing site-wide master
-- switch (site_settings.allow_regular_create_claims). Effective rule for
-- a non-admin: create is allowed only when BOTH the master is ON AND
-- the caller's profiles.can_create_claims is TRUE. Admins bypass both.
-- =========================================================================

-- 1. New column: per-user grant. Default false = strict by default.
alter table public.profiles
  add column if not exists can_create_claims boolean not null default false;

-- 2. Replace the acv_history INSERT policy so non-admins also need the grant.
--    Original policy is in supabase/migration-roles.sql:131-140.
drop policy if exists acv_insert on public.acv_history;

create policy acv_insert on public.acv_history for insert
  with check (
    (public.is_admin() and user_id = auth.uid())
    or (
      not public.is_admin()
      and coalesce(
        (select (value #>> '{}')::boolean from public.site_settings
         where key = 'allow_regular_create_claims'),
        true
      )
      and exists (
        select 1 from public.profiles
        where id = auth.uid() and can_create_claims = true
      )
      and user_id = auth.uid()
      and (assigned_to is null or assigned_to = auth.uid())
    )
  );

-- 3. Verification
select 'profiles.can_create_claims column' as label,
       count(*) as value
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'profiles'
    and column_name = 'can_create_claims'
union all
select 'acv_history INSERT policies' as label,
       count(*) as value
  from pg_policies
  where schemaname = 'public'
    and tablename = 'acv_history'
    and cmd = 'INSERT';
```

- [ ] **Step 2: Write the rollback**

Create `supabase/migration-can-create-claims-rollback.sql` with:

```sql
-- =========================================================================
-- Modern Tools — Rollback: per-appraiser can_create_claims (2026-08-27)
-- Run in the Supabase SQL Editor to undo migration-can-create-claims.sql.
-- Restores the acv_history INSERT policy from migration-roles.sql and
-- drops the profiles.can_create_claims column.
-- =========================================================================

drop policy if exists acv_insert on public.acv_history;

create policy acv_insert on public.acv_history for insert
  with check (
    (public.is_admin() and user_id = auth.uid())
    or (
      not public.is_admin()
      and coalesce(
        (select (value #>> '{}')::boolean from public.site_settings
         where key = 'allow_regular_create_claims'),
        true
      )
      and user_id = auth.uid()
      and (assigned_to is null or assigned_to = auth.uid())
    )
  );

alter table public.profiles drop column if exists can_create_claims;

select 'acv_history INSERT policies' as label,
       count(*) as value
  from pg_policies
  where schemaname = 'public' and tablename = 'acv_history' and cmd = 'INSERT';
```

- [ ] **Step 3: Verify SQL is syntactically valid**

Migrations are only executed by Henry inside the Supabase SQL editor — no local psql is available. Manually re-read both files for obvious typos: matched parentheses, correct table/column names, correct policy name (`acv_insert`), and that the rollback's recreated policy matches the pre-migration version at `supabase/migration-roles.sql:131-140` character-for-character except for the removed `and exists (...)` grant check.

- [ ] **Step 4: Commit**

```bash
git add supabase/migration-can-create-claims.sql supabase/migration-can-create-claims-rollback.sql
git commit -m "feat(sql): add can_create_claims per-user grant + rollback"
```

---

## Task 2: Extend the Profile type + row mapper

**Files:**
- Modify: `src/lib/supabase/profiles.ts`

- [ ] **Step 1: Add `canCreateClaims` to `Profile` interface**

In `src/lib/supabase/profiles.ts`, find the `Profile` interface (around lines 6-16) and add `canCreateClaims`:

```typescript
export interface Profile {
  id: string
  email: string
  name: string
  role: Role
  canReassignClaims: boolean
  canEditClaimInfo: boolean
  canCreateClaims: boolean
  autoStatusRequestsOverride: boolean | null  // null = follow global setting
  createdAt: string
  updatedAt: string
}
```

- [ ] **Step 2: Add `can_create_claims` to `ProfileRow` interface**

In the same file, `ProfileRow` (around lines 18-28):

```typescript
interface ProfileRow {
  id: string
  email: string
  name: string
  role: Role
  can_reassign_claims?: boolean | null
  can_edit_claim_info?: boolean | null
  can_create_claims?: boolean | null
  auto_status_requests_override?: boolean | null
  created_at: string
  updated_at: string
}
```

- [ ] **Step 3: Map the field in `rowToProfile`**

In `rowToProfile` (around lines 30-47), add the mapping:

```typescript
function rowToProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    canReassignClaims: row.can_reassign_claims === true,
    canEditClaimInfo: row.can_edit_claim_info === true,
    canCreateClaims: row.can_create_claims === true,
    autoStatusRequestsOverride:
      row.auto_status_requests_override === true
        ? true
        : row.auto_status_requests_override === false
          ? false
          : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
```

- [ ] **Step 4: Verify typecheck passes**

Run: `npx tsc --noEmit`
Expected: no errors, no output.

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase/profiles.ts
git commit -m "feat: add canCreateClaims to Profile type"
```

---

## Task 3: Accept `canCreateClaims` in the admin users PATCH route

**Files:**
- Modify: `src/app/api/admin/users/[id]/route.ts:15-49`

- [ ] **Step 1: Extend the body type**

In `src/app/api/admin/users/[id]/route.ts`, update the `body` cast (around lines 15-21):

```typescript
const body = await request.json().catch(() => null) as {
  name?: string
  role?: 'admin' | 'appraiser'
  canReassignClaims?: boolean
  canEditClaimInfo?: boolean
  canCreateClaims?: boolean
  autoStatusRequestsOverride?: boolean | null
} | null
```

- [ ] **Step 2: Add `canCreateClaims` to the "no fields" guard**

Same file, around lines 22-31:

```typescript
if (
  !body ||
  (body.name === undefined &&
    body.role === undefined &&
    body.canReassignClaims === undefined &&
    body.canEditClaimInfo === undefined &&
    body.canCreateClaims === undefined &&
    body.autoStatusRequestsOverride === undefined)
) {
  return NextResponse.json({ error: 'no fields to update' }, { status: 400 })
}
```

- [ ] **Step 3: Add `canCreateClaims` to the patch payload builder**

Same file, around lines 44-49. After the `canEditClaimInfo` line:

```typescript
if (body.canEditClaimInfo !== undefined) patch.can_edit_claim_info = body.canEditClaimInfo
if (body.canCreateClaims !== undefined) patch.can_create_claims = body.canCreateClaims
if (body.autoStatusRequestsOverride !== undefined) patch.auto_status_requests_override = body.autoStatusRequestsOverride
```

- [ ] **Step 4: Verify typecheck passes**

Run: `npx tsc --noEmit`
Expected: no errors, no output.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/users/[id]/route.ts
git commit -m "feat(api): accept canCreateClaims on admin users PATCH"
```

---

## Task 4: Gate the dashboard "New Claim" button

**Files:**
- Modify: `src/app/page.tsx:41-44`

- [ ] **Step 1: Update the `canCreate` derivation**

In `src/app/page.tsx`, find the block around lines 41-44:

Before:
```typescript
const isAdmin = profile?.role === 'admin'
const openClaims = entries.filter(e => e.status !== 'closed' && !e.submittedAt)
const submittedClaims = entries.filter(e => e.status !== 'closed' && !!e.submittedAt)
const canCreate = isAdmin || allowCreate
```

After:
```typescript
const isAdmin = profile?.role === 'admin'
const openClaims = entries.filter(e => e.status !== 'closed' && !e.submittedAt)
const submittedClaims = entries.filter(e => e.status !== 'closed' && !!e.submittedAt)
// Master + grant: admins always; non-admins need BOTH the site-wide master
// (allowCreate) and their per-user grant (profile.canCreateClaims).
const canCreate = isAdmin || (allowCreate && profile?.canCreateClaims === true)
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npx tsc --noEmit`
Expected: no errors, no output.

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(dashboard): gate New Claim button on per-user grant"
```

---

## Task 5: Redirect direct-URL hits on `/claims/new` for non-creators

**Files:**
- Modify: `src/components/claim/ClaimWorkspace.tsx` — add a mount effect near where `profile` is derived (currently line 2558)

- [ ] **Step 1: Add the site-setting fetch**

`ClaimWorkspace.tsx` already imports `useCurrentProfile` at line 44. Add an import for `fetchSiteSetting` near the other supabase imports. Search for the existing `import` block at the top; add:

```typescript
import { fetchSiteSetting } from '@/lib/supabase/site-settings'
```

(Only add if not already imported — grep first: `grep -n "from '@/lib/supabase/site-settings'" src/components/claim/ClaimWorkspace.tsx`.)

- [ ] **Step 2: Add the state + effect that fetches the master flag**

Find the block that sets `profile` (around line 2558):

```typescript
const { profile } = useCurrentProfile()
```

Immediately after it (still inside `ClaimWorkspaceInner`), add:

```typescript
const [allowCreateGlobal, setAllowCreateGlobal] = useState<boolean | null>(null)
useEffect(() => {
  fetchSiteSetting<boolean>('allow_regular_create_claims').then(v => setAllowCreateGlobal(v ?? true))
}, [])
```

- [ ] **Step 3: Add the redirect effect**

Right after the block above, add the redirect gate. Only fires once profile AND the global flag are known — otherwise we'd flash a redirect before the profile loads:

```typescript
// Direct-URL guard: if a non-admin without the create grant lands on
// /claims/new (e.g. bookmark, address-bar), silently bounce to the
// dashboard. RLS blocks the insert anyway; this just prevents a
// confusing dead-end form. Waits until profile + master flag are both
// loaded to avoid a flash-redirect on slow connections.
useEffect(() => {
  if (!isNew) return
  if (profile === null) return          // still loading
  if (allowCreateGlobal === null) return
  const canCreate =
    profile.role === 'admin' ||
    (allowCreateGlobal && profile.canCreateClaims === true)
  if (!canCreate) router.replace('/')
}, [isNew, profile, allowCreateGlobal, router])
```

- [ ] **Step 4: Verify typecheck passes**

Run: `npx tsc --noEmit`
Expected: no errors, no output.

- [ ] **Step 5: Commit**

```bash
git add src/components/claim/ClaimWorkspace.tsx
git commit -m "feat(workspace): redirect /claims/new for users without create grant"
```

---

## Task 6: Restructure Access page to search-first per-appraiser view

**Files:**
- Modify: `src/app/admin/settings/access/access-client.tsx` (full replace of the component body)

- [ ] **Step 1: Full replacement**

Replace the entire contents of `src/app/admin/settings/access/access-client.tsx` with:

```typescript
"use client"

import { useEffect, useMemo, useState } from 'react'
import { fetchSiteSetting } from '@/lib/supabase/site-settings'
import { fetchAllProfilesBrowser, type Profile } from '@/lib/supabase/profiles'
import { SectionCard, ToggleRow } from '../_shared'

type PermField = 'canCreateClaims' | 'canReassignClaims' | 'canEditClaimInfo'

export function AccessClient() {
  const [allowCreate, setAllowCreate] = useState<boolean | null>(null)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pickerText, setPickerText] = useState('')
  const [busyField, setBusyField] = useState<PermField | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetchSiteSetting<boolean>('allow_regular_create_claims').then(v => setAllowCreate(v ?? true))
    fetchAllProfilesBrowser().then(rows => {
      setProfiles(rows)
      setLoading(false)
    })
  }, [])

  const appraisers = useMemo(
    () => profiles.filter(p => p.role === 'appraiser'),
    [profiles],
  )

  const selected = useMemo(
    () => appraisers.find(p => p.id === selectedId) ?? null,
    [appraisers, selectedId],
  )

  const saveGlobal = async (value: boolean) => {
    setError(null); setSaved(false)
    const prev = allowCreate
    setAllowCreate(value)
    const res = await fetch('/api/admin/site-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'allow_regular_create_claims', value }),
    })
    if (!res.ok) {
      setAllowCreate(prev)
      const b = await res.json().catch(() => ({}))
      setError(b.error ?? 'Save failed')
      return
    }
    setSaved(true)
  }

  const savePerm = async (userId: string, field: PermField, next: boolean) => {
    setError(null); setSaved(false)
    setBusyField(field)
    setProfiles(prev => prev.map(p => p.id === userId ? { ...p, [field]: next } as Profile : p))
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: next }),
    })
    setBusyField(null)
    if (!res.ok) {
      setProfiles(prev => prev.map(p => p.id === userId ? { ...p, [field]: !next } as Profile : p))
      const b = await res.json().catch(() => ({}))
      setError(b.error ?? 'Save failed')
      return
    }
    setSaved(true)
  }

  // When the user types a name/email into the picker and it matches exactly
  // one appraiser's "Name (email)" label, select them. This lets the datalist
  // dropdown act like a single-select combobox without extra chrome.
  const applyPickerText = (text: string) => {
    setPickerText(text)
    const match = appraisers.find(p => `${p.name || p.email} (${p.email})` === text)
    setSelectedId(match?.id ?? null)
  }

  return (
    <div className="space-y-6">
      <SectionCard
        title="Global"
        description="Master switch for appraiser-created claims."
      >
        <ToggleRow
          label="Enable appraiser-created claims"
          description="Master switch. When off, no appraiser can create claims regardless of per-user grants below. Admins can always create. Enforced server-side (RLS) — hiding the button is not the only guard."
          value={allowCreate}
          onChange={saveGlobal}
        />
      </SectionCard>

      <SectionCard
        title="Per-appraiser access"
        description={
          loading
            ? 'Loading users…'
            : `Search by name or email to view and edit an appraiser's permissions. ${appraisers.length} appraiser${appraisers.length === 1 ? '' : 's'} on this team.`
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              Select appraiser
            </label>
            <input
              type="text"
              list="access-appraiser-options"
              value={pickerText}
              onChange={(e) => applyPickerText(e.target.value)}
              placeholder="Type a name or email…"
              disabled={loading}
              className="w-full max-w-md bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm disabled:opacity-50"
            />
            <datalist id="access-appraiser-options">
              {appraisers.map(p => (
                <option key={p.id} value={`${p.name || p.email} (${p.email})`} />
              ))}
            </datalist>
          </div>

          {selected ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
              <div>
                <div className="text-sm font-semibold text-gray-900">
                  {selected.name || <span className="text-gray-400 italic">No name</span>}
                </div>
                <div className="text-xs text-gray-500">{selected.email}</div>
              </div>
              <div className="divide-y divide-gray-100 border-t border-gray-200">
                <PermToggleRow
                  label="Can create claims"
                  description={
                    allowCreate === false
                      ? 'Master switch is off — this permission has no effect until Enable appraiser-created claims is on.'
                      : 'When on, this appraiser sees the New Claim button and can create + fill in a claim.'
                  }
                  value={selected.canCreateClaims}
                  dimmed={allowCreate === false}
                  onChange={(v) => savePerm(selected.id, 'canCreateClaims', v)}
                  busy={busyField === 'canCreateClaims'}
                />
                <PermToggleRow
                  label="Can reassign claims"
                  description="When on, this appraiser can reassign claims that are currently assigned to them (hand-off flow). Admins can always reassign."
                  value={selected.canReassignClaims}
                  onChange={(v) => savePerm(selected.id, 'canReassignClaims', v)}
                  busy={busyField === 'canReassignClaims'}
                />
                <PermToggleRow
                  label="Can edit claim info"
                  description="When on, this appraiser can unlock and edit fields on the Claim Info form (MA #, Insured, VIN, dates, address, etc.). When off, the form is read-only for them — except Handling Appraiser, which anyone can edit since it feeds Award / Closing Notes. Admins can always edit."
                  value={selected.canEditClaimInfo}
                  onChange={(v) => savePerm(selected.id, 'canEditClaimInfo', v)}
                  busy={busyField === 'canEditClaimInfo'}
                />
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-500 italic">
              {loading
                ? 'Loading users…'
                : appraisers.length === 0
                  ? 'No appraisers yet.'
                  : pickerText
                    ? 'No appraiser matches that entry. Pick one from the dropdown.'
                    : 'Select an appraiser to view or edit their permissions.'}
            </div>
          )}
        </div>
      </SectionCard>

      {error && (
        <div className="p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
      )}
      {saved && !error && <div className="text-green-700 text-sm">Saved.</div>}
    </div>
  )
}

function PermToggleRow({
  label,
  description,
  value,
  onChange,
  dimmed = false,
  busy = false,
}: {
  label: string
  description: string
  value: boolean
  onChange: (v: boolean) => void
  dimmed?: boolean
  busy?: boolean
}) {
  return (
    <div className={`flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0 ${dimmed ? 'opacity-60' : ''}`}>
      <div className="flex-1">
        <div className="text-sm font-semibold text-gray-900">{label}</div>
        <div className="text-xs text-gray-500 mt-0.5">{description}</div>
      </div>
      <button
        onClick={() => onChange(!value)}
        disabled={busy}
        title={dimmed ? 'Master switch is off — this permission has no effect' : undefined}
        className={`mt-1 shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
          value ? 'bg-blue-600' : 'bg-gray-300'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            value ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npx tsc --noEmit`
Expected: no errors, no output.

- [ ] **Step 3: Verify production build compiles**

Run: `npm run build`
Expected: build completes; `/admin/settings/access` shows up in the routes list; no page-level errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/settings/access/access-client.tsx
git commit -m "refactor(settings): search-first per-appraiser Access page"
```

---

## Task 7: Full verification, migration run, and prod deploy

**Files:** none modified in this task — this is the go-live sequence.

- [ ] **Step 1: Confirm typecheck + build still clean**

```
npx tsc --noEmit
npm run build
```

Both must complete with no errors. If either fails, stop and fix before continuing.

- [ ] **Step 2: Capture the currently-live deploy id (rollback target)**

```
npx vercel inspect modern-tools-rho.vercel.app --scope henry-as-projects-88caed67
```

Copy the `url` and `id` shown under "General". These are the rollback target — save them to hand to Henry with the deploy notification.

- [ ] **Step 3: Ask Henry to run the migration in Supabase**

**Do not skip this checkpoint.** Send Henry:

> Ready to deploy. Before I ship, please run `supabase/migration-can-create-claims.sql` in the Supabase SQL Editor (Dashboard → SQL Editor → New query, paste, Run). Expected verification output: two rows — `profiles.can_create_claims column | 1` and `acv_history INSERT policies | 1`. Tell me when it's done.
>
> Heads-up: the moment you run this, all existing appraisers lose the ability to create claims (default is off). Once I deploy the new UI you can grant it to specific appraisers from Settings → Access.

Wait for Henry's confirmation before proceeding to Step 4.

- [ ] **Step 4: Deploy to production**

```
npx vercel --prod --scope henry-as-projects-88caed67 --yes
```

Wait for `readyState: "READY"`. Capture the new deploy id and URL from the JSON output.

- [ ] **Step 5: Verify alias flipped**

```
npx vercel inspect modern-tools-rho.vercel.app --scope henry-as-projects-88caed67
```

Confirm the `id` matches the new deploy from Step 4 and `status` is `● Ready`.

- [ ] **Step 6: Send Henry the deploy notification with rollback command**

Template:

> Live: `<new-deploy-url>` (`<new-deploy-id>`). Alias flipped, verified.
>
> Rollback if anything breaks:
> ```
> npx vercel promote <rollback-url-from-step-2> --scope henry-as-projects-88caed67 --yes
> ```
> If the RLS migration itself needs to be reverted, run `supabase/migration-can-create-claims-rollback.sql` in the Supabase SQL editor.

- [ ] **Step 7: Manual test matrix**

Ask Henry to walk through these and report back. He is the only test env.

1. **Admin login** — dashboard shows "New Claim" button. Click it. Fill in the claim info form. Save. Claim appears in the list. ✓
2. **Appraiser with grant OFF (default)** — log in as any appraiser (Henry knows the accounts). Dashboard shows NO "New Claim" button. Manually navigate to `/claims/new` in the address bar. Page redirects to `/`. ✓
3. **Admin grants Create to that appraiser** — in Settings → Access, use the picker to select the appraiser. Flip "Can create claims" ON. See the "Saved." confirmation. ✓
4. **Same appraiser re-logs in / hard-reloads** — dashboard now shows "New Claim" button. Click it. Fill in the form. Save. Claim appears. ✓
5. **Master OFF, appraiser grant ON** — flip the master toggle OFF. Same appraiser reloads. No "New Claim" button. `/claims/new` still redirects. ✓
6. **Master OFF in the picker UI** — the "Can create claims" toggle for the selected appraiser is dimmed with the tooltip "Master switch is off — this permission has no effect". Still clickable. ✓
7. **Regression: reassign + edit-info still work** — flip Can Reassign or Can Edit Info for a user. Reload as that user, confirm behavior unchanged from before this deploy. ✓

If any test fails, capture the failure mode and stop. Do not update SESSIONS.md until the whole matrix passes.

- [ ] **Step 8: Update `docs/SESSIONS.md`**

Prepend a new entry at the top per the CLAUDE.md session-log workflow:

```
## 2026-08-27 — Per-appraiser can_create_claims permission + Access page cleanup

**Worked on:** Added a per-user `can_create_claims` grant on top of the existing
master site setting, so admins can now grant/revoke create ability per
appraiser instead of all-or-nothing. Restructured Access page from three
per-permission lists into a search-first per-appraiser view that scales
past ~20 users.

**Changed:**
- `supabase/migration-can-create-claims.sql` (+ rollback) — new column + updated acv_insert RLS
- `src/lib/supabase/profiles.ts` — added `canCreateClaims` to Profile
- `src/app/api/admin/users/[id]/route.ts` — accept `canCreateClaims` in PATCH
- `src/app/page.tsx` — gate New Claim button on grant
- `src/components/claim/ClaimWorkspace.tsx` — redirect direct URL hit
- `src/app/admin/settings/access/access-client.tsx` — full restructure to picker-driven per-appraiser detail

**Migration RUN this session:** `supabase/migration-can-create-claims.sql` (verified: 1 column + 1 INSERT policy)

**Deploy status:**
- LIVE: `<new-deploy-id>` → `<new-deploy-url>`
- Alias flipped, verified.
- Rollback: `npx vercel promote <rollback-url> --scope henry-as-projects-88caed67 --yes`

**In progress / broken / unknowns:** Automation page (`auto_status_requests_override`) still uses the old "list everyone" pattern; deferred (~30 min follow-up).

**Next:** Apply the same search-first pattern to the Automation page whenever Henry wants; add email notifications (task #51 still pending on SMTP creds).
```

Fill in `<new-deploy-id>`, `<new-deploy-url>`, `<rollback-url>` from Steps 2 + 4.

- [ ] **Step 9: Commit SESSIONS entry**

```bash
git add docs/SESSIONS.md
git commit -m "SESSIONS: Log per-user can_create_claims + Access page cleanup"
```

---

## Post-implementation

- Spec: `docs/superpowers/specs/2026-08-27-create-claims-permission-design.md`
- This plan: `docs/superpowers/plans/2026-08-27-create-claims-permission.md`
- No follow-up plans generated. If the Automation page cleanup is wanted, that will be a separate spec + plan.
