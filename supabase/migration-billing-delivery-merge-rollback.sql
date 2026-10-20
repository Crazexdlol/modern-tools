-- =========================================================================
-- Rollback — Billing+Delivery merge (2026-10-09)
--
-- Restores the pre-merge state (separate 'billing' and 'delivery' stages).
--
-- IMPORTANT: this cannot perfectly undo the data merge. Historical
-- claim_stage_events that were originally 'billing' vs 'delivery' are now
-- all 'billing_delivery' — the rollback puts them all back as 'billing'
-- which is a best-effort choice (lost granularity). acv_history rows that
-- WERE at 'delivery' at the time of the merge are also lumped back into
-- 'billing' because we don't track the distinction after the merge.
--
-- Use this only if you need to revert the merge quickly and are OK with the
-- cycle-time history collapsing into a single 'billing' bucket.
-- =========================================================================

begin;

alter table public.acv_history         drop constraint if exists acv_history_workflow_stage_check;
alter table public.claim_stage_events  drop constraint if exists claim_stage_events_stage_check;
alter table public.dashboard_configs   drop constraint if exists dashboard_configs_code_check;

-- Restore dashboard_configs rows first so FK targets exist.
insert into public.dashboard_configs (code, label, color, sort_order, description) values
  ('billing',  'Billing',  'amber',  3, 'QC passed — ready to invoice'),
  ('delivery', 'Delivery', 'purple', 4, 'Invoiced — awaiting delivery')
on conflict (code) do update set
  label = excluded.label,
  color = excluded.color,
  sort_order = excluded.sort_order,
  description = excluded.description;

-- Move grants back to 'billing' (lost granularity: anyone who had delivery-
-- only access now has billing access instead — admin may need to re-grant).
update public.user_dashboard_access
   set dashboard_code = 'billing'
 where dashboard_code = 'billing_delivery';

-- Delete the combined row AFTER grants are migrated.
delete from public.dashboard_configs where code = 'billing_delivery';

-- Flatten claim stage data back to 'billing' (lossy).
update public.acv_history
   set workflow_stage = 'billing'
 where workflow_stage = 'billing_delivery';

update public.claim_stage_events
   set stage = 'billing'
 where stage = 'billing_delivery';

-- Rewrite site_settings watcher key.
update public.site_settings
   set value = (coalesce(value - 'billing_delivery', '{}'::jsonb)
               || jsonb_build_object('billing', coalesce(value -> 'billing_delivery', '[]'::jsonb)))
 where key = 'stage_entry_watchers'
   and value ? 'billing_delivery';

-- Re-add the original CHECK constraints.
alter table public.acv_history
  add constraint acv_history_workflow_stage_check
  check (workflow_stage in ('main','qc','billing','delivery','payment'));

alter table public.claim_stage_events
  add constraint claim_stage_events_stage_check
  check (stage in ('main','qc','billing','delivery','payment'));

alter table public.dashboard_configs
  add constraint dashboard_configs_code_check
  check (code in ('main','qc','billing','delivery','payment'));

commit;
