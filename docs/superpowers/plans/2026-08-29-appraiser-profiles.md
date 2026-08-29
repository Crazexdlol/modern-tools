# Appraiser Profiles — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full per-user profile page (5 tabs: Information / Permissions / Fees / Licenses / Documents) accessed from `Settings > Users`, a read-only `/my-profile` self-service view, a shared editable fee catalog seeded with 43 fee types, license expiration tracking with in-app alerts, and consolidate all per-user permission toggles into the profile (deleting the Access + Automation pages and their site-wide master toggles).

**Architecture:** Schema-first — one migration file adds `profiles` columns, four new tables (`fee_catalog`, `appraiser_fees`, `appraiser_licenses`, `appraiser_documents`), a private storage bucket, RLS, seeds, and backfill of per-user permissions from the current site-wide toggles. Data layer per new table in `src/lib/supabase/`. API routes under `/api/admin/*` gated with `requireAdmin()`, matching existing patterns. UI: extend the existing `Settings > Users` list (name → link, active badge, license alert dot) and add a `[id]/` profile detail page + 5 tab components under `_tabs/`. Self-service surface is a new `/my-profile` page mirroring the same tab components in read-only mode. License expiration is computed live from `expiration_date` (no cron); a `LicenseExpirationBanner` component appears on the dashboard.

**Tech Stack:** Next.js 16 / React 19 / TypeScript 5, Supabase (`@supabase/ssr` + service role via `createServiceClient()` for admin writes), Tailwind v4, existing shadcn components (`Popover`, `Command`, `Button`, `Card`, `Badge`), Lucide icons.

**Spec:** `docs/superpowers/specs/2026-08-29-appraiser-profiles-design.md`

**Test framework:** None configured in this project. Verification per task is `npx tsc --noEmit` + `npm run build` clean. Manual browser verification at the phase boundaries (after Task 12, Task 18, Task 22) and final smoke on prod after Task 23.

---

## Task 1: Migration — schema + seeds + backfill + rollback

**Files:**
- Create: `supabase/migration-appraiser-profiles.sql`
- Create: `supabase/migration-appraiser-profiles-rollback.sql`

- [ ] **Step 1: Write the up migration**

Create `supabase/migration-appraiser-profiles.sql`:

```sql
-- =========================================================================
-- Modern Tools — Appraiser Profiles migration (2026-08-29)
-- Run in the Supabase SQL Editor (Dashboard -> SQL Editor).
--
-- Adds full appraiser profile support:
--   * profile columns (phone, address_*, is_active)
--   * fee_catalog (site-wide, admin-editable) seeded with 43 fee types
--   * appraiser_fees (per-user amounts)
--   * appraiser_licenses (multi-state, with expiration tracking)
--   * appraiser_documents (metadata; files live in the appraiser-documents
--     storage bucket which must be created manually in the Supabase
--     Dashboard: Storage -> New bucket -> name "appraiser-documents",
--     PRIVATE, no file size limit override needed)
--
-- Also backfills per-user permission columns from the current site-wide
-- toggles, then drops the two site_settings rows.
-- =========================================================================

-- 1. profiles extensions
alter table public.profiles
  add column if not exists phone text,
  add column if not exists address_street text,
  add column if not exists address_city text,
  add column if not exists address_state text,
  add column if not exists address_zip text,
  add column if not exists is_active boolean not null default true;

-- 2. fee_catalog
create table if not exists public.fee_catalog (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  label text not null,
  unit text not null default 'flat',        -- 'flat' | 'per_mile'
  sort_order int not null default 0,
  archived boolean not null default false,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.fee_catalog enable row level security;

create policy "Authenticated read fee_catalog"
  on public.fee_catalog for select
  using (auth.role() = 'authenticated');

create policy "Admin write fee_catalog"
  on public.fee_catalog for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Seed the 43 fee types. sort_order = display order.
insert into public.fee_catalog (code, label, unit, sort_order) values
  ('full_appraisal',           'Full Appraisal Fee',                        'flat',     1),
  ('photos_only',              'Photos Only Fee',                           'flat',     2),
  ('time_expense',             'Time & Expense Fee',                        'flat',     3),
  ('scene_diagram',            'Scene Diagram Fee',                         'flat',     4),
  ('motorcycle',               'Motorcycle Fee',                            'flat',     5),
  ('doi',                      'DOI Fee',                                   'flat',     6),
  ('mileage',                  'Mileage',                                   'per_mile', 7),
  ('total_loss',               'Total Loss',                                'flat',     8),
  ('remote',                   'Remote Fee',                                'flat',     9),
  ('supplement',               'Supplement',                                'flat',    10),
  ('broken_app',               'Broken App',                                'flat',    11),
  ('tolls',                    'Tolls',                                     'flat',    12),
  ('salvage_bids',             'Salvage Bids',                              'flat',    13),
  ('glass_claim',              'Glass Claim',                               'flat',    14),
  ('windshield_claim',         'Windshield Claim',                          'flat',    15),
  ('closed',                   'Closed',                                    'flat',    16),
  ('no_show',                  'No Show',                                   'flat',    17),
  ('property',                 'Property',                                  'flat',    18),
  ('heavy_equipment',          'Heavy Equipment',                           'flat',    19),
  ('software',                 'Software',                                  'flat',    20),
  ('utility_trailer_flat',     'Utility Trailer Flat Fee',                  'flat',    21),
  ('rush_assignment',          'Rush Assignment',                           'flat',    22),
  ('rv_flat',                  'RV Flat Fee',                               'flat',    23),
  ('fuel_sample',              'Fuel Sample',                               'flat',    24),
  ('late_fee_over_90',         'Late Fee Over 90',                          'flat',    25),
  ('drive_time',               'Drive Time',                                'flat',    26),
  ('exotic_vehicle',           'Exotic Vehicle',                            'flat',    27),
  ('subrogation',              'Subrogation',                               'flat',    28),
  ('daily_cat',                'Daily CAT',                                 'flat',    29),
  ('desk_review',              'Desk Review',                               'flat',    30),
  ('drive_in',                 'Drive In',                                  'flat',    31),
  ('rekey',                    'Re-Key',                                    'flat',    32),
  ('hourly_rate',              'Hourly Rate',                               'flat',    33),
  ('specialty',                'Specialty',                                 'flat',    34),
  ('diminished_value',         'Diminished Value',                          'flat',    35),
  ('fuel_surcharge',           'Fuel Surcharge',                            'flat',    36),
  ('mechanical_breakdown',     'Mechanical Breakdown',                      'flat',    37),
  ('condition_fee',            'Condition Fee',                             'flat',    38),
  ('misc',                     'Misc',                                      'flat',    39),
  ('auto_scope_photos',        'Auto Scope and Photos',                     'flat',    40),
  ('desk_supplement',          'Desk Supplement',                           'flat',    41),
  ('heavy_equip_scope_photos', 'Heavy Equipment Scope and Photos',          'flat',    42),
  ('auto_full_physical',       'Auto Full Appraisal — Physical Inspection', 'flat',    43)
on conflict (code) do nothing;

-- 3. appraiser_fees
create table if not exists public.appraiser_fees (
  user_id uuid references public.profiles(id) on delete cascade,
  fee_id uuid references public.fee_catalog(id) on delete cascade,
  amount numeric,                                -- null = "not set"
  updated_at timestamptz default now() not null,
  primary key (user_id, fee_id)
);

alter table public.appraiser_fees enable row level security;

create policy "Read own fees or admin all"
  on public.appraiser_fees for select
  using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "Admin write appraiser_fees"
  on public.appraiser_fees for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- 4. appraiser_licenses
create table if not exists public.appraiser_licenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  state text not null,
  license_number text not null,
  expiration_date date not null,
  notes text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index if not exists appraiser_licenses_expiration_idx on public.appraiser_licenses(expiration_date);
create index if not exists appraiser_licenses_user_idx on public.appraiser_licenses(user_id);

alter table public.appraiser_licenses enable row level security;

create policy "Read own licenses or admin all"
  on public.appraiser_licenses for select
  using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "Admin write appraiser_licenses"
  on public.appraiser_licenses for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- 5. appraiser_documents
create table if not exists public.appraiser_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  kind text,
  storage_path text not null,
  size_bytes int,
  content_type text,
  uploaded_by uuid references public.profiles(id) on delete set null,
  uploaded_at timestamptz default now() not null
);

create index if not exists appraiser_documents_user_idx on public.appraiser_documents(user_id);

alter table public.appraiser_documents enable row level security;

create policy "Read own docs or admin all"
  on public.appraiser_documents for select
  using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "Admin write appraiser_documents"
  on public.appraiser_documents for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- 6. Backfill per-user permissions from site-wide toggles.
--    After this backfill runs, per-user columns are the only source of truth.
--    We coalesce: keep whatever the user already has if it's non-null; else
--    seed from the current global.
do $$
declare
  global_allow_create boolean;
  global_auto_status  boolean;
begin
  select (value)::boolean into global_allow_create
    from public.site_settings where key = 'allow_regular_create_claims';
  select (value)::boolean into global_auto_status
    from public.site_settings where key = 'auto_status_requests_enabled';

  -- can_create_claims already exists and is not null; only backfill if a
  -- user has never been explicitly set. Best signal: only update rows where
  -- the value equals its default (false) AND the caller intends the global
  -- to seed. Simpler + safer: set every non-admin user to the global.
  if global_allow_create is not null then
    update public.profiles
       set can_create_claims = global_allow_create
     where role = 'appraiser';
  end if;

  -- auto_status_requests_override is nullable today (null = follow global).
  -- Replace null values with the effective global setting; leave explicit
  -- overrides (true/false) intact.
  if global_auto_status is not null then
    update public.profiles
       set auto_status_requests_override = global_auto_status
     where auto_status_requests_override is null;
  end if;
end
$$;

-- 7. Remove the two site-settings rows we no longer read.
delete from public.site_settings
 where key in ('allow_regular_create_claims', 'auto_status_requests_enabled');

-- 8. Verification
select 'profiles.phone'         as label, count(*) filter (where column_name = 'phone') as value
  from information_schema.columns where table_schema = 'public' and table_name = 'profiles'
union all select 'profiles.is_active', count(*) filter (where column_name = 'is_active')
  from information_schema.columns where table_schema = 'public' and table_name = 'profiles'
union all select 'fee_catalog rows', count(*)::int from public.fee_catalog
union all select 'appraiser_fees exists', count(*)::int from information_schema.tables where table_schema='public' and table_name='appraiser_fees'
union all select 'appraiser_licenses exists', count(*)::int from information_schema.tables where table_schema='public' and table_name='appraiser_licenses'
union all select 'appraiser_documents exists', count(*)::int from information_schema.tables where table_schema='public' and table_name='appraiser_documents'
union all select 'site_settings orphans', count(*)::int from public.site_settings where key in ('allow_regular_create_claims', 'auto_status_requests_enabled');
```

- [ ] **Step 2: Write the rollback migration**

Create `supabase/migration-appraiser-profiles-rollback.sql`:

```sql
-- =========================================================================
-- ROLLBACK for supabase/migration-appraiser-profiles.sql
-- Restores site_settings rows to their pre-migration values (edit the
-- INSERT below before running to match what was live at the time).
-- Storage bucket 'appraiser-documents' must be removed manually via the
-- Supabase Dashboard.
-- =========================================================================

-- 1. Restore site_settings rows (EDIT these values to match your pre-migration state)
insert into public.site_settings (key, value)
  values
    ('allow_regular_create_claims', 'true'::jsonb),   -- <- SET to your prior value
    ('auto_status_requests_enabled', 'false'::jsonb)  -- <- SET to your prior value
  on conflict (key) do nothing;

-- 2. Drop tables (cascades drop policies + indexes)
drop table if exists public.appraiser_documents cascade;
drop table if exists public.appraiser_licenses cascade;
drop table if exists public.appraiser_fees cascade;
drop table if exists public.fee_catalog cascade;

-- 3. Drop profile columns
alter table public.profiles
  drop column if exists phone,
  drop column if exists address_street,
  drop column if exists address_city,
  drop column if exists address_state,
  drop column if exists address_zip,
  drop column if exists is_active;

-- Note: the permission backfill is NOT reversible without a snapshot of prior
-- per-user values. If you need to undo it, restore from your Supabase backup.
```

- [ ] **Step 3: Hand-off to Henry**

Report to Henry:
- Migration files ready at `supabase/migration-appraiser-profiles.sql` + rollback
- **Before running**: capture current values by running `select key, value from public.site_settings where key in ('allow_regular_create_claims', 'auto_status_requests_enabled');` and paste into the rollback file's INSERT clause
- **Manual step during**: create the `appraiser-documents` bucket in the Supabase Dashboard (Storage → New bucket → name `appraiser-documents`, mark **Private**)
- Then run the up migration in the SQL editor

Wait for confirmation the migration ran clean before proceeding to subsequent tasks (schema is a hard dependency).

- [ ] **Step 4: Commit**

```
git add supabase/migration-appraiser-profiles.sql supabase/migration-appraiser-profiles-rollback.sql
git commit -m "feat(schema): appraiser profiles migration + fee catalog seed + permission backfill"
```

---

## Task 2: Extend `profiles.ts` types + row conversion

**Files:**
- Modify: `src/lib/supabase/profiles.ts`

- [ ] **Step 1: Add new fields to `Profile` and `ProfileRow` interfaces**

Modify the `Profile` interface to add these fields after `autoStatusRequestsOverride`:

```ts
  phone: string | null
  addressStreet: string | null
  addressCity: string | null
  addressState: string | null
  addressZip: string | null
  isActive: boolean
```

Modify `ProfileRow` similarly (add snake_case optionals):

```ts
  phone?: string | null
  address_street?: string | null
  address_city?: string | null
  address_state?: string | null
  address_zip?: string | null
  is_active?: boolean | null
```

- [ ] **Step 2: Update `rowToProfile()` to map the new fields**

Add inside the return object:

```ts
    phone: row.phone ?? null,
    addressStreet: row.address_street ?? null,
    addressCity: row.address_city ?? null,
    addressState: row.address_state ?? null,
    addressZip: row.address_zip ?? null,
    isActive: row.is_active !== false, // default true when column missing
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS. Any errors likely mean a consumer references `.isActive` or one of the new fields somewhere unexpected — none exist yet, so this should be clean.

- [ ] **Step 4: Commit**

```
git add src/lib/supabase/profiles.ts
git commit -m "feat(profiles): add phone, address, and is_active to Profile type"
```

---

## Task 3: Create `fee-catalog.ts` data layer

**Files:**
- Create: `src/lib/supabase/fee-catalog.ts`

- [ ] **Step 1: Create the file**

```ts
import { createClient as createBrowserClient } from './client'

export interface FeeCatalogEntry {
  id: string
  code: string
  label: string
  unit: 'flat' | 'per_mile'
  sortOrder: number
  archived: boolean
}

interface FeeCatalogRow {
  id: string
  code: string
  label: string
  unit: string
  sort_order: number
  archived: boolean
}

function rowToEntry(row: FeeCatalogRow): FeeCatalogEntry {
  return {
    id: row.id,
    code: row.code,
    label: row.label,
    unit: row.unit === 'per_mile' ? 'per_mile' : 'flat',
    sortOrder: row.sort_order,
    archived: row.archived,
  }
}

/** Fetch active fee types (archived=false), sorted by sort_order. */
export async function fetchFeeCatalog(opts: { includeArchived?: boolean } = {}): Promise<FeeCatalogEntry[]> {
  const supabase = createBrowserClient()
  let query = supabase.from('fee_catalog').select('*').order('sort_order', { ascending: true })
  if (!opts.includeArchived) query = query.eq('archived', false)
  const { data, error } = await query
  if (error) {
    console.error('fetchFeeCatalog failed:', error)
    return []
  }
  return (data as FeeCatalogRow[]).map(rowToEntry)
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```
git add src/lib/supabase/fee-catalog.ts
git commit -m "feat(fee-catalog): browser fetch helper"
```

---

## Task 4: Create `appraiser-fees.ts` data layer

**Files:**
- Create: `src/lib/supabase/appraiser-fees.ts`

- [ ] **Step 1: Create the file**

```ts
import { createClient as createBrowserClient } from './client'

export interface AppraiserFee {
  userId: string
  feeId: string
  amount: number | null
}

interface AppraiserFeeRow {
  user_id: string
  fee_id: string
  amount: number | null
}

/** Fetch fee amounts for a single user, keyed by fee_id. */
export async function fetchAppraiserFees(userId: string): Promise<Map<string, number | null>> {
  const supabase = createBrowserClient()
  const { data, error } = await supabase
    .from('appraiser_fees')
    .select('fee_id, amount')
    .eq('user_id', userId)
  if (error) {
    console.error('fetchAppraiserFees failed:', error)
    return new Map()
  }
  const map = new Map<string, number | null>()
  for (const row of data as { fee_id: string; amount: number | null }[]) {
    map.set(row.fee_id, row.amount)
  }
  return map
}
```

- [ ] **Step 2: Type-check + commit**

```
npx tsc --noEmit
git add src/lib/supabase/appraiser-fees.ts
git commit -m "feat(appraiser-fees): browser fetch helper"
```

---

## Task 5: Create `appraiser-licenses.ts` + `getLicenseAlertLevel` utility

**Files:**
- Create: `src/lib/supabase/appraiser-licenses.ts`

- [ ] **Step 1: Create the file**

```ts
import { createClient as createBrowserClient } from './client'

export type LicenseAlertLevel = 'none' | 'notice' | 'warning' | 'urgent' | 'expired'

export interface AppraiserLicense {
  id: string
  userId: string
  state: string
  licenseNumber: string
  expirationDate: string   // 'YYYY-MM-DD'
  notes: string | null
}

interface AppraiserLicenseRow {
  id: string
  user_id: string
  state: string
  license_number: string
  expiration_date: string
  notes: string | null
}

function rowToLicense(row: AppraiserLicenseRow): AppraiserLicense {
  return {
    id: row.id,
    userId: row.user_id,
    state: row.state,
    licenseNumber: row.license_number,
    expirationDate: row.expiration_date,
    notes: row.notes,
  }
}

/**
 * Live-computed alert level based on days-until-expiration.
 * Cadence:
 *   > 90 days  -> none
 *   31-90      -> notice   (amber dot)
 *   8-30       -> warning  (amber banner + dot)
 *   1-7        -> urgent   (red banner + dot)
 *   <= 0       -> expired  (red banner + dot)
 */
export function getLicenseAlertLevel(expirationDate: string, today: Date = new Date()): LicenseAlertLevel {
  const exp = new Date(expirationDate + 'T00:00:00')
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const msPerDay = 1000 * 60 * 60 * 24
  const days = Math.floor((exp.getTime() - t.getTime()) / msPerDay)
  if (days <= 0) return 'expired'
  if (days <= 7) return 'urgent'
  if (days <= 30) return 'warning'
  if (days <= 90) return 'notice'
  return 'none'
}

/** True if any level except 'none' — used for "any alert" checks. */
export function isAlerting(level: LicenseAlertLevel): boolean {
  return level !== 'none'
}

/** True for warning/urgent/expired — used for banner + name-dot triggers. */
export function isBannerLevel(level: LicenseAlertLevel): boolean {
  return level === 'warning' || level === 'urgent' || level === 'expired'
}

export async function fetchUserLicenses(userId: string): Promise<AppraiserLicense[]> {
  const supabase = createBrowserClient()
  const { data, error } = await supabase
    .from('appraiser_licenses')
    .select('*')
    .eq('user_id', userId)
    .order('expiration_date', { ascending: true })
  if (error) {
    console.error('fetchUserLicenses failed:', error)
    return []
  }
  return (data as AppraiserLicenseRow[]).map(rowToLicense)
}

/** Fetch every license across all users — for admin dashboard banner. */
export async function fetchAllLicenses(): Promise<AppraiserLicense[]> {
  const supabase = createBrowserClient()
  const { data, error } = await supabase
    .from('appraiser_licenses')
    .select('*')
    .order('expiration_date', { ascending: true })
  if (error) {
    console.error('fetchAllLicenses failed:', error)
    return []
  }
  return (data as AppraiserLicenseRow[]).map(rowToLicense)
}
```

- [ ] **Step 2: Type-check + commit**

```
npx tsc --noEmit
git add src/lib/supabase/appraiser-licenses.ts
git commit -m "feat(appraiser-licenses): browser helpers + getLicenseAlertLevel utility"
```

---

## Task 6: Create `appraiser-documents.ts` data layer

**Files:**
- Create: `src/lib/supabase/appraiser-documents.ts`

- [ ] **Step 1: Create the file**

```ts
import { createClient as createBrowserClient } from './client'

export interface AppraiserDocument {
  id: string
  userId: string
  name: string
  kind: string | null
  storagePath: string
  sizeBytes: number | null
  contentType: string | null
  uploadedBy: string | null
  uploadedAt: string
}

interface AppraiserDocumentRow {
  id: string
  user_id: string
  name: string
  kind: string | null
  storage_path: string
  size_bytes: number | null
  content_type: string | null
  uploaded_by: string | null
  uploaded_at: string
}

function rowToDoc(row: AppraiserDocumentRow): AppraiserDocument {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    kind: row.kind,
    storagePath: row.storage_path,
    sizeBytes: row.size_bytes,
    contentType: row.content_type,
    uploadedBy: row.uploaded_by,
    uploadedAt: row.uploaded_at,
  }
}

export async function fetchUserDocuments(userId: string): Promise<AppraiserDocument[]> {
  const supabase = createBrowserClient()
  const { data, error } = await supabase
    .from('appraiser_documents')
    .select('*')
    .eq('user_id', userId)
    .order('uploaded_at', { ascending: false })
  if (error) {
    console.error('fetchUserDocuments failed:', error)
    return []
  }
  return (data as AppraiserDocumentRow[]).map(rowToDoc)
}
```

- [ ] **Step 2: Type-check + commit**

```
npx tsc --noEmit
git add src/lib/supabase/appraiser-documents.ts
git commit -m "feat(appraiser-documents): browser fetch helper"
```

---

## Task 7: Extend `PATCH /api/admin/users/[id]` for new profile fields

**Files:**
- Modify: `src/app/api/admin/users/[id]/route.ts`

- [ ] **Step 1: Add new fields to the body shape**

In the `body` type definition (currently around lines 15-22), add:

```ts
    phone?: string | null
    addressStreet?: string | null
    addressCity?: string | null
    addressState?: string | null
    addressZip?: string | null
    isActive?: boolean
```

- [ ] **Step 2: Add them to the "no fields" guard**

Extend the giant `&&` chain in the guard to also check the six new fields, e.g.:

```ts
  if (
    !body ||
    (body.name === undefined &&
      body.role === undefined &&
      body.canReassignClaims === undefined &&
      body.canEditClaimInfo === undefined &&
      body.canCreateClaims === undefined &&
      body.autoStatusRequestsOverride === undefined &&
      body.phone === undefined &&
      body.addressStreet === undefined &&
      body.addressCity === undefined &&
      body.addressState === undefined &&
      body.addressZip === undefined &&
      body.isActive === undefined)
  ) {
    return NextResponse.json({ error: 'no fields to update' }, { status: 400 })
  }
```

- [ ] **Step 3: Add them to the patch builder**

After the existing `if (body.autoStatusRequestsOverride !== undefined) ...` line, add:

```ts
  if (body.phone !== undefined) patch.phone = body.phone
  if (body.addressStreet !== undefined) patch.address_street = body.addressStreet
  if (body.addressCity !== undefined) patch.address_city = body.addressCity
  if (body.addressState !== undefined) patch.address_state = body.addressState
  if (body.addressZip !== undefined) patch.address_zip = body.addressZip
  if (body.isActive !== undefined) patch.is_active = body.isActive
```

- [ ] **Step 4: Type-check + commit**

```
npx tsc --noEmit
git add src/app/api/admin/users/[id]/route.ts
git commit -m "feat(api/admin/users): accept phone, address, and is_active on PATCH"
```

---

## Task 8: Fee catalog CRUD API routes

**Files:**
- Create: `src/app/api/admin/fee-catalog/route.ts`
- Create: `src/app/api/admin/fee-catalog/[id]/route.ts`

- [ ] **Step 1: Create the collection route (POST = create)**

`src/app/api/admin/fee-catalog/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const { errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const body = await request.json().catch(() => null) as {
    code?: string
    label?: string
    unit?: 'flat' | 'per_mile'
    sortOrder?: number
  } | null

  if (!body?.code || !body?.label) {
    return NextResponse.json({ error: 'code and label required' }, { status: 400 })
  }
  const unit = body.unit === 'per_mile' ? 'per_mile' : 'flat'

  const service = createServiceClient()
  const { data, error } = await service.from('fee_catalog').insert({
    code: body.code,
    label: body.label,
    unit,
    sort_order: body.sortOrder ?? 999,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, entry: data })
}
```

- [ ] **Step 2: Create the item route (PATCH + DELETE)**

`src/app/api/admin/fee-catalog/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const { id } = await params
  const body = await request.json().catch(() => null) as {
    label?: string
    unit?: 'flat' | 'per_mile'
    sortOrder?: number
    archived?: boolean
  } | null
  if (!body || (body.label === undefined && body.unit === undefined && body.sortOrder === undefined && body.archived === undefined)) {
    return NextResponse.json({ error: 'no fields to update' }, { status: 400 })
  }

  const service = createServiceClient()
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.label !== undefined) patch.label = body.label
  if (body.unit !== undefined) patch.unit = body.unit === 'per_mile' ? 'per_mile' : 'flat'
  if (body.sortOrder !== undefined) patch.sort_order = body.sortOrder
  if (body.archived !== undefined) patch.archived = body.archived

  const { error } = await service.from('fee_catalog').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const { id } = await params
  const service = createServiceClient()

  // Refuse hard delete if any user has an amount set — force archive instead
  const { count } = await service
    .from('appraiser_fees')
    .select('user_id', { count: 'exact', head: true })
    .eq('fee_id', id)
  if (count && count > 0) {
    return NextResponse.json({ error: 'Fee has amounts set on user profiles; archive it instead of deleting.' }, { status: 409 })
  }

  const { error } = await service.from('fee_catalog').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Type-check + build + commit**

```
npx tsc --noEmit
npm run build
git add src/app/api/admin/fee-catalog/
git commit -m "feat(api/admin/fee-catalog): CRUD routes"
```

---

## Task 9: Appraiser fees bulk upsert API

**Files:**
- Create: `src/app/api/admin/appraiser-fees/route.ts`

- [ ] **Step 1: Create the route**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

/**
 * Bulk-upsert per-user fee amounts. Body:
 *   { userId, fees: [{ feeId, amount }] }
 * amount === null clears the row (deletes it).
 * amount is a number sets/updates the row.
 */
export async function POST(request: NextRequest) {
  const { errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const body = await request.json().catch(() => null) as {
    userId?: string
    fees?: { feeId: string; amount: number | null }[]
  } | null
  if (!body?.userId || !Array.isArray(body.fees)) {
    return NextResponse.json({ error: 'userId and fees array required' }, { status: 400 })
  }

  const service = createServiceClient()
  const nowIso = new Date().toISOString()
  const toUpsert = body.fees
    .filter(f => typeof f.amount === 'number' && Number.isFinite(f.amount))
    .map(f => ({ user_id: body.userId, fee_id: f.feeId, amount: f.amount, updated_at: nowIso }))
  const toDelete = body.fees
    .filter(f => f.amount === null)
    .map(f => f.feeId)

  if (toUpsert.length > 0) {
    const { error } = await service.from('appraiser_fees').upsert(toUpsert, { onConflict: 'user_id,fee_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }
  if (toDelete.length > 0) {
    const { error } = await service.from('appraiser_fees')
      .delete()
      .eq('user_id', body.userId)
      .in('fee_id', toDelete)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Type-check + commit**

```
npx tsc --noEmit
git add src/app/api/admin/appraiser-fees/
git commit -m "feat(api/admin/appraiser-fees): bulk upsert route"
```

---

## Task 10: Appraiser licenses CRUD API

**Files:**
- Create: `src/app/api/admin/appraiser-licenses/route.ts`
- Create: `src/app/api/admin/appraiser-licenses/[id]/route.ts`

- [ ] **Step 1: Create the collection route (POST = add license)**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const { errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const body = await request.json().catch(() => null) as {
    userId?: string
    state?: string
    licenseNumber?: string
    expirationDate?: string
    notes?: string | null
  } | null
  if (!body?.userId || !body?.state || !body?.licenseNumber || !body?.expirationDate) {
    return NextResponse.json({ error: 'userId, state, licenseNumber, expirationDate required' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data, error } = await service.from('appraiser_licenses').insert({
    user_id: body.userId,
    state: body.state.toUpperCase(),
    license_number: body.licenseNumber,
    expiration_date: body.expirationDate,
    notes: body.notes ?? null,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, license: data })
}
```

- [ ] **Step 2: Create the item route (PATCH + DELETE)**

`src/app/api/admin/appraiser-licenses/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const { id } = await params
  const body = await request.json().catch(() => null) as {
    state?: string
    licenseNumber?: string
    expirationDate?: string
    notes?: string | null
  } | null
  if (!body || (body.state === undefined && body.licenseNumber === undefined && body.expirationDate === undefined && body.notes === undefined)) {
    return NextResponse.json({ error: 'no fields to update' }, { status: 400 })
  }

  const service = createServiceClient()
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.state !== undefined) patch.state = body.state.toUpperCase()
  if (body.licenseNumber !== undefined) patch.license_number = body.licenseNumber
  if (body.expirationDate !== undefined) patch.expiration_date = body.expirationDate
  if (body.notes !== undefined) patch.notes = body.notes

  const { error } = await service.from('appraiser_licenses').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const { id } = await params
  const service = createServiceClient()
  const { error } = await service.from('appraiser_licenses').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Type-check + commit**

```
npx tsc --noEmit
git add src/app/api/admin/appraiser-licenses/
git commit -m "feat(api/admin/appraiser-licenses): CRUD routes"
```

---

## Task 11: Appraiser documents API (upload + delete + download)

**Files:**
- Create: `src/app/api/admin/appraiser-documents/upload/route.ts`
- Create: `src/app/api/admin/appraiser-documents/[id]/route.ts`
- Create: `src/app/api/appraiser-documents/[id]/download/route.ts`

- [ ] **Step 1: Create the upload route (admin, multipart)**

`src/app/api/admin/appraiser-documents/upload/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

const BUCKET = 'appraiser-documents'

export async function POST(request: NextRequest) {
  const { caller, errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const form = await request.formData()
  const userId = form.get('userId')
  const file = form.get('file')
  const kind = form.get('kind')

  if (typeof userId !== 'string' || !userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 })
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file required' }, { status: 400 })
  }

  const service = createServiceClient()
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const storagePath = `${userId}/${crypto.randomUUID()}-${safeName}`

  const { error: uploadErr } = await service.storage
    .from(BUCKET)
    .upload(storagePath, file, { contentType: file.type || 'application/octet-stream', upsert: false })
  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 400 })

  const { data, error: insertErr } = await service.from('appraiser_documents').insert({
    user_id: userId,
    name: file.name,
    kind: typeof kind === 'string' && kind ? kind : null,
    storage_path: storagePath,
    size_bytes: file.size,
    content_type: file.type || null,
    uploaded_by: caller!.userId,
  }).select().single()

  if (insertErr) {
    // Best-effort cleanup — if the metadata insert fails, remove the orphan blob
    await service.storage.from(BUCKET).remove([storagePath])
    return NextResponse.json({ error: insertErr.message }, { status: 400 })
  }
  return NextResponse.json({ ok: true, document: data })
}
```

- [ ] **Step 2: Create the delete route (admin)**

`src/app/api/admin/appraiser-documents/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

const BUCKET = 'appraiser-documents'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const { id } = await params
  const service = createServiceClient()

  const { data: row, error: fetchErr } = await service
    .from('appraiser_documents')
    .select('storage_path')
    .eq('id', id)
    .maybeSingle()
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 400 })
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 })

  await service.storage.from(BUCKET).remove([row.storage_path])
  const { error } = await service.from('appraiser_documents').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Create the download route (self or admin)**

`src/app/api/appraiser-documents/[id]/download/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

const BUCKET = 'appraiser-documents'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { caller, errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse

  const { id } = await params
  const service = createServiceClient()

  const { data: row, error: fetchErr } = await service
    .from('appraiser_documents')
    .select('user_id, storage_path')
    .eq('id', id)
    .maybeSingle()
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 400 })
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 })

  // Self can view own; admin can view any.
  if (row.user_id !== caller!.userId && caller!.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { data: signed, error: signErr } = await service.storage
    .from(BUCKET)
    .createSignedUrl(row.storage_path, 60)
  if (signErr || !signed?.signedUrl) {
    return NextResponse.json({ error: signErr?.message ?? 'sign failed' }, { status: 400 })
  }
  return NextResponse.json({ ok: true, url: signed.signedUrl })
}
```

- [ ] **Step 4: Type-check + build + commit**

```
npx tsc --noEmit
npm run build
git add src/app/api/admin/appraiser-documents/ src/app/api/appraiser-documents/
git commit -m "feat(api/appraiser-documents): upload/delete admin routes + self/admin download"
```

---

## Task 12: Extend `Settings > Users` list — clickable names + Active badge + license alert dot

**Files:**
- Modify: `src/app/admin/users/users-admin-client.tsx`

- [ ] **Step 1: Import Link and license helpers at top of the file**

```ts
import Link from 'next/link'
import { fetchAllLicenses, getLicenseAlertLevel, isBannerLevel } from '@/lib/supabase/appraiser-licenses'
```

- [ ] **Step 2: Track a per-user "has alerting license" flag**

In the `UsersAdminClient` component, after the existing `const [profiles, setProfiles] = useState<Profile[]>([])` line, add:

```ts
  const [alertingUserIds, setAlertingUserIds] = useState<Set<string>>(new Set())
```

Modify `load()` to fetch licenses in parallel and populate the set:

```ts
  const load = async () => {
    const [rows, licenses] = await Promise.all([
      fetchAllProfilesBrowser(),
      fetchAllLicenses(),
    ])
    setProfiles(rows)
    const alerting = new Set<string>()
    const today = new Date()
    for (const lic of licenses) {
      if (isBannerLevel(getLicenseAlertLevel(lic.expirationDate, today))) {
        alerting.add(lic.userId)
      }
    }
    setAlertingUserIds(alerting)
    setLoading(false)
  }
```

- [ ] **Step 3: Add Active column and license dot to the table**

In the `<thead>` after the "Role" `<th>`, add:

```tsx
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Active</th>
```

In the body cell for name, wrap the name span in a `Link` when not editing:

```tsx
                    {isEditing ? (
                      <input
                        autoFocus
                        className="bg-white border border-gray-200 rounded px-2 py-1 text-sm text-gray-800 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                      />
                    ) : (
                      <Link
                        href={`/admin/settings/users/${p.id}`}
                        className="text-sm text-blue-700 hover:underline font-medium inline-flex items-center gap-2"
                      >
                        {p.name || <span className="text-gray-400 italic">No name</span>}
                        {alertingUserIds.has(p.id) && (
                          <span
                            title="One or more licenses expiring or expired"
                            className="inline-block w-2 h-2 rounded-full bg-red-500"
                          />
                        )}
                      </Link>
                    )}
```

Add a new `<td>` for Active AFTER the Role cell and BEFORE the Actions cell:

```tsx
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                      p.isActive
                        ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                        : 'text-gray-500 bg-gray-100 border-gray-200'
                    }`}>
                      {p.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
```

- [ ] **Step 4: Build + commit**

```
npx tsc --noEmit
npm run build
git add src/app/admin/users/users-admin-client.tsx
git commit -m "feat(admin/users): clickable name link, active badge, license alert dot"
```

---

## Task 13: Profile detail page shell + Information tab

**Files:**
- Create: `src/app/admin/settings/users/[id]/page.tsx`
- Create: `src/app/admin/settings/users/[id]/profile-detail-client.tsx`
- Create: `src/app/admin/settings/users/[id]/_tabs/info-tab.tsx`

- [ ] **Step 1: Create the server page (auth-gated)**

`src/app/admin/settings/users/[id]/page.tsx`:

```tsx
import { ProfileDetailClient } from './profile-detail-client'

export default async function AdminSettingsUserProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <div>
      <ProfileDetailClient userId={id} />
    </div>
  )
}
```

- [ ] **Step 2: Create the tab shell client**

`src/app/admin/settings/users/[id]/profile-detail-client.tsx`:

```tsx
"use client"

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { fetchAllProfilesBrowser, type Profile } from '@/lib/supabase/profiles'
import { InfoTab } from './_tabs/info-tab'
import { PermissionsTab } from './_tabs/permissions-tab'
import { FeesTab } from './_tabs/fees-tab'
import { LicensesTab } from './_tabs/licenses-tab'
import { DocumentsTab } from './_tabs/documents-tab'

type TabKey = 'info' | 'permissions' | 'fees' | 'licenses' | 'documents'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'info',        label: 'Information' },
  { key: 'permissions', label: 'Permissions' },
  { key: 'fees',        label: 'Fees' },
  { key: 'licenses',    label: 'Licenses' },
  { key: 'documents',   label: 'Documents' },
]

export function ProfileDetailClient({ userId }: { userId: string }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabKey>('info')

  const load = async () => {
    const all = await fetchAllProfilesBrowser()
    setProfile(all.find(p => p.id === userId) ?? null)
    setLoading(false)
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-load pattern
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  if (loading) return <div className="text-sm text-gray-500">Loading…</div>
  if (!profile) return <div className="text-sm text-red-600">User not found.</div>

  return (
    <div className="space-y-6">
      <Link
        href="/admin/settings/users"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Users
      </Link>

      <div>
        <h1 className="text-2xl font-bold">{profile.name || profile.email}</h1>
        <div className="text-sm text-gray-500">{profile.email}</div>
      </div>

      <div className="border-b border-gray-200">
        <nav className="flex gap-1 -mb-px">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      <div>
        {tab === 'info'        && <InfoTab profile={profile} onSaved={load} />}
        {tab === 'permissions' && <PermissionsTab profile={profile} onSaved={load} />}
        {tab === 'fees'        && <FeesTab userId={profile.id} />}
        {tab === 'licenses'    && <LicensesTab userId={profile.id} />}
        {tab === 'documents'   && <DocumentsTab userId={profile.id} />}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create the Information tab**

`src/app/admin/settings/users/[id]/_tabs/info-tab.tsx`:

```tsx
"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { Profile } from '@/lib/supabase/profiles'

export function InfoTab({ profile, onSaved }: { profile: Profile; onSaved: () => void }) {
  const [name, setName] = useState(profile.name ?? '')
  const [phone, setPhone] = useState(profile.phone ?? '')
  const [street, setStreet] = useState(profile.addressStreet ?? '')
  const [city, setCity] = useState(profile.addressCity ?? '')
  const [state, setState] = useState(profile.addressState ?? '')
  const [zip, setZip] = useState(profile.addressZip ?? '')
  const [isActive, setIsActive] = useState(profile.isActive)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const save = async () => {
    setBusy(true); setError(null); setSaved(false)
    const res = await fetch(`/api/admin/users/${profile.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        phone: phone || null,
        addressStreet: street || null,
        addressCity: city || null,
        addressState: state || null,
        addressZip: zip || null,
        isActive,
      }),
    })
    setBusy(false)
    if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.error ?? 'Save failed'); return }
    setSaved(true)
    onSaved()
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <FieldRow label="Name">
        <input value={name} onChange={e => setName(e.target.value)} className={fieldCls} />
      </FieldRow>
      <FieldRow label="Email">
        <div className="text-sm text-gray-500 py-2">{profile.email} <span className="text-xs">(edit via Supabase dashboard)</span></div>
      </FieldRow>
      <FieldRow label="Phone">
        <input value={phone} onChange={e => setPhone(e.target.value)} className={fieldCls} />
      </FieldRow>

      <div className="pt-4 border-t border-gray-100">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Address</div>
        <FieldRow label="Street">
          <input value={street} onChange={e => setStreet(e.target.value)} className={fieldCls} />
        </FieldRow>
        <div className="grid grid-cols-3 gap-3 mt-3">
          <FieldRow label="City">
            <input value={city} onChange={e => setCity(e.target.value)} className={fieldCls} />
          </FieldRow>
          <FieldRow label="State">
            <input value={state} onChange={e => setState(e.target.value.toUpperCase())} maxLength={2} className={fieldCls} />
          </FieldRow>
          <FieldRow label="ZIP">
            <input value={zip} onChange={e => setZip(e.target.value)} className={fieldCls} />
          </FieldRow>
        </div>
      </div>

      <div className="pt-4 border-t border-gray-100">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
          <span className="font-medium">Active</span>
          <span className="text-gray-500">— when off, this user is hidden from the assignment picker but retains login and history.</span>
        </label>
      </div>

      {error && <div className="p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
      {saved && !error && <div className="text-green-700 text-sm">Saved.</div>}

      <div>
        <Button onClick={save} disabled={busy} className="bg-blue-600 text-white">
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  )
}

const fieldCls = 'w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">{label}</span>
      {children}
    </label>
  )
}
```

- [ ] **Step 4: Placeholder stubs for the other four tabs (so the shell type-checks)**

Create these files with a single stub line each so imports resolve. They'll be replaced in Tasks 14-17:

`src/app/admin/settings/users/[id]/_tabs/permissions-tab.tsx`:

```tsx
export function PermissionsTab(_: { profile: import('@/lib/supabase/profiles').Profile; onSaved: () => void }) {
  return <div className="text-sm text-gray-500">Permissions tab — coming next task.</div>
}
```

`src/app/admin/settings/users/[id]/_tabs/fees-tab.tsx`:

```tsx
export function FeesTab(_: { userId: string }) {
  return <div className="text-sm text-gray-500">Fees tab — coming next task.</div>
}
```

`src/app/admin/settings/users/[id]/_tabs/licenses-tab.tsx`:

```tsx
export function LicensesTab(_: { userId: string }) {
  return <div className="text-sm text-gray-500">Licenses tab — coming next task.</div>
}
```

`src/app/admin/settings/users/[id]/_tabs/documents-tab.tsx`:

```tsx
export function DocumentsTab(_: { userId: string }) {
  return <div className="text-sm text-gray-500">Documents tab — coming next task.</div>
}
```

- [ ] **Step 5: Build + commit**

```
npx tsc --noEmit
npm run build
git add src/app/admin/settings/users/[id]/
git commit -m "feat(admin/settings/users/[id]): profile detail page shell + Info tab"
```

---

## Task 14: Permissions tab

**Files:**
- Modify: `src/app/admin/settings/users/[id]/_tabs/permissions-tab.tsx` (replace stub)

- [ ] **Step 1: Replace the stub with the real component**

```tsx
"use client"

import { useState } from 'react'
import type { Profile } from '@/lib/supabase/profiles'

type PermField = 'canCreateClaims' | 'canReassignClaims' | 'canEditClaimInfo' | 'autoStatusRequestsOverride'

const TOGGLES: { field: PermField; label: string; description: string }[] = [
  {
    field: 'canCreateClaims',
    label: 'Create claims',
    description: 'Can create new claims from the Dashboard.',
  },
  {
    field: 'canReassignClaims',
    label: 'Reassign claims',
    description: 'Can reassign a claim they own to another appraiser.',
  },
  {
    field: 'canEditClaimInfo',
    label: 'Edit Claim Info',
    description: 'Can edit the Claim Info form after the claim is created.',
  },
  {
    field: 'autoStatusRequestsOverride',
    label: 'Auto status requests',
    description: 'Receive automatic 48-hour status-request messages on assigned claims.',
  },
]

export function PermissionsTab({ profile, onSaved }: { profile: Profile; onSaved: () => void }) {
  const [values, setValues] = useState<Record<PermField, boolean>>({
    canCreateClaims: profile.canCreateClaims,
    canReassignClaims: profile.canReassignClaims,
    canEditClaimInfo: profile.canEditClaimInfo,
    autoStatusRequestsOverride: profile.autoStatusRequestsOverride === true,
  })
  const [busyField, setBusyField] = useState<PermField | null>(null)
  const [error, setError] = useState<string | null>(null)

  const toggle = async (field: PermField, next: boolean) => {
    setError(null)
    setBusyField(field)
    const prev = values[field]
    setValues(v => ({ ...v, [field]: next }))
    const res = await fetch(`/api/admin/users/${profile.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: next }),
    })
    setBusyField(null)
    if (!res.ok) {
      setValues(v => ({ ...v, [field]: prev }))
      const b = await res.json().catch(() => ({}))
      setError(b.error ?? 'Save failed')
      return
    }
    onSaved()
  }

  return (
    <div className="space-y-3 max-w-2xl">
      {TOGGLES.map(({ field, label, description }) => (
        <div key={field} className="flex items-start justify-between gap-4 py-3 border-b border-gray-100">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-900">{label}</div>
            <div className="text-xs text-gray-500 mt-0.5">{description}</div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={values[field]}
            disabled={busyField !== null}
            onClick={() => toggle(field, !values[field])}
            className={`shrink-0 w-11 h-6 rounded-full transition-colors relative ${
              values[field] ? 'bg-blue-600' : 'bg-gray-300'
            } disabled:opacity-50`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                values[field] ? 'translate-x-5' : ''
              }`}
            />
          </button>
        </div>
      ))}

      {error && <div className="p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
    </div>
  )
}
```

- [ ] **Step 2: Build + commit**

```
npx tsc --noEmit
npm run build
git add src/app/admin/settings/users/[id]/_tabs/permissions-tab.tsx
git commit -m "feat(admin/settings/users/[id]): Permissions tab with 4 toggles"
```

---

## Task 15: Fees tab

**Files:**
- Modify: `src/app/admin/settings/users/[id]/_tabs/fees-tab.tsx` (replace stub)

- [ ] **Step 1: Replace the stub with the real component**

```tsx
"use client"

import { useEffect, useState } from 'react'
import { fetchFeeCatalog, type FeeCatalogEntry } from '@/lib/supabase/fee-catalog'
import { fetchAppraiserFees } from '@/lib/supabase/appraiser-fees'

export function FeesTab({ userId }: { userId: string }) {
  const [catalog, setCatalog] = useState<FeeCatalogEntry[]>([])
  const [amounts, setAmounts] = useState<Map<string, number | null>>(new Map())
  const [loading, setLoading] = useState(true)
  const [dirty, setDirty] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchFeeCatalog(), fetchAppraiserFees(userId)]).then(([cat, amts]) => {
      if (cancelled) return
      setCatalog(cat)
      setAmounts(amts)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [userId])

  const setAmount = (feeId: string, raw: string) => {
    const trimmed = raw.trim()
    const next = new Map(amounts)
    if (trimmed === '') next.set(feeId, null)
    else {
      const parsed = parseFloat(trimmed)
      if (Number.isNaN(parsed)) return
      next.set(feeId, parsed)
    }
    setAmounts(next)
    setDirty(d => new Set(d).add(feeId))
    setSaved(false)
  }

  const save = async () => {
    if (dirty.size === 0) return
    setSaving(true); setError(null); setSaved(false)
    const fees = Array.from(dirty).map(feeId => ({ feeId, amount: amounts.get(feeId) ?? null }))
    const res = await fetch('/api/admin/appraiser-fees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, fees }),
    })
    setSaving(false)
    if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.error ?? 'Save failed'); return }
    setDirty(new Set())
    setSaved(true)
  }

  if (loading) return <div className="text-sm text-gray-500">Loading fees…</div>

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Fee</th>
              <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-40">Amount ($)</th>
            </tr>
          </thead>
          <tbody>
            {catalog.map(entry => {
              const label = entry.unit === 'per_mile' ? `${entry.label} ($/mile)` : entry.label
              const value = amounts.get(entry.id)
              const display = value === null || value === undefined ? '' : String(value)
              return (
                <tr key={entry.id} className="border-b border-gray-100 last:border-b-0">
                  <td className="px-4 py-2 text-gray-800">{label}</td>
                  <td className="px-4 py-2 text-right">
                    <input
                      type="number"
                      step="0.01"
                      inputMode="decimal"
                      value={display}
                      onChange={e => setAmount(entry.id, e.target.value)}
                      className="w-32 bg-white border border-gray-200 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {error && <div className="p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
      {saved && !error && <div className="text-green-700 text-sm">Saved.</div>}

      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={dirty.size === 0 || saving}
          className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded disabled:opacity-50 hover:bg-blue-700"
        >
          {saving ? 'Saving…' : `Save${dirty.size > 0 ? ` (${dirty.size})` : ''}`}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Build + commit**

```
npx tsc --noEmit
npm run build
git add src/app/admin/settings/users/[id]/_tabs/fees-tab.tsx
git commit -m "feat(admin/settings/users/[id]): Fees tab with catalog table + bulk save"
```

---

## Task 16: Licenses tab

**Files:**
- Modify: `src/app/admin/settings/users/[id]/_tabs/licenses-tab.tsx` (replace stub)

- [ ] **Step 1: Replace the stub with the real component**

```tsx
"use client"

import { useEffect, useState } from 'react'
import { Plus, Trash2, Save, X } from 'lucide-react'
import { fetchUserLicenses, getLicenseAlertLevel, type AppraiserLicense, type LicenseAlertLevel } from '@/lib/supabase/appraiser-licenses'

interface Draft {
  id: string | null   // null = new
  state: string
  licenseNumber: string
  expirationDate: string
  notes: string
}

const emptyDraft = (): Draft => ({ id: null, state: '', licenseNumber: '', expirationDate: '', notes: '' })

export function LicensesTab({ userId }: { userId: string }) {
  const [rows, setRows] = useState<AppraiserLicense[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setRows(await fetchUserLicenses(userId))
    setLoading(false)
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-load pattern
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const startEdit = (row: AppraiserLicense) => {
    setDraft({
      id: row.id,
      state: row.state,
      licenseNumber: row.licenseNumber,
      expirationDate: row.expirationDate,
      notes: row.notes ?? '',
    })
    setError(null)
  }

  const startAdd = () => {
    setDraft(emptyDraft())
    setError(null)
  }

  const cancel = () => setDraft(null)

  const save = async () => {
    if (!draft) return
    if (!draft.state || !draft.licenseNumber || !draft.expirationDate) {
      setError('State, license number, and expiration date are required.')
      return
    }
    setBusy(true); setError(null)
    const body = {
      userId,
      state: draft.state,
      licenseNumber: draft.licenseNumber,
      expirationDate: draft.expirationDate,
      notes: draft.notes || null,
    }
    let res: Response
    if (draft.id === null) {
      res = await fetch('/api/admin/appraiser-licenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    } else {
      res = await fetch(`/api/admin/appraiser-licenses/${draft.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    }
    setBusy(false)
    if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.error ?? 'Save failed'); return }
    setDraft(null)
    load()
  }

  const remove = async (id: string) => {
    if (!confirm('Delete this license?')) return
    setBusy(true); setError(null)
    const res = await fetch(`/api/admin/appraiser-licenses/${id}`, { method: 'DELETE' })
    setBusy(false)
    if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.error ?? 'Delete failed'); return }
    load()
  }

  if (loading) return <div className="text-sm text-gray-500">Loading licenses…</div>

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex justify-end">
        <button
          onClick={startAdd}
          disabled={draft !== null}
          className="inline-flex items-center gap-1 bg-blue-600 text-white text-sm font-medium px-3 py-1.5 rounded disabled:opacity-50 hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" /> Add License
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-20">State</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">License #</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-40">Expires</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-32">Status</th>
              <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-24">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const isEditing = draft?.id === row.id
              const level = getLicenseAlertLevel(row.expirationDate)
              return (
                <tr key={row.id} className={`border-b border-gray-100 ${isEditing ? 'bg-blue-50/40' : ''}`}>
                  {isEditing && draft ? (
                    <>
                      <td className="px-3 py-2"><input value={draft.state} onChange={e => setDraft({ ...draft, state: e.target.value.toUpperCase() })} maxLength={2} className={inputCls + ' w-16'} /></td>
                      <td className="px-3 py-2"><input value={draft.licenseNumber} onChange={e => setDraft({ ...draft, licenseNumber: e.target.value })} className={inputCls} /></td>
                      <td className="px-3 py-2"><input type="date" value={draft.expirationDate} onChange={e => setDraft({ ...draft, expirationDate: e.target.value })} className={inputCls} /></td>
                      <td className="px-3 py-2 text-xs text-gray-400">—</td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex gap-2">
                          <button onClick={save} disabled={busy} className="text-emerald-600 hover:text-emerald-700 disabled:opacity-40" title="Save"><Save className="w-4 h-4" /></button>
                          <button onClick={cancel} disabled={busy} className="text-gray-400 hover:text-gray-600 disabled:opacity-40" title="Cancel"><X className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2 font-mono text-xs">{row.state}</td>
                      <td className="px-3 py-2 font-mono text-xs">{row.licenseNumber}</td>
                      <td className="px-3 py-2">{row.expirationDate}</td>
                      <td className="px-3 py-2"><LevelBadge level={level} expiration={row.expirationDate} /></td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex gap-2">
                          <button onClick={() => startEdit(row)} disabled={draft !== null || busy} className="text-gray-400 hover:text-blue-600 disabled:opacity-40" title="Edit">Edit</button>
                          <button onClick={() => remove(row.id)} disabled={draft !== null || busy} className="text-gray-400 hover:text-red-600 disabled:opacity-40" title="Delete"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              )
            })}
            {draft && draft.id === null && (
              <tr className="bg-blue-50/40 border-b border-gray-100">
                <td className="px-3 py-2"><input value={draft.state} onChange={e => setDraft({ ...draft, state: e.target.value.toUpperCase() })} maxLength={2} placeholder="FL" className={inputCls + ' w-16'} /></td>
                <td className="px-3 py-2"><input value={draft.licenseNumber} onChange={e => setDraft({ ...draft, licenseNumber: e.target.value })} placeholder="License #" className={inputCls} /></td>
                <td className="px-3 py-2"><input type="date" value={draft.expirationDate} onChange={e => setDraft({ ...draft, expirationDate: e.target.value })} className={inputCls} /></td>
                <td className="px-3 py-2 text-xs text-gray-400">—</td>
                <td className="px-3 py-2 text-right">
                  <div className="inline-flex gap-2">
                    <button onClick={save} disabled={busy} className="text-emerald-600 hover:text-emerald-700 disabled:opacity-40" title="Save"><Save className="w-4 h-4" /></button>
                    <button onClick={cancel} disabled={busy} className="text-gray-400 hover:text-gray-600 disabled:opacity-40" title="Cancel"><X className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            )}
            {rows.length === 0 && !draft && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-sm text-gray-400 italic">No licenses on file.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {error && <div className="p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
    </div>
  )
}

const inputCls = 'bg-white border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

function LevelBadge({ level, expiration }: { level: LicenseAlertLevel; expiration: string }) {
  if (level === 'none') return null
  const daysUntil = Math.floor((new Date(expiration + 'T00:00:00').getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  const styles: Record<Exclude<LicenseAlertLevel, 'none'>, { cls: string; text: string }> = {
    notice:  { cls: 'text-amber-700 bg-amber-50 border-amber-200', text: `${daysUntil}d` },
    warning: { cls: 'text-amber-700 bg-amber-100 border-amber-300', text: `${daysUntil}d` },
    urgent:  { cls: 'text-red-700 bg-red-50 border-red-200', text: `${daysUntil}d` },
    expired: { cls: 'text-red-700 bg-red-100 border-red-300', text: 'EXPIRED' },
  }
  const s = styles[level]
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${s.cls}`}>{s.text}</span>
}
```

- [ ] **Step 2: Build + commit**

```
npx tsc --noEmit
npm run build
git add src/app/admin/settings/users/[id]/_tabs/licenses-tab.tsx
git commit -m "feat(admin/settings/users/[id]): Licenses tab with inline add/edit + alert badges"
```

---

## Task 17: Documents tab

**Files:**
- Modify: `src/app/admin/settings/users/[id]/_tabs/documents-tab.tsx` (replace stub)

- [ ] **Step 1: Replace the stub with the real component**

```tsx
"use client"

import { useEffect, useRef, useState } from 'react'
import { Trash2, Download, Upload } from 'lucide-react'
import { fetchUserDocuments, type AppraiserDocument } from '@/lib/supabase/appraiser-documents'

const KIND_SUGGESTIONS = ['W9', 'License', 'Contract', 'Insurance', 'Other']

export function DocumentsTab({ userId }: { userId: string }) {
  const [rows, setRows] = useState<AppraiserDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingKind, setPendingKind] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    setRows(await fetchUserDocuments(userId))
    setLoading(false)
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-load pattern
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const upload = async (file: File) => {
    setBusy(true); setError(null)
    const form = new FormData()
    form.set('userId', userId)
    form.set('file', file)
    if (pendingKind) form.set('kind', pendingKind)
    const res = await fetch('/api/admin/appraiser-documents/upload', { method: 'POST', body: form })
    setBusy(false)
    if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.error ?? 'Upload failed'); return }
    setPendingKind('')
    load()
  }

  const download = async (id: string) => {
    const res = await fetch(`/api/appraiser-documents/${id}/download`)
    if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.error ?? 'Download failed'); return }
    const { url } = await res.json()
    window.open(url, '_blank', 'noopener')
  }

  const remove = async (id: string) => {
    if (!confirm('Delete this document? This cannot be undone.')) return
    setBusy(true); setError(null)
    const res = await fetch(`/api/admin/appraiser-documents/${id}`, { method: 'DELETE' })
    setBusy(false)
    if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.error ?? 'Delete failed'); return }
    load()
  }

  if (loading) return <div className="text-sm text-gray-500">Loading documents…</div>

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex gap-2 items-end">
        <label className="block flex-1 max-w-xs">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Kind (optional)</span>
          <input
            list="doc-kinds"
            value={pendingKind}
            onChange={e => setPendingKind(e.target.value)}
            placeholder="e.g. W9"
            className="w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <datalist id="doc-kinds">
            {KIND_SUGGESTIONS.map(k => <option key={k} value={k} />)}
          </datalist>
        </label>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="inline-flex items-center gap-1 bg-blue-600 text-white text-sm font-medium px-3 py-2 rounded disabled:opacity-50 hover:bg-blue-700"
        >
          <Upload className="w-4 h-4" /> Upload
        </button>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) upload(f)
            e.target.value = ''
          }}
        />
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">Kind</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-40">Uploaded</th>
              <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-24">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(doc => (
              <tr key={doc.id} className="border-b border-gray-100 last:border-b-0">
                <td className="px-3 py-2 text-gray-800">{doc.name}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{doc.kind ?? '—'}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{new Date(doc.uploadedAt).toLocaleDateString()}</td>
                <td className="px-3 py-2 text-right">
                  <div className="inline-flex gap-2">
                    <button onClick={() => download(doc.id)} className="text-gray-400 hover:text-blue-600" title="Download"><Download className="w-4 h-4" /></button>
                    <button onClick={() => remove(doc.id)} disabled={busy} className="text-gray-400 hover:text-red-600 disabled:opacity-40" title="Delete"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-sm text-gray-400 italic">No documents on file.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {error && <div className="p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
    </div>
  )
}
```

- [ ] **Step 2: Build + commit**

```
npx tsc --noEmit
npm run build
git add src/app/admin/settings/users/[id]/_tabs/documents-tab.tsx
git commit -m "feat(admin/settings/users/[id]): Documents tab with upload/download/delete"
```

---

## Task 18: Fee catalog admin page

**Files:**
- Create: `src/app/admin/settings/fee-catalog/page.tsx`
- Create: `src/app/admin/settings/fee-catalog/fee-catalog-client.tsx`

- [ ] **Step 1: Create the server page**

```tsx
import { FeeCatalogClient } from './fee-catalog-client'

export default function AdminSettingsFeeCatalogPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Fee Catalog</h1>
      <p className="text-sm text-gray-500 mb-6">The list of fee types every appraiser profile shows. Archive a fee to hide it from profiles without deleting the historical amounts.</p>
      <FeeCatalogClient />
    </div>
  )
}
```

- [ ] **Step 2: Create the client**

`src/app/admin/settings/fee-catalog/fee-catalog-client.tsx`:

```tsx
"use client"

import { useEffect, useState } from 'react'
import { Plus, Archive, Undo2, Trash2, Save, X } from 'lucide-react'
import { fetchFeeCatalog, type FeeCatalogEntry } from '@/lib/supabase/fee-catalog'

interface Draft {
  id: string | null   // null = new
  code: string
  label: string
  unit: 'flat' | 'per_mile'
  sortOrder: number
}

const emptyDraft = (nextSort: number): Draft => ({
  id: null, code: '', label: '', unit: 'flat', sortOrder: nextSort,
})

export function FeeCatalogClient() {
  const [rows, setRows] = useState<FeeCatalogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [showArchived, setShowArchived] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setRows(await fetchFeeCatalog({ includeArchived: showArchived }))
    setLoading(false)
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-load pattern
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchived])

  const startAdd = () => {
    const nextSort = rows.length === 0 ? 1 : Math.max(...rows.map(r => r.sortOrder)) + 1
    setDraft(emptyDraft(nextSort))
    setError(null)
  }

  const save = async () => {
    if (!draft) return
    if (!draft.code || !draft.label) { setError('Code and label required.'); return }
    setBusy(true); setError(null)
    const body = { code: draft.code, label: draft.label, unit: draft.unit, sortOrder: draft.sortOrder }
    const url = draft.id === null ? '/api/admin/fee-catalog' : `/api/admin/fee-catalog/${draft.id}`
    const method = draft.id === null ? 'POST' : 'PATCH'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setBusy(false)
    if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.error ?? 'Save failed'); return }
    setDraft(null)
    load()
  }

  const archive = async (id: string, next: boolean) => {
    setBusy(true); setError(null)
    const res = await fetch(`/api/admin/fee-catalog/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: next }),
    })
    setBusy(false)
    if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.error ?? 'Save failed'); return }
    load()
  }

  const remove = async (id: string) => {
    if (!confirm('Delete this fee type? If any appraiser has an amount for it, deletion will be refused (archive it instead).')) return
    setBusy(true); setError(null)
    const res = await fetch(`/api/admin/fee-catalog/${id}`, { method: 'DELETE' })
    setBusy(false)
    if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.error ?? 'Delete failed'); return }
    load()
  }

  if (loading) return <div className="text-sm text-gray-500">Loading fee catalog…</div>

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <label className="text-sm text-gray-600 inline-flex items-center gap-2">
          <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />
          Show archived
        </label>
        <button
          onClick={startAdd}
          disabled={draft !== null}
          className="inline-flex items-center gap-1 bg-blue-600 text-white text-sm font-medium px-3 py-1.5 rounded disabled:opacity-50 hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" /> Add Fee Type
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-16">#</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Label</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-48">Code</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">Unit</th>
              <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-32">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const isEditing = draft?.id === row.id
              return (
                <tr key={row.id} className={`border-b border-gray-100 ${row.archived ? 'opacity-50' : ''} ${isEditing ? 'bg-blue-50/40' : ''}`}>
                  {isEditing && draft ? (
                    <>
                      <td className="px-3 py-2"><input type="number" value={draft.sortOrder} onChange={e => setDraft({ ...draft, sortOrder: parseInt(e.target.value || '0', 10) })} className={inputCls + ' w-12'} /></td>
                      <td className="px-3 py-2"><input value={draft.label} onChange={e => setDraft({ ...draft, label: e.target.value })} className={inputCls} /></td>
                      <td className="px-3 py-2 text-xs text-gray-400">{row.code} (immutable)</td>
                      <td className="px-3 py-2">
                        <select value={draft.unit} onChange={e => setDraft({ ...draft, unit: e.target.value as 'flat' | 'per_mile' })} className={inputCls}>
                          <option value="flat">flat ($)</option>
                          <option value="per_mile">per mile</option>
                        </select>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex gap-2">
                          <button onClick={save} disabled={busy} className="text-emerald-600 hover:text-emerald-700 disabled:opacity-40" title="Save"><Save className="w-4 h-4" /></button>
                          <button onClick={() => setDraft(null)} disabled={busy} className="text-gray-400 hover:text-gray-600 disabled:opacity-40" title="Cancel"><X className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2 text-gray-500 text-xs">{row.sortOrder}</td>
                      <td className="px-3 py-2 text-gray-800">{row.label}</td>
                      <td className="px-3 py-2 font-mono text-xs text-gray-500">{row.code}</td>
                      <td className="px-3 py-2 text-xs text-gray-500">{row.unit === 'per_mile' ? 'per mile' : 'flat'}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex gap-2">
                          <button onClick={() => setDraft({ id: row.id, code: row.code, label: row.label, unit: row.unit, sortOrder: row.sortOrder })} disabled={draft !== null || busy} className="text-gray-400 hover:text-blue-600 disabled:opacity-40" title="Edit">Edit</button>
                          <button onClick={() => archive(row.id, !row.archived)} disabled={busy} className="text-gray-400 hover:text-amber-600 disabled:opacity-40" title={row.archived ? 'Unarchive' : 'Archive'}>
                            {row.archived ? <Undo2 className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                          </button>
                          <button onClick={() => remove(row.id)} disabled={busy} className="text-gray-400 hover:text-red-600 disabled:opacity-40" title="Delete"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              )
            })}
            {draft && draft.id === null && (
              <tr className="bg-blue-50/40 border-b border-gray-100">
                <td className="px-3 py-2"><input type="number" value={draft.sortOrder} onChange={e => setDraft({ ...draft, sortOrder: parseInt(e.target.value || '0', 10) })} className={inputCls + ' w-12'} /></td>
                <td className="px-3 py-2"><input value={draft.label} onChange={e => setDraft({ ...draft, label: e.target.value })} placeholder="Label" className={inputCls} /></td>
                <td className="px-3 py-2"><input value={draft.code} onChange={e => setDraft({ ...draft, code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })} placeholder="code_snake_case" className={inputCls} /></td>
                <td className="px-3 py-2">
                  <select value={draft.unit} onChange={e => setDraft({ ...draft, unit: e.target.value as 'flat' | 'per_mile' })} className={inputCls}>
                    <option value="flat">flat ($)</option>
                    <option value="per_mile">per mile</option>
                  </select>
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="inline-flex gap-2">
                    <button onClick={save} disabled={busy} className="text-emerald-600 hover:text-emerald-700 disabled:opacity-40" title="Save"><Save className="w-4 h-4" /></button>
                    <button onClick={() => setDraft(null)} disabled={busy} className="text-gray-400 hover:text-gray-600 disabled:opacity-40" title="Cancel"><X className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {error && <div className="p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
    </div>
  )
}

const inputCls = 'bg-white border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
```

- [ ] **Step 3: Build + commit**

```
npx tsc --noEmit
npm run build
git add src/app/admin/settings/fee-catalog/
git commit -m "feat(admin/settings/fee-catalog): add/edit/archive/delete fee types"
```

---

## Task 19: `/my-profile` self-service page

**Files:**
- Create: `src/app/my-profile/page.tsx`
- Create: `src/app/my-profile/my-profile-client.tsx`

- [ ] **Step 1: Create the server page**

```tsx
import { AppHeader } from '@/components/app-header'
import { MyProfileClient } from './my-profile-client'

export default function MyProfilePage() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <AppHeader />
      <main className="max-w-5xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold mb-6">My Profile</h1>
        <MyProfileClient />
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Create the client (read-only view of 4 tabs)**

`src/app/my-profile/my-profile-client.tsx`:

```tsx
"use client"

import { useEffect, useState } from 'react'
import { fetchCurrentProfileBrowser, type Profile } from '@/lib/supabase/profiles'
import { fetchFeeCatalog, type FeeCatalogEntry } from '@/lib/supabase/fee-catalog'
import { fetchAppraiserFees } from '@/lib/supabase/appraiser-fees'
import { fetchUserLicenses, getLicenseAlertLevel, type AppraiserLicense, type LicenseAlertLevel } from '@/lib/supabase/appraiser-licenses'
import { fetchUserDocuments, type AppraiserDocument } from '@/lib/supabase/appraiser-documents'
import { Download } from 'lucide-react'

type TabKey = 'info' | 'fees' | 'licenses' | 'documents'
const TABS: { key: TabKey; label: string }[] = [
  { key: 'info',      label: 'Information' },
  { key: 'fees',      label: 'Fees' },
  { key: 'licenses',  label: 'Licenses' },
  { key: 'documents', label: 'Documents' },
]

export function MyProfileClient() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabKey>('info')

  useEffect(() => {
    fetchCurrentProfileBrowser().then(p => { setProfile(p); setLoading(false) })
  }, [])

  if (loading) return <div className="text-sm text-gray-500">Loading…</div>
  if (!profile) return <div className="text-sm text-red-600">Profile not found.</div>

  return (
    <div className="space-y-6">
      <div className="border-b border-gray-200">
        <nav className="flex gap-1 -mb-px">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>
      {tab === 'info'      && <ReadInfo profile={profile} />}
      {tab === 'fees'      && <ReadFees userId={profile.id} />}
      {tab === 'licenses'  && <ReadLicenses userId={profile.id} />}
      {tab === 'documents' && <ReadDocuments userId={profile.id} />}
    </div>
  )
}

function ReadInfo({ profile }: { profile: Profile }) {
  const addr = [profile.addressStreet, profile.addressCity, profile.addressState, profile.addressZip].filter(Boolean).join(', ') || '—'
  return (
    <dl className="space-y-3 max-w-lg">
      <Row label="Name"    value={profile.name || '—'} />
      <Row label="Email"   value={profile.email} />
      <Row label="Phone"   value={profile.phone || '—'} />
      <Row label="Address" value={addr} />
      <Row label="Status"  value={profile.isActive ? 'Active' : 'Inactive'} />
    </dl>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-3 gap-4 py-2 border-b border-gray-100">
      <dt className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</dt>
      <dd className="col-span-2 text-sm text-gray-800">{value}</dd>
    </div>
  )
}

function ReadFees({ userId }: { userId: string }) {
  const [catalog, setCatalog] = useState<FeeCatalogEntry[]>([])
  const [amounts, setAmounts] = useState<Map<string, number | null>>(new Map())
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    Promise.all([fetchFeeCatalog(), fetchAppraiserFees(userId)]).then(([c, a]) => {
      setCatalog(c); setAmounts(a); setLoading(false)
    })
  }, [userId])
  if (loading) return <div className="text-sm text-gray-500">Loading…</div>
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden max-w-2xl">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Fee</th>
            <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-40">Amount ($)</th>
          </tr>
        </thead>
        <tbody>
          {catalog.map(entry => {
            const label = entry.unit === 'per_mile' ? `${entry.label} ($/mile)` : entry.label
            const value = amounts.get(entry.id)
            return (
              <tr key={entry.id} className="border-b border-gray-100 last:border-b-0">
                <td className="px-4 py-2 text-gray-800">{label}</td>
                <td className="px-4 py-2 text-right text-gray-800">{value === null || value === undefined ? <span className="text-gray-400">—</span> : value.toFixed(2)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ReadLicenses({ userId }: { userId: string }) {
  const [rows, setRows] = useState<AppraiserLicense[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => { fetchUserLicenses(userId).then(r => { setRows(r); setLoading(false) }) }, [userId])
  if (loading) return <div className="text-sm text-gray-500">Loading…</div>
  if (rows.length === 0) return <div className="text-sm text-gray-400 italic">No licenses on file. Contact an admin to add one.</div>
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden max-w-3xl">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-20">State</th>
            <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">License #</th>
            <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-40">Expires</th>
            <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-32">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const level = getLicenseAlertLevel(row.expirationDate)
            return (
              <tr key={row.id} className="border-b border-gray-100 last:border-b-0">
                <td className="px-3 py-2 font-mono text-xs">{row.state}</td>
                <td className="px-3 py-2 font-mono text-xs">{row.licenseNumber}</td>
                <td className="px-3 py-2">{row.expirationDate}</td>
                <td className="px-3 py-2"><SmallLevelBadge level={level} expiration={row.expirationDate} /></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function SmallLevelBadge({ level, expiration }: { level: LicenseAlertLevel; expiration: string }) {
  if (level === 'none') return null
  const daysUntil = Math.floor((new Date(expiration + 'T00:00:00').getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  const styles: Record<Exclude<LicenseAlertLevel, 'none'>, { cls: string; text: string }> = {
    notice:  { cls: 'text-amber-700 bg-amber-50 border-amber-200', text: `${daysUntil}d` },
    warning: { cls: 'text-amber-700 bg-amber-100 border-amber-300', text: `${daysUntil}d` },
    urgent:  { cls: 'text-red-700 bg-red-50 border-red-200', text: `${daysUntil}d` },
    expired: { cls: 'text-red-700 bg-red-100 border-red-300', text: 'EXPIRED' },
  }
  const s = styles[level]
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${s.cls}`}>{s.text}</span>
}

function ReadDocuments({ userId }: { userId: string }) {
  const [rows, setRows] = useState<AppraiserDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { fetchUserDocuments(userId).then(r => { setRows(r); setLoading(false) }) }, [userId])

  const download = async (id: string) => {
    const res = await fetch(`/api/appraiser-documents/${id}/download`)
    if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.error ?? 'Download failed'); return }
    const { url } = await res.json()
    window.open(url, '_blank', 'noopener')
  }

  if (loading) return <div className="text-sm text-gray-500">Loading…</div>
  if (rows.length === 0) return <div className="text-sm text-gray-400 italic">No documents on file.</div>
  return (
    <div className="space-y-3 max-w-3xl">
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">Kind</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-40">Uploaded</th>
              <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-16">Get</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(doc => (
              <tr key={doc.id} className="border-b border-gray-100 last:border-b-0">
                <td className="px-3 py-2 text-gray-800">{doc.name}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{doc.kind ?? '—'}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{new Date(doc.uploadedAt).toLocaleDateString()}</td>
                <td className="px-3 py-2 text-right"><button onClick={() => download(doc.id)} className="text-gray-400 hover:text-blue-600" title="Download"><Download className="w-4 h-4" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <div className="p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
    </div>
  )
}
```

- [ ] **Step 3: Build + commit**

```
npx tsc --noEmit
npm run build
git add src/app/my-profile/
git commit -m "feat(my-profile): read-only self-service profile view with 4 tabs"
```

---

## Task 20: LicenseExpirationBanner + dashboard integration

**Files:**
- Create: `src/components/license-expiration-banner.tsx`
- Modify: `src/app/page.tsx` (dashboard)

- [ ] **Step 1: Create the banner component**

```tsx
"use client"

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { AlertCircle, X } from 'lucide-react'
import { fetchCurrentProfileBrowser, fetchAllProfilesBrowser } from '@/lib/supabase/profiles'
import { fetchAllLicenses, fetchUserLicenses, getLicenseAlertLevel, isBannerLevel, type AppraiserLicense } from '@/lib/supabase/appraiser-licenses'

/**
 * Dashboard banner shown when the current user has a license expiring soon
 * or expired, OR (for admins) when ANY user does. Dismissed via session key.
 * Cadence semantics: the banner is present whenever a license is in an
 * alerting window. No cron; just live evaluation.
 */
export function LicenseExpirationBanner() {
  const [licenses, setLicenses] = useState<AppraiserLicense[] | null>(null)
  const [nameById, setNameById] = useState<Map<string, string>>(new Map())
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const key = 'license-banner-dismissed'
    if (sessionStorage.getItem(key) === '1') setDismissed(true)

    fetchCurrentProfileBrowser().then(async profile => {
      if (!profile) return
      if (profile.role === 'admin') {
        const [all, allUsers] = await Promise.all([
          fetchAllLicenses(),
          fetchAllProfilesBrowser(),
        ])
        const m = new Map<string, string>()
        for (const p of allUsers) m.set(p.id, p.name || p.email)
        setNameById(m)
        setLicenses(all)
      } else {
        setLicenses(await fetchUserLicenses(profile.id))
      }
    })
  }, [])

  if (dismissed || !licenses) return null

  const alerting = licenses.filter(l => isBannerLevel(getLicenseAlertLevel(l.expirationDate)))
  if (alerting.length === 0) return null

  const dismiss = () => {
    sessionStorage.setItem('license-banner-dismissed', '1')
    setDismissed(true)
  }

  return (
    <div className="mb-4 p-3 rounded-lg border border-red-200 bg-red-50 flex items-start gap-3">
      <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-red-800">
          {alerting.length === 1 ? 'License alert' : `${alerting.length} license alerts`}
        </div>
        <ul className="text-xs text-red-700 mt-1 space-y-0.5">
          {alerting.slice(0, 4).map(l => {
            const name = nameById.get(l.userId)
            const level = getLicenseAlertLevel(l.expirationDate)
            const isExpired = level === 'expired'
            return (
              <li key={l.id}>
                {name ? <><Link href={`/admin/settings/users/${l.userId}`} className="underline">{name}</Link>: </> : null}
                {l.state} {l.licenseNumber} — {isExpired ? 'EXPIRED' : `expires ${l.expirationDate}`}
              </li>
            )
          })}
          {alerting.length > 4 && <li>…and {alerting.length - 4} more</li>}
        </ul>
      </div>
      <button onClick={dismiss} className="text-red-600 hover:text-red-800 shrink-0" title="Dismiss for this session"><X className="w-4 h-4" /></button>
    </div>
  )
}
```

- [ ] **Step 2: Mount the banner on the dashboard**

Open `src/app/page.tsx` and add the import:

```tsx
import { LicenseExpirationBanner } from '@/components/license-expiration-banner'
```

Find the top of the main content area (below `<AppHeader />`) and insert the banner as the first element inside the main content wrapper. Locate the existing `<main>` element and insert:

```tsx
        <LicenseExpirationBanner />
```

If the dashboard's structure is different, place it directly after the `<AppHeader />` inside the outermost content container.

- [ ] **Step 3: Build + commit**

```
npx tsc --noEmit
npm run build
git add src/components/license-expiration-banner.tsx src/app/page.tsx
git commit -m "feat(dashboard): license expiration banner (self + admin surfaces)"
```

---

## Task 21: Filter assignment pickers by `is_active`

**Files:**
- Modify: `src/components/claim/ClaimWorkspace.tsx` (reassign picker)
- Modify: `src/components/claim/messages-tab.tsx` (recipient picker)

- [ ] **Step 1: Filter reassign picker**

Open `src/components/claim/ClaimWorkspace.tsx`. Search for the place that loads the appraiser list for the reassign dropdown (grep for `fetchAllProfilesBrowser` or similar in this file). Wrap the returned list with a `.filter(p => p.isActive)` before it's stored in state. If the list includes admins (they can be assigned too), keep them regardless of `isActive` — filter only appraisers.

Concretely, find the pattern like:

```tsx
fetchAllProfilesBrowser().then(setAssignees)
```

Replace with:

```tsx
fetchAllProfilesBrowser().then(rows => setAssignees(rows.filter(p => p.isActive)))
```

If the file has multiple such places, apply to each one used for the reassign UI. Do NOT filter lists used to look up already-assigned users (those need historical names to render).

- [ ] **Step 2: Filter messages recipient picker**

Repeat the same filter in `src/components/claim/messages-tab.tsx` for the recipient selection dropdown.

- [ ] **Step 3: Type-check + commit**

```
npx tsc --noEmit
npm run build
git add src/components/claim/ClaimWorkspace.tsx src/components/claim/messages-tab.tsx
git commit -m "feat(pickers): filter reassign + recipient dropdowns by is_active"
```

---

## Task 22: Cleanup — delete Access + Automation, update SettingsNav, add My Profile nav link

**Files:**
- Delete: `src/app/admin/settings/access/` (folder)
- Delete: `src/app/admin/settings/automation/` (folder)
- Modify: `src/app/admin/settings/_settings-nav.tsx`
- Modify: `src/components/app-header.tsx`

- [ ] **Step 1: Delete the two folders**

```
rm -rf src/app/admin/settings/access
rm -rf src/app/admin/settings/automation
```

Also grep for any remaining imports referencing the deleted paths and fix them (there should be none if nothing else imports the client components):

```
grep -r "admin/settings/access" src/ || echo "no refs"
grep -r "admin/settings/automation" src/ || echo "no refs"
```

- [ ] **Step 2: Update SettingsNav — remove Access + Automation, add Fee Catalog**

Replace the `SECTIONS` array in `src/app/admin/settings/_settings-nav.tsx`:

```tsx
import { Users, Database, BookOpen, DollarSign } from 'lucide-react'

const SECTIONS = [
  { href: '/admin/settings/users',       label: 'Users',       Icon: Users },
  { href: '/admin/settings/fee-catalog', label: 'Fee Catalog', Icon: DollarSign },
  { href: '/admin/settings/guidelines',  label: 'Guidelines',  Icon: BookOpen },
  { href: '/admin/settings/data',        label: 'Data',        Icon: Database },
]
```

Remove the `Lock` and `Bot` imports since they're no longer used.

- [ ] **Step 3: Add "My Profile" link to the top nav**

Open `src/components/app-header.tsx`. Add a "My Profile" entry to the primary nav (visible to all authenticated users). Placement: after "Rules / Laws" or as a user-menu item — match the existing header's grouping. Concretely, find the array of nav items (usually a `NAV` const or the JSX list of `<Link>` elements) and add:

```tsx
        { href: '/my-profile', label: 'My Profile' },
```

If the header separates left-side nav from right-side user actions, place My Profile in the right group.

- [ ] **Step 4: Also remove the `SiteSettingsKey` type entries that were deleted**

Open `src/lib/supabase/site-settings.ts`. The current union type includes `'allow_regular_create_claims'` and `'auto_status_requests_enabled'`. Since the migration deletes those rows, and no consuming code should still call `fetchSiteSetting` with those keys, remove them from the union:

```ts
export type SiteSettingsKey = never   // no site-settings keys currently in use
```

If the whole file becomes unused, leave it — future work will likely add a new key. Grep to confirm no callers still reference the deleted keys:

```
grep -r "allow_regular_create_claims\|auto_status_requests_enabled" src/
```

Fix any hits found (they'll be in code we already removed from the access/automation pages plus one on the dashboard for the create-claims button visibility). Dashboard check: search `src/app/page.tsx` for `allow_regular_create_claims`. If found, the current logic is `canCreate = isAdmin || (globalAllow && profile.canCreateClaims)`. Replace with just `canCreate = isAdmin || profile.canCreateClaims`.

- [ ] **Step 5: Build + commit**

```
npx tsc --noEmit
npm run build
git add -A src/app/admin/settings/ src/components/app-header.tsx src/lib/supabase/site-settings.ts src/app/page.tsx
git commit -m "feat(cleanup): delete Access + Automation pages, add Fee Catalog + My Profile nav, drop site-wide permission toggles"
```

---

## Task 23: Final smoke + prod deploy

**Files:**
- No source changes; verify + deploy

- [ ] **Step 1: Final full build**

```
npx tsc --noEmit
npm run build
```

Expected: both clean.

- [ ] **Step 2: Capture current-live rollback URL**

```
npx vercel inspect modern-tools-rho.vercel.app --scope henry-as-projects-88caed67
```

Copy the current deploy URL — that's the rollback target if the new build breaks.

- [ ] **Step 3: Report the rollback command to Henry**

Post to Henry before the deploy finishes:

> Rollback if this breaks:
> ```
> npx vercel promote <captured-url> --scope henry-as-projects-88caed67 --yes
> ```

- [ ] **Step 4: Deploy**

```
npx vercel --prod --scope henry-as-projects-88caed67 --yes
```

- [ ] **Step 5: Verify alias flipped**

```
npx vercel inspect modern-tools-rho.vercel.app --scope henry-as-projects-88caed67
```

Confirm alias points to the new deploy id and status is `● Ready`.

- [ ] **Step 6: Manual prod smoke checklist**

Walk through in the live app:

1. Log in as admin. Open `Settings > Users`. Click a user's name → profile detail page renders with all 5 tabs.
2. Info tab: toggle Active off → save. Reload the users list — badge reads "Inactive".
3. Permissions tab: toggle `Create claims` off. Log out, log in as that user. Confirm the New Claim button is hidden. Toggle back on as admin.
4. Fees tab: enter amounts on 2 rows → save. Reload — amounts persist.
5. Licenses tab: add a license with expiration 5 days from today. Verify red badge on the row.
6. Go to `/` (dashboard). Verify red banner listing that user's license.
7. Go to `/admin/settings/users`. Verify red dot next to the user's name.
8. Log in as the appraiser. Open `/my-profile`. Verify Licenses tab shows the same license and the dashboard banner appears here too.
9. Documents tab (admin): upload a small PDF. Verify it appears. Click download — file opens.
10. Log in as the appraiser. Open `/my-profile` → Documents. Click download — same file opens.
11. Fee Catalog: add a new fee type "Test Fee" → save. Verify it appears in every user's Fees tab. Delete it → verify gone.
12. Try to delete a fee type that has amounts assigned → verify 409 error and instructions to archive.
13. Open a claim workspace. Open Reassign picker → verify the inactive user from step 2 is NOT in the list. Toggle them Active → verify they reappear.

- [ ] **Step 7: Update SESSIONS.md**

Prepend a new session entry to `docs/SESSIONS.md` per the CLAUDE.md workflow:

- Session title
- Worked on: summary
- Changed: files touched (list the ~15 new files + modified list)
- Deploy status: new deploy id + rollback URL
- Migrations run this session: appraiser-profiles migration + storage bucket
- In progress / broken / unknowns: anything the smoke turned up
- Next: punch list carryover

- [ ] **Step 8: Commit SESSIONS.md**

```
git add docs/SESSIONS.md
git commit -m "SESSIONS: append 2026-08-29 session (appraiser profiles ship)"
```

---
