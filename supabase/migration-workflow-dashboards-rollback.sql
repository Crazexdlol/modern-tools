-- Rollback for migration-workflow-dashboards.sql.
-- Restores the pre-workflow state: claims at qc/payment move back to the
-- old status_phase values; everything at main/billing/delivery becomes null.
-- The dashboard tables + column are dropped last.

-- 1. Reverse the data migration.
update public.acv_history
   set status_phase = 'completed',
       status_phase_set_at = coalesce(workflow_stage_set_at, now()),
       workflow_stage = 'main',
       workflow_stage_set_at = null
 where workflow_stage = 'qc' and status <> 'closed';

update public.acv_history
   set status_phase = 'pending_payment',
       status_phase_set_at = coalesce(workflow_stage_set_at, now()),
       workflow_stage = 'main',
       workflow_stage_set_at = null
 where workflow_stage = 'payment' and status <> 'closed';

-- Un-archive the two phase configs.
update public.status_phase_configs
   set archived = false
 where code in ('completed','pending_payment');

-- 2. Drop the new tables.
drop policy if exists uda_read on public.user_dashboard_access;
drop policy if exists uda_write on public.user_dashboard_access;
drop table if exists public.user_dashboard_access;

drop policy if exists "Authenticated read dashboard_configs" on public.dashboard_configs;
drop policy if exists "Admin write dashboard_configs" on public.dashboard_configs;
drop table if exists public.dashboard_configs;

-- 3. Drop the column + its artifacts.
drop index if exists public.acv_history_workflow_stage_idx;
alter table public.acv_history drop constraint if exists acv_history_workflow_stage_check;
alter table public.acv_history drop column if exists workflow_stage;
alter table public.acv_history drop column if exists workflow_stage_set_at;
