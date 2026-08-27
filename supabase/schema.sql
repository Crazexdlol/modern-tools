-- ============================================================
-- Modern Tools — Supabase Schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- 1. ACV History table
create table acv_history (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz default now() not null,
  date text not null,
  mode text not null,
  vehicle text not null,
  vin text,
  ma_number text,
  acv numeric,
  claim jsonb not null default '{}',
  comps jsonb not null default '[]',
  adjustments jsonb not null default '{}',
  result jsonb not null default '{}',
  mileage_rate numeric default 0,
  reports_state jsonb
);

-- Migration for existing databases (safe to re-run):
alter table acv_history add column if not exists reports_state jsonb;

-- 2. Estimate History table
create table estimate_history (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz default now() not null,
  date text not null,
  vehicle jsonb not null default '{}',
  software_a text,
  software_b text,
  file_name_a text,
  file_name_b text,
  grand_total_a numeric default 0,
  grand_total_b numeric default 0,
  total_difference numeric default 0,
  result jsonb not null default '{}',
  claim jsonb default '{}'
);

-- 3. Row Level Security
alter table acv_history enable row level security;
alter table estimate_history enable row level security;

-- Users can only see their own rows
create policy "Users see own acv_history"
  on acv_history for select
  using (auth.uid() = user_id);

create policy "Users insert own acv_history"
  on acv_history for insert
  with check (auth.uid() = user_id);

create policy "Users update own acv_history"
  on acv_history for update
  using (auth.uid() = user_id);

create policy "Users delete own acv_history"
  on acv_history for delete
  using (auth.uid() = user_id);

create policy "Users see own estimate_history"
  on estimate_history for select
  using (auth.uid() = user_id);

create policy "Users insert own estimate_history"
  on estimate_history for insert
  with check (auth.uid() = user_id);

create policy "Users update own estimate_history"
  on estimate_history for update
  using (auth.uid() = user_id);

create policy "Users delete own estimate_history"
  on estimate_history for delete
  using (auth.uid() = user_id);

-- 4. Indexes for fast queries
create index acv_history_user_id_idx on acv_history(user_id);
create index acv_history_date_idx on acv_history(user_id, date desc);
create index estimate_history_user_id_idx on estimate_history(user_id);
create index estimate_history_date_idx on estimate_history(user_id, date desc);

-- ============================================================
-- 5. Summaries (shared across all authenticated users)
-- ============================================================
create table summaries (
  id text primary key,
  created_by uuid references auth.users(id) on delete set null,
  creator_email text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  data jsonb not null default '{}'
);

alter table summaries enable row level security;

-- Anyone signed in can see every summary (team dashboard)
create policy "Authenticated users can view all summaries"
  on summaries for select
  using (auth.role() = 'authenticated');

-- Insert only with your own user id stamped as created_by
create policy "Authenticated users can insert summaries"
  on summaries for insert
  with check (auth.uid() = created_by);

-- Anyone signed in can update (collaborative editing)
create policy "Authenticated users can update summaries"
  on summaries for update
  using (auth.role() = 'authenticated');

-- Only the creator can delete their own summary
create policy "Creator can delete own summary"
  on summaries for delete
  using (auth.uid() = created_by);

create index summaries_updated_at_idx on summaries(updated_at desc);
create index summaries_created_by_idx on summaries(created_by);

-- ============================================================
-- 6. Claims restructure (2026-07-18) — see supabase-migration-claims.sql
--    Status column + per-claim estimate/auction data + team-wide RLS.
--    (acv_history select/update/delete became authenticated-wide;
--    the four per-user policies above were dropped.)
-- ============================================================
alter table acv_history add column if not exists status text not null default 'open';
alter table acv_history add column if not exists estimate jsonb;
alter table acv_history add column if not exists auction_listings jsonb;
create index if not exists acv_history_status_idx on acv_history(status);

drop policy if exists "Users see own acv_history"    on acv_history;
drop policy if exists "Users insert own acv_history" on acv_history;
drop policy if exists "Users update own acv_history" on acv_history;
drop policy if exists "Users delete own acv_history" on acv_history;

create policy "Authenticated users can view all acv_history"
  on acv_history for select using (auth.role() = 'authenticated');
create policy "Authenticated users can insert acv_history"
  on acv_history for insert with check (auth.uid() = user_id);
create policy "Authenticated users can update acv_history"
  on acv_history for update using (auth.role() = 'authenticated');
create policy "Authenticated users can delete acv_history"
  on acv_history for delete using (auth.role() = 'authenticated');
