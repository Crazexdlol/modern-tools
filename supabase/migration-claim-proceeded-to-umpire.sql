-- Migration: claim-level "proceeded to umpire" tracking (Henry 2026-10-15).
-- Adds two durable booleans so Settlement Analytics can filter umpire claims
-- out of its KPIs, and so terminology in the UI can swap "Award Amount" to
-- "Umpire Ruling Award" on umpire claims.
-- Rollback: migration-claim-proceeded-to-umpire-rollback.sql

alter table public.acv_history
  add column if not exists proceeded_to_umpire boolean not null default false,
  add column if not exists umpire_agreement    boolean not null default true;

-- Backfill: any claim currently phased umpire or court_umpire proceeded to
-- umpire. Court-appointed umpire implies the parties disagreed on the
-- umpire pick, so umpire_agreement = false there; plain umpire = true.
update public.acv_history
   set proceeded_to_umpire = true,
       umpire_agreement    = (status_phase = 'umpire')
 where status_phase in ('umpire', 'court_umpire');

-- Partial index for the Settlement Analytics filter — tiny table so this is
-- borderline overkill, but keeps the "exclude umpire" filter from a seq scan
-- as the claim count grows.
create index if not exists acv_history_proceeded_to_umpire_idx
  on public.acv_history (proceeded_to_umpire)
  where proceeded_to_umpire = true;

-- Verification
select 'proceeded_to_umpire=true' as label, count(*)::int as value from public.acv_history where proceeded_to_umpire = true
union all
select 'phased umpire',       count(*)::int from public.acv_history where status_phase = 'umpire'
union all
select 'phased court_umpire', count(*)::int from public.acv_history where status_phase = 'court_umpire';
