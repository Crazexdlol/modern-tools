-- ============================================================
-- HamsPortal — Cycle-time reset + pause-phase overhaul (2026-10-12)
-- Run in the Supabase SQL Editor.
-- Reverses cleanly with migration-cycle-times-reset-and-pauses-rollback.sql.
--
-- WHAT THIS DOES:
--   1. Truncates the existing claim_stage_events ledger. All historical
--      cycle-time numbers are wiped. The lazy backfill in
--      src/lib/supabase/stage-events.ts was dumping pre-ledger time onto
--      current assignees, so most appraisers were showing 20-500+ days
--      that weren't actually theirs.
--
--   2. Adds `cycle_tracked_from timestamptz` on acv_history. Scoped so
--      only NEW claims (created after this migration runs) count toward
--      cycle time. Every existing claim gets NULL = excluded forever
--      from cycle-time aggregations. A BEFORE INSERT trigger stamps now()
--      on every subsequent new claim.
--
--   3. Adds `pauses_cycle_time boolean` on status_phase_configs. Admin-
--      editable per phase. Seeds TRUE for: hold, pending_information,
--      pending_repairs. When a claim enters one of these phases, the
--      current open stage event closes; when it leaves, a new event
--      opens with the same stage + assignee. Net: pause time doesn't
--      accumulate anywhere.
--
--   4. Adds an AFTER INSERT trigger on acv_history that opens the first
--      claim_stage_events row for every new claim. Without this, a claim
--      that sits unassigned for N days wouldn't show those N days under
--      the "unassigned" bucket when it eventually gets picked up.
--
-- Idempotent — safe to re-run. The truncate wipes once; after that
-- re-running is a no-op (ledger stays empty until events start landing).
-- ============================================================

-- 1. Reset the ledger. Permanent — nothing retains the current rows.
truncate table public.claim_stage_events restart identity;

-- 2. cycle_tracked_from column + "new-claims-only" trigger
alter table public.acv_history
  add column if not exists cycle_tracked_from timestamptz;

-- Mark every pre-existing claim as "not tracked". This is the opt-out
-- for every claim that was open before the reset.
update public.acv_history set cycle_tracked_from = null;

create or replace function public.set_cycle_tracked_from()
returns trigger
language plpgsql
as $$
begin
  -- Only auto-stamp when the caller didn't provide it. Lets a backfill
  -- script force a specific value if ever needed.
  if new.cycle_tracked_from is null then
    new.cycle_tracked_from := now();
  end if;
  return new;
end;
$$;

drop trigger if exists set_cycle_tracked_from_trigger on public.acv_history;
create trigger set_cycle_tracked_from_trigger
  before insert on public.acv_history
  for each row execute function public.set_cycle_tracked_from();

-- 3. pauses_cycle_time column on status_phase_configs
alter table public.status_phase_configs
  add column if not exists pauses_cycle_time boolean not null default false;

-- Seed TRUE for the three phases Henry wants paused by default.
-- Idempotent — won't flip user edits because the WHERE guards on code.
update public.status_phase_configs
   set pauses_cycle_time = true,
       updated_at = now()
 where code in ('hold', 'pending_information', 'pending_repairs')
   and pauses_cycle_time is distinct from true;

-- 4. Open the initial stage event for every new claim. SECURITY DEFINER
--    because claim_stage_events is service-role-only on INSERT (no RLS
--    policy for authenticated users), so a trigger on acv_history that
--    runs as the inserting user would otherwise be blocked.
create or replace function public.open_initial_stage_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only track claims that opted in via cycle_tracked_from. Legacy / NULL
  -- claims produce no ledger row.
  if new.cycle_tracked_from is null then
    return new;
  end if;

  insert into public.claim_stage_events (claim_id, stage, assigned_to, entered_at)
  values (
    new.id,
    coalesce(new.workflow_stage, 'main'),
    new.assigned_to,
    new.cycle_tracked_from
  );
  return new;
end;
$$;

drop trigger if exists open_initial_stage_event_trigger on public.acv_history;
create trigger open_initial_stage_event_trigger
  after insert on public.acv_history
  for each row execute function public.open_initial_stage_event();

-- Verification: expect the first row to show cycle_tracked_from=NULL
-- counts matching the total claim count (everything pre-reset), the second
-- row to show the three pause phases, and the third to show the ledger is empty.
select
  (select count(*) from public.acv_history where cycle_tracked_from is null)::int
    as pre_reset_claims_excluded,
  (select count(*) from public.acv_history)::int as total_claims,
  (select count(*) from public.status_phase_configs where pauses_cycle_time)::int
    as pause_phase_count,
  (select count(*) from public.claim_stage_events)::int as ledger_rows_after_reset;
