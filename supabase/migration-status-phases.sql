-- =========================================================================
-- Modern Tools — Status Phases migration (2026-08-29)
-- Run in the Supabase SQL Editor (Dashboard -> SQL Editor).
--
-- Adds:
--   * status_phase (text, nullable) + status_phase_set_at (timestamptz)
--     columns on acv_history. One phase per claim; set/change resets the
--     timestamp; clearing nulls both.
--   * status_phase_configs table: the config-driven list of possible
--     phases. Admin-editable so future phases don't need a code change.
--     Seeded with pending_payment / rush / umpire.
-- =========================================================================

-- 1. acv_history columns
alter table public.acv_history
  add column if not exists status_phase text,
  add column if not exists status_phase_set_at timestamptz;

create index if not exists acv_history_status_phase_idx
  on public.acv_history(status_phase)
  where status_phase is not null;

-- 2. status_phase_configs table
create table if not exists public.status_phase_configs (
  code text primary key,          -- e.g. 'pending_payment'
  label text not null,            -- e.g. 'Pending Payment'
  color text not null,            -- CSS color hint: 'green' | 'red' | 'amber' | 'blue' | 'gray'
  sort_order int not null default 0,
  archived boolean not null default false,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.status_phase_configs enable row level security;

drop policy if exists "Authenticated read status_phase_configs" on public.status_phase_configs;
create policy "Authenticated read status_phase_configs"
  on public.status_phase_configs for select
  using (auth.role() = 'authenticated');

drop policy if exists "Admin write status_phase_configs" on public.status_phase_configs;
create policy "Admin write status_phase_configs"
  on public.status_phase_configs for all
  using (public.is_admin())
  with check (public.is_admin());

-- 3. Seed the three initial phases. Upserts on code so re-running is safe.
insert into public.status_phase_configs (code, label, color, sort_order) values
  ('pending_payment', 'Pending Payment', 'green', 1),
  ('rush',            'Rush',            'red',   2),
  ('umpire',          'Umpire',          'red',   3)
on conflict (code) do update set
  label = excluded.label,
  color = excluded.color,
  sort_order = excluded.sort_order;

-- 4. Verification
select 'acv_history.status_phase' as label,
       count(*) filter (where column_name = 'status_phase')::int as value
  from information_schema.columns
  where table_schema = 'public' and table_name = 'acv_history'
union all select 'acv_history.status_phase_set_at',
       count(*) filter (where column_name = 'status_phase_set_at')::int
  from information_schema.columns
  where table_schema = 'public' and table_name = 'acv_history'
union all select 'status_phase_configs rows',
       count(*)::int from public.status_phase_configs;
