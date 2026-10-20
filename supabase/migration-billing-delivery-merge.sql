-- =========================================================================
-- HamsPortal — Merge Billing + Delivery into one stage (2026-10-09)
--
-- Collapses the two DB workflow stages into a single 'billing_delivery' code.
-- After this migration the lifecycle is: Main → QC → Billing/Delivery → Payment.
--
-- Touches:
--   • acv_history.workflow_stage (CHECK constraint + data)
--   • dashboard_configs (CHECK constraint + rows + user_dashboard_access FK)
--   • user_dashboard_access.dashboard_code (data, deduped)
--   • claim_stage_events.stage (CHECK constraint + data — one-to-one rename;
--     each historical billing or delivery span becomes a billing_delivery
--     span with the same entered_at/exited_at/assigned_to so cycle-time
--     totals stay accurate)
--   • site_settings 'stage_entry_watchers' jsonb (merge billing + delivery
--     watcher lists into billing_delivery)
--
-- Idempotent. Reverses cleanly via -rollback.sql.
-- =========================================================================

begin;

-- 1. Drop CHECK constraints we're about to redefine. (The FK on
--    user_dashboard_access.dashboard_code → dashboard_configs.code stays —
--    we work around it by inserting the new config row BEFORE pointing
--    grants at it, then removing the old rows AFTER no grants reference
--    them anymore.)
alter table public.acv_history         drop constraint if exists acv_history_workflow_stage_check;
alter table public.claim_stage_events  drop constraint if exists claim_stage_events_stage_check;
alter table public.dashboard_configs   drop constraint if exists dashboard_configs_code_check;

-- 2. Insert the combined dashboard_configs row FIRST so the FK target exists
--    before we repoint any user_dashboard_access rows at it. The old
--    'billing' and 'delivery' rows are still present at this point.
insert into public.dashboard_configs (code, label, color, sort_order, description) values
  ('billing_delivery', 'Billing/Delivery', 'amber', 3, 'QC passed — ready to invoice and deliver')
on conflict (code) do update set
  label = excluded.label,
  color = excluded.color,
  sort_order = excluded.sort_order,
  description = excluded.description;

-- 3. Point user_dashboard_access grants at the new code (dedup so a user
--    with BOTH billing and delivery doesn't collide on the PK).
--    First merge billing → billing_delivery.
--    Then drop any delivery row that would collide after that merge.
--    Then merge the remaining delivery rows → billing_delivery.
update public.user_dashboard_access
   set dashboard_code = 'billing_delivery'
 where dashboard_code = 'billing';

delete from public.user_dashboard_access a
 where a.dashboard_code = 'delivery'
   and exists (
     select 1 from public.user_dashboard_access b
      where b.user_id = a.user_id
        and b.dashboard_code = 'billing_delivery'
   );

update public.user_dashboard_access
   set dashboard_code = 'billing_delivery'
 where dashboard_code = 'delivery';

-- 4. Remove the obsolete dashboard_configs rows. Safe now because no
--    user_dashboard_access rows still reference them.
delete from public.dashboard_configs where code in ('billing','delivery');

-- 5. Collapse acv_history workflow_stage. Preserves workflow_stage_set_at
--    (claims currently at 'delivery' keep their delivery-entry timestamp; it
--    now reads as "entered billing_delivery when the invoice phase began" —
--    a one-time quirk during cutover, not worth back-dating).
update public.acv_history
   set workflow_stage = 'billing_delivery'
 where workflow_stage in ('billing','delivery');

-- 6. Collapse historical claim_stage_events. One-to-one rename keeps every
--    span's entered_at/exited_at intact so cycle-time totals don't shift.
--    A claim that went billing→delivery historically now has two adjacent
--    billing_delivery spans; sum of durations is unchanged (the gap is 0s).
update public.claim_stage_events
   set stage = 'billing_delivery'
 where stage in ('billing','delivery');

-- 7. Merge site_settings.stage_entry_watchers lists (billing + delivery →
--    billing_delivery, deduped). Operates on all rows with that key; typically
--    there's exactly one. Safe no-op if neither sub-key exists.
update public.site_settings
   set value = (
     coalesce(value - 'billing' - 'delivery', '{}'::jsonb)
     || jsonb_build_object(
          'billing_delivery',
          coalesce(
            (select jsonb_agg(distinct id)
               from jsonb_array_elements_text(
                 coalesce(value -> 'billing',  '[]'::jsonb)
                 || coalesce(value -> 'delivery', '[]'::jsonb)
                 || coalesce(value -> 'billing_delivery', '[]'::jsonb)
               ) as t(id)),
            '[]'::jsonb
          )
        )
   )
 where key = 'stage_entry_watchers'
   and (value ? 'billing' or value ? 'delivery');

-- 8. Re-add CHECK constraints with the collapsed stage set.
alter table public.acv_history
  add constraint acv_history_workflow_stage_check
  check (workflow_stage in ('main','qc','billing_delivery','payment'));

alter table public.claim_stage_events
  add constraint claim_stage_events_stage_check
  check (stage in ('main','qc','billing_delivery','payment'));

alter table public.dashboard_configs
  add constraint dashboard_configs_code_check
  check (code in ('main','qc','billing_delivery','payment'));

commit;

-- 9. Verification.
select 'acv_history at billing_delivery'       as label, count(*)::int as value
  from public.acv_history where workflow_stage='billing_delivery' and status<>'closed'
union all
select 'acv_history still at billing',          count(*)::int from public.acv_history where workflow_stage='billing'
union all
select 'acv_history still at delivery',         count(*)::int from public.acv_history where workflow_stage='delivery'
union all
select 'dashboard_configs rows',                count(*)::int from public.dashboard_configs
union all
select 'dashboard_configs has billing_delivery', count(*)::int from public.dashboard_configs where code='billing_delivery'
union all
select 'user_dashboard_access billing_delivery', count(*)::int from public.user_dashboard_access where dashboard_code='billing_delivery'
union all
select 'claim_stage_events billing_delivery',   count(*)::int from public.claim_stage_events where stage='billing_delivery'
union all
select 'claim_stage_events legacy billing',     count(*)::int from public.claim_stage_events where stage='billing'
union all
select 'claim_stage_events legacy delivery',    count(*)::int from public.claim_stage_events where stage='delivery';
