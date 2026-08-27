-- ============================================================
-- Modern Tools — Claims Restructure Migration (2026-07-18)
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor).
-- Safe to re-run. Must be run BEFORE deploying the claim-centric
-- redesign (Phase 1+).
-- ============================================================

-- 1) New columns on acv_history
--    status: 'open' | 'closed' — drives the Open/Closed dashboards
--    estimate: per-claim Estimate Dispute result (replaces estimate_history for new work)
--    auction_listings: Loss Search results (previously never persisted)
alter table acv_history add column if not exists status text not null default 'open';
alter table acv_history add column if not exists estimate jsonb;
alter table acv_history add column if not exists auction_listings jsonb;
create index if not exists acv_history_status_idx on acv_history(status);

-- 2) Team-wide sharing: replace per-user RLS with authenticated-wide
--    (mirrors the existing `summaries` table pattern; user_id is kept
--    for attribution only). Delete is deliberately team-wide so the
--    dashboard delete button works on teammates' claims.
drop policy if exists "Users see own acv_history"    on acv_history;
drop policy if exists "Users insert own acv_history" on acv_history;
drop policy if exists "Users update own acv_history" on acv_history;
drop policy if exists "Users delete own acv_history" on acv_history;

create policy "Authenticated users can view all acv_history"
  on acv_history for select
  using (auth.role() = 'authenticated');

create policy "Authenticated users can insert acv_history"
  on acv_history for insert
  with check (auth.uid() = user_id);

create policy "Authenticated users can update acv_history"
  on acv_history for update
  using (auth.role() = 'authenticated');

create policy "Authenticated users can delete acv_history"
  on acv_history for delete
  using (auth.role() = 'authenticated');

-- 3) Verification (run after):
--   select status, count(*) from acv_history group by 1;   -- expect all 'open'
--   Log in as each user → every claim should be visible to everyone.

-- NOTE (no action needed now): acv_history.user_id references
-- auth.users ON DELETE CASCADE. Never delete a team member's auth
-- user without reassigning their rows first, or their claims vanish.
