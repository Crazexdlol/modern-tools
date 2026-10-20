-- Rollback for migration-cycle-times-reset-and-pauses.sql.
-- Removes the two new triggers + columns. Does NOT restore wiped ledger
-- rows (truncate is irreversible). After rollback, cycle-time behavior
-- reverts to pre-2026-10-12: lazy backfill in stage-events.ts repopulates
-- old-claim time onto current assignees on next touch.

drop trigger if exists open_initial_stage_event_trigger on public.acv_history;
drop function if exists public.open_initial_stage_event();

drop trigger if exists set_cycle_tracked_from_trigger on public.acv_history;
drop function if exists public.set_cycle_tracked_from();

alter table public.acv_history drop column if exists cycle_tracked_from;
alter table public.status_phase_configs drop column if exists pauses_cycle_time;
