# Appraiser Profiles — Design

**Date:** 2026-08-29
**Status:** Ready for implementation planning
**Author:** Claude (with Henry)

## Summary

Give every appraiser and admin a full profile page with tabs for **Information**, **Permissions**, **Fees**, **Licenses**, and **Documents**. Consolidate all per-user permission toggles into the profile, delete the site-wide master toggles they replaced, and add a self-service **My Profile** view for non-admins. Add a shared editable **fee catalog** so per-user fee amounts can be tracked against a stable list of ~43 fee types.

## Goals

- Single source of truth per appraiser: contact info, active status, permissions, per-service fees, state licenses (with expiration tracking), and uploaded documents (W9, license scans, etc.)
- Admins manage the entire profile; appraisers get a read-only self-service view
- Kill scattered per-user admin surfaces (Access page, Automation page) — replace with one profile page
- Kill site-wide permission master toggles — after migration, permissions are 100% per-user
- Track license expirations with escalating in-app alerts, no email dependency (SMTP is parked)

## Non-goals

- Email notifications for expiring licenses (parked pending SMTP creds — the design supports adding this later without schema changes)
- Any change to claim-level workflow beyond filtering the assignment picker by `is_active`
- Bulk import of appraisers or fee schedules
- History/audit log of profile edits (out of scope for v1)

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Entry point | `Settings > Users` list — click a name to open the profile detail page |
| Self-service surface | New `/my-profile` page, read-only, visible to everyone |
| Fees storage | Site-wide `fee_catalog` table (admin-editable) + per-user `appraiser_fees` amounts |
| Fee units | All flat `$` except **Mileage** which is `$/mile` |
| Documents storage | New Supabase Storage bucket `appraiser-documents`, admin write / self read |
| Permissions | All per-user toggles move to the profile's Permissions tab. Site-wide master toggles are deleted. |
| Old admin pages | `/admin/settings/access` and `/admin/settings/automation` deleted entirely (nav + code) |
| Active flag | Soft off-boarding: hides from assignment/reassign picker; login and claim history preserved |
| Tabs | 5 for admin view (Information / Permissions / Fees / Licenses / Documents); 4 for self view (drop Permissions) |
| Fee catalog editing | All admins can add / rename / archive fee types |
| License alert cadence | Computed live from `expiration_date`; badge on Licenses tab always visible when close; dashboard banner for admin (any user) and self (own licenses); no cron |
| Alert channel | In-app only; email deferred |

## Data model

Four new tables plus columns on `profiles`. Relational, not jsonb — because we need indexed date queries for license expirations, and the fee catalog is a shared editable entity rather than per-user content.

```sql
-- profiles: identity + address + active flag
alter table profiles
  add column phone text,
  add column address_street text,
  add column address_city text,
  add column address_state text,
  add column address_zip text,
  add column is_active boolean not null default true;

-- Fee catalog: site-wide, admin-editable
create table fee_catalog (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,          -- e.g. 'full_appraisal'
  label text not null,                -- e.g. 'Full Appraisal Fee'
  unit text not null default 'flat',  -- 'flat' | 'per_mile'
  sort_order int not null default 0,
  archived boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Per-user fee amounts
create table appraiser_fees (
  user_id uuid references profiles(id) on delete cascade,
  fee_id uuid references fee_catalog(id) on delete cascade,
  amount numeric,                     -- null = "not set"
  updated_at timestamptz default now(),
  primary key (user_id, fee_id)
);

-- Licenses (multiple per user)
create table appraiser_licenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  state text not null,                -- 2-char code
  license_number text not null,
  expiration_date date not null,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index appraiser_licenses_expiration_idx on appraiser_licenses(expiration_date);
create index appraiser_licenses_user_idx on appraiser_licenses(user_id);

-- Document metadata (files live in the appraiser-documents storage bucket)
create table appraiser_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  name text not null,                 -- display name
  kind text,                          -- 'W9' | 'License' | 'Contract' | 'Insurance' | 'Other'
  storage_path text not null,         -- appraiser-documents/{user_id}/{uuid}-{name}
  size_bytes int,
  content_type text,
  uploaded_by uuid references profiles(id) on delete set null,
  uploaded_at timestamptz default now()
);
create index appraiser_documents_user_idx on appraiser_documents(user_id);
```

### RLS

- `fee_catalog`: authenticated read; admin write
- `appraiser_fees`: authenticated read (users see own; admins see all); admin write
- `appraiser_licenses`: authenticated read own; admin read/write all; user can read own
- `appraiser_documents`: same as licenses — self read, admin all

### Storage bucket

Private bucket `appraiser-documents`. Path convention `{user_id}/{doc_uuid}-{original_filename}`.

Policies:
- SELECT: file's `{user_id}` prefix matches `auth.uid()`, OR requester is admin
- INSERT / UPDATE / DELETE: admin only (documents are added on behalf of the user; self-serve upload is out of scope for v1)

### Migration behavior

Single migration file (`supabase/migration-appraiser-profiles.sql`) plus its rollback. Migration performs, in order:

1. `alter table profiles` — add the 6 new columns
2. `create table fee_catalog` + seed 43 fee-type rows with `sort_order` matching Henry's provided order
3. `create table appraiser_fees`, `appraiser_licenses`, `appraiser_documents` + indexes
4. Create the `appraiser-documents` storage bucket via Supabase dashboard (documented in the migration file as a manual step — Supabase storage buckets aren't created via SQL)
5. Backfill per-user permissions from site-wide toggles:
   - Read current `site_settings.allow_regular_create_claims`
   - Read current `site_settings.auto_status_requests_enabled` (if it exists as a global)
   - For every `profiles` row: set `can_create_claims = coalesce(can_create_claims, current_allow_regular_create_claims)` and similar for auto status
6. Drop the two `site_settings` rows (or leave them and just stop reading them — pick during implementation depending on how site-settings is structured)
7. Add all applicable RLS policies

Rollback file reverses steps in inverse order and restores the site-settings rows to their pre-migration values (captured in a comment at the top of the rollback file — Henry copy-pastes the actual values he saw before running the up migration).

### Seed data — 43 fee types

```
1.  full_appraisal              Full Appraisal Fee                 flat
2.  photos_only                 Photos Only Fee                    flat
3.  time_expense                Time & Expense Fee                 flat
4.  scene_diagram               Scene Diagram Fee                  flat
5.  motorcycle                  Motorcycle Fee                     flat
6.  doi                         DOI Fee                            flat
7.  mileage                     Mileage                            per_mile
8.  total_loss                  Total Loss                         flat
9.  remote                      Remote Fee                         flat
10. supplement                  Supplement                         flat
11. broken_app                  Broken App                         flat
12. tolls                       Tolls                              flat
13. salvage_bids                Salvage Bids                       flat
14. glass_claim                 Glass Claim                        flat
15. windshield_claim            Windshield Claim                   flat
16. closed                      Closed                             flat
17. no_show                     No Show                            flat
18. property                    Property                           flat
19. heavy_equipment             Heavy Equipment                    flat
20. software                    Software                           flat
21. utility_trailer_flat        Utility Trailer Flat Fee           flat
22. rush_assignment             Rush Assignment                    flat
23. rv_flat                     RV Flat Fee                        flat
24. fuel_sample                 Fuel Sample                        flat
25. late_fee_over_90            Late Fee Over 90                   flat
26. drive_time                  Drive Time                         flat
27. exotic_vehicle              Exotic Vehicle                     flat
28. subrogation                 Subrogation                        flat
29. daily_cat                   Daily CAT                          flat
30. desk_review                 Desk Review                        flat
31. drive_in                    Drive In                           flat
32. rekey                       Re-Key                             flat
33. hourly_rate                 Hourly Rate                        flat
34. specialty                   Specialty                          flat
35. diminished_value            Diminished Value                   flat
36. fuel_surcharge              Fuel Surcharge                     flat
37. mechanical_breakdown        Mechanical Breakdown               flat
38. condition_fee               Condition Fee                      flat
39. misc                        Misc                               flat
40. auto_scope_photos           Auto Scope and Photos              flat
41. desk_supplement             Desk Supplement                    flat
42. heavy_equip_scope_photos    Heavy Equipment Scope and Photos   flat
43. auto_full_physical          Auto Full Appraisal — Physical Inspection  flat
```

## Routes & pages

### New

| Route | Access | Purpose |
|---|---|---|
| `/my-profile` | Any authenticated user | Read-only self view: Information / Fees / Licenses / Documents (4 tabs, no Permissions) |
| `/admin/settings/users/[id]` | Admin only | Full editable profile — 5 tabs |
| `/admin/settings/fee-catalog` | Admin only | Manage the fee catalog (add / rename / reorder / archive) |

### Deleted

- `/admin/settings/access` — folder deleted, nav removed
- `/admin/settings/automation` (if it existed as a per-user page) — folder deleted, nav removed
  - Confirm during implementation whether Automation had non-permission content that needs relocation

### Extended

- `/admin/settings/users` (existing list):
  - Name column becomes a link to `/admin/settings/users/[id]`
  - Add `Active` badge column
  - Add license-expiration indicator (red dot next to name when any of that user's licenses are in `warning` / `urgent` / `expired` state)

## Permissions consolidation

The four per-user toggles are the only source of truth after migration:

| Field | Meaning |
|---|---|
| `can_create_claims` | Appraiser can create new claims |
| `can_reassign_claims` | Appraiser can reassign claims to other appraisers |
| `can_edit_claim_info` | Appraiser can edit Claim Info after creation |
| `auto_status_requests_enabled` | This appraiser receives auto status-request messages |

`auto_status_requests_enabled` replaces the current `auto_status_requests_override` (which was nullable and inherited from a global). New column is `not null default false`. Migration backfills as described above.

## Component structure

```
src/app/
  my-profile/
    page.tsx                              server component, auth-gated
    my-profile-client.tsx                 read-only tab shell
  admin/settings/
    fee-catalog/
      page.tsx
      fee-catalog-client.tsx
    users/
      [id]/
        page.tsx                          server component, admin-gated
        profile-detail-client.tsx         tab shell + tab router
        _tabs/
          info-tab.tsx
          permissions-tab.tsx
          fees-tab.tsx
          licenses-tab.tsx
          documents-tab.tsx
      page.tsx                            extend existing list

src/lib/supabase/
  appraiser-profile.ts                    fetch/save extended profile fields
  fee-catalog.ts                          catalog CRUD
  appraiser-fees.ts                       per-user fee amount CRUD
  appraiser-licenses.ts                   license CRUD + getLicenseAlertLevel()
  appraiser-documents.ts                  doc metadata + storage helpers

src/components/
  license-expiration-banner.tsx           dashboard banner
```

Reuse the existing `Popover + Command` picker pattern (added in the 2026-08-27 session) wherever we need a filterable dropdown.

## API routes

| Route | Access | Purpose |
|---|---|---|
| `PATCH /api/admin/users/[id]` (extend existing) | Admin | Accept new profile fields (phone, address_*, is_active) |
| `POST /api/admin/fee-catalog` | Admin | Create fee type |
| `PATCH /api/admin/fee-catalog/[id]` | Admin | Rename / reorder / archive |
| `DELETE /api/admin/fee-catalog/[id]` | Admin | Delete (only if no `appraiser_fees` reference it; else archive) |
| `POST /api/admin/appraiser-fees` | Admin | Bulk upsert `{user_id, fee_id, amount}` rows |
| `POST /api/admin/appraiser-licenses` | Admin | Create |
| `PATCH /api/admin/appraiser-licenses/[id]` | Admin | Update |
| `DELETE /api/admin/appraiser-licenses/[id]` | Admin | Delete |
| `POST /api/admin/appraiser-documents/upload` | Admin | Multipart upload; writes to storage + metadata row |
| `DELETE /api/admin/appraiser-documents/[id]` | Admin | Delete storage object + row |
| `GET /api/appraiser-documents/[id]/download` | Self or admin | Return signed URL |

All admin routes use the existing admin-check helper.

## Fees tab UI

Two-column table sorted by `fee_catalog.sort_order`:

```
| Fee                           | Amount ($)    |
|-------------------------------|---------------|
| Full Appraisal Fee            | [175.00]      |
| Photos Only Fee               | [85.00]       |
| Mileage ($/mile)              | [0.67]        |
| Time & Expense Fee            | [        ]    |
| ... (43 rows)                                  |
```

- Rows: `fee_catalog where archived = false`, sorted by `sort_order`
- Unit displayed inline in the label column (only "Mileage ($/mile)" gets the suffix in v1)
- Amount blank = no `appraiser_fees` row or `amount is null` (renders empty on invoices)
- Debounced auto-save on blur (2s debounce, matching existing claim workspace pattern)

## Licenses tab UI

```
[ + Add License ]

| State | License #     | Expires    | Status         |
|-------|---------------|------------|----------------|
| FL    | A12345678     | 2026-11-15 | [22d]  amber   |
| GA    | GA-987654     | 2027-04-01 |                |
| SC    | SC-P-11223    | 2025-12-01 | EXPIRED red    |
```

- Inline add/edit; delete via row X
- Status computed live via `getLicenseAlertLevel(expiration_date, today)`
- State is a 2-char text input (v1); could become a dropdown later
- `expiration_date` uses a native date picker

## Documents tab UI

```
[ + Upload Document ]

| Name           | Kind    | Uploaded     |            |
|----------------|---------|--------------|------------|
| W9.pdf         | W9      | 2026-08-29   | [↓] [🗑]   |
| FL-license.pdf | License | 2026-08-29   | [↓] [🗑]   |
```

- Upload: multipart POST → server writes to storage + inserts metadata row
- Kind: free-form text with a datalist suggesting `W9 / License / Contract / Insurance / Other`
- Download: server issues signed URL (60s expiry), client redirects
- Delete: server removes storage object + row

## License expiration alerts

**Single utility** `getLicenseAlertLevel(expiration_date, today: Date) → 'none' | 'notice' | 'warning' | 'urgent' | 'expired'`:

| Days until expiration | Level |
|---|---|
| > 90 | `none` |
| 31–90 | `notice` |
| 8–30 | `warning` |
| 1–7 | `urgent` |
| ≤ 0 | `expired` |

**Where the levels surface:**

| Surface | Trigger |
|---|---|
| Row status badge on the Licenses tab | any level except `none` |
| Red dot next to name in Users table | `warning` / `urgent` / `expired` |
| Dashboard banner (self) | current user has any own license at `warning` / `urgent` / `expired` |
| Dashboard banner (admin) | any user has a license at `warning` / `urgent` / `expired` |

**Cadence semantics:** the banner is always present while a license is in an alert state. There is no scheduled job, no per-day trigger, no dismissal state stored server-side. Session-only dismiss (a small "X" on the banner that hides it for the current session). Next login = it's back. This is a clean interpretation of "reminds every day near expiration, then every week after expiration" — the banner never stops showing until the license is updated.

## Assignment picker changes

Every place that lists appraisers for assignment or reassignment (`ClaimWorkspace` reassign dropdown, `messages-tab` recipient picker, any other picker) filters `where is_active = true`.

Historical assignments to now-inactive users still render their name (name is fetched via `profiles` join, not filtered) — you just can't select an inactive user for new work. This preserves existing claim data without ceremony.

## Testing & verification

- `npx tsc --noEmit` clean
- `npm run build` clean
- Manual prod smoke:
  1. Open `/admin/settings/users`, click a name, verify all 5 tabs render
  2. Toggle a permission, verify it takes effect (e.g., toggle `can_create_claims` off, log in as that user, verify New Claim button hidden)
  3. Add a license with expiration in 5 days, verify red dot in Users table, red banner on dashboard
  4. Add a license with expiration 100 days out, verify no badge
  5. Set a user Inactive, open a claim, verify their name is not in the reassign picker
  6. Upload a W9 as admin, log in as that appraiser, verify `/my-profile` shows the file with download button
  7. Add a new fee type in the catalog, verify it appears in every user's Fees tab
  8. Archive a fee type, verify it stops appearing but existing per-user amounts are preserved

## Rollout

Standard: run migration in Supabase SQL editor → `vercel --prod` → verify alias → capture rollback URL.

If the migration goes wrong (e.g., permission backfill produces unexpected values), rollback SQL restores the two site-settings rows and drops the new tables/columns. The Vercel rollback URL reverts the app to the pre-appraiser-profiles UI.

## Open items to resolve during implementation

- Confirm whether `/admin/settings/automation` has non-permission content that needs a new home before its folder is deleted
- Confirm the exact key names of the site-settings rows to be dropped (`allow_regular_create_claims` is known; the auto-status one needs a quick grep)
- Decide on the 2-char state input vs full dropdown when building the Licenses tab (dropdown is nicer but adds a static state list)
- Decide UX for "clear a fee amount" — is a blank input treated as "unset", or do we need an explicit clear button? (Recommended: blank = unset)
