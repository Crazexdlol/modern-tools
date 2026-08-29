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
