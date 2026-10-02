-- =========================================================================
-- HamsPortal — Workflow dashboards (2026-10-02)
--
-- Adds a 5-stage lifecycle (Main → QC → Billing → Delivery → Payment) as
-- top-level dashboard tabs on the dashboard page. Each stage is scoped to
-- a per-user access list; appraisers see only assigned tabs, admins see
-- their assigned ones primarily with the rest dimmed/accessible as fallback.
--
-- Idempotent. Reverses cleanly via -rollback.sql.
-- =========================================================================

-- 1. workflow_stage column on acv_history. Defaults to 'main' so every
--    existing claim lands in the Main tab unless explicitly promoted below.
alter table public.acv_history
  add column if not exists workflow_stage text not null default 'main',
  add column if not exists workflow_stage_set_at timestamptz;

-- Add the CHECK constraint separately so we can drop it idempotently in
-- the rollback. CREATE OR REPLACE isn't a thing for constraints.
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'acv_history_workflow_stage_check'
  ) then
    alter table public.acv_history
      add constraint acv_history_workflow_stage_check
      check (workflow_stage in ('main','qc','billing','delivery','payment'));
  end if;
end $$;

-- Partial index — closed claims don't surface on workflow dashboards.
create index if not exists acv_history_workflow_stage_idx
  on public.acv_history (workflow_stage)
  where status <> 'closed';

-- 2. dashboard_configs — static enumeration mirroring status_phase_configs.
create table if not exists public.dashboard_configs (
  code         text primary key check (code in ('main','qc','billing','delivery','payment')),
  label        text not null,
  color        text not null,
  sort_order   int  not null,
  description  text null
);

alter table public.dashboard_configs enable row level security;

drop policy if exists "Authenticated read dashboard_configs" on public.dashboard_configs;
create policy "Authenticated read dashboard_configs"
  on public.dashboard_configs for select to authenticated using (true);

drop policy if exists "Admin write dashboard_configs" on public.dashboard_configs;
create policy "Admin write dashboard_configs"
  on public.dashboard_configs for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

insert into public.dashboard_configs (code, label, color, sort_order, description) values
  ('main',     'Main',     'slate',  1, 'Active appraisal work'),
  ('qc',       'QC',       'blue',   2, 'Submitted — awaiting QC review'),
  ('billing',  'Billing',  'amber',  3, 'QC passed — ready to invoice'),
  ('delivery', 'Delivery', 'purple', 4, 'Invoiced — awaiting delivery'),
  ('payment',  'Payment',  'green',  5, 'Delivered — awaiting payment')
on conflict (code) do nothing;

-- 3. user_dashboard_access — per-user grants. Mirrors user_companies.
create table if not exists public.user_dashboard_access (
  user_id         uuid not null references public.profiles(id) on delete cascade,
  dashboard_code  text not null references public.dashboard_configs(code),
  granted_at      timestamptz not null default now(),
  granted_by      uuid null references public.profiles(id) on delete set null,
  primary key (user_id, dashboard_code)
);

create index if not exists user_dashboard_access_user_idx
  on public.user_dashboard_access (user_id);

alter table public.user_dashboard_access enable row level security;

-- Users read their own grants; admins read all.
drop policy if exists uda_read on public.user_dashboard_access;
create policy uda_read on public.user_dashboard_access for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Only admins mutate.
drop policy if exists uda_write on public.user_dashboard_access;
create policy uda_write on public.user_dashboard_access for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 4. One-time data migration — fold existing status_phase into workflow_stage
--    for the two codes that are workflow stages (not orthogonal flags).
update public.acv_history
   set workflow_stage = 'qc',
       workflow_stage_set_at = coalesce(status_phase_set_at, now()),
       status_phase = null,
       status_phase_set_at = null
 where status_phase = 'completed';

update public.acv_history
   set workflow_stage = 'payment',
       workflow_stage_set_at = coalesce(status_phase_set_at, now()),
       status_phase = null,
       status_phase_set_at = null
 where status_phase = 'pending_payment';

-- Archive the two now-redundant phase configs (keeps the historical labels
-- intact if any UI reads from them).
update public.status_phase_configs
   set archived = true
 where code in ('completed','pending_payment');

-- 5. Verification (expect positive numbers for the real counts).
select 'workflow_stage column'           as label, count(*)::int as value
  from information_schema.columns
  where table_schema='public' and table_name='acv_history' and column_name='workflow_stage'
union all
select 'dashboard_configs rows',                 count(*)::int from public.dashboard_configs
union all
select 'claims at workflow_stage=main',          count(*)::int from public.acv_history where workflow_stage='main' and status<>'closed'
union all
select 'claims at workflow_stage=qc',            count(*)::int from public.acv_history where workflow_stage='qc' and status<>'closed'
union all
select 'claims at workflow_stage=payment',       count(*)::int from public.acv_history where workflow_stage='payment' and status<>'closed'
union all
select 'archived phase configs (completed+pp)',  count(*)::int from public.status_phase_configs where archived and code in ('completed','pending_payment');
