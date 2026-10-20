-- Cycle-time event ledger. One row per (claim, stage, assignee) span.
-- When a claim moves stages OR gets reassigned, the API closes the current
-- open event (sets exited_at) and inserts a new one.
--
-- Aggregations:
--   per-claim total time   = sum(exited_at - entered_at) across stages {main,qc,billing,delivery}
--   per-stage avg          = avg(duration) grouped by stage
--   per-appraiser total    = sum(duration) grouped by assigned_to
--   payment stage          = aggregated separately, not counted in per-claim total
--
-- Scale: ~7 events per claim lifecycle × 390 live claims × ~100/mo growth
--        → tens of KB per year. Safe.

create table if not exists public.claim_stage_events (
  id          bigserial primary key,
  claim_id    text not null references public.acv_history(id) on delete cascade,
  stage       text not null check (stage in ('main','qc','billing','delivery','payment')),
  assigned_to uuid null references public.profiles(id) on delete set null,
  entered_at  timestamptz not null default now(),
  exited_at   timestamptz null,
  created_at  timestamptz not null default now()
);

-- Hot paths: lookup-by-claim (claim detail view), lookup-by-user (appraiser
-- leaderboard), and "find the currently-open event" (every write path).
create index if not exists claim_stage_events_claim_idx    on public.claim_stage_events (claim_id);
create index if not exists claim_stage_events_user_idx     on public.claim_stage_events (assigned_to) where assigned_to is not null;
create index if not exists claim_stage_events_open_idx     on public.claim_stage_events (claim_id) where exited_at is null;
create index if not exists claim_stage_events_stage_idx    on public.claim_stage_events (stage, exited_at);

alter table public.claim_stage_events enable row level security;

-- All authenticated users can read (aggregations exposed via admin UI only,
-- but RLS stays open-read for internal queries and future features).
drop policy if exists cse_read on public.claim_stage_events;
create policy cse_read on public.claim_stage_events
  for select to authenticated using (true);

-- Writes only via service-role (API routes). No INSERT/UPDATE/DELETE policies
-- means authenticated users cannot mutate directly.
