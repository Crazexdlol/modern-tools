-- =========================================================================
-- Modern Tools — Phase Configs update (2026-08-29)
-- Run in the Supabase SQL Editor (Dashboard -> SQL Editor).
--
-- Small follow-up to the status-phases migration:
--   * Add a new "Hold" phase (blue).
--   * Change Umpire from red → amber (Rush stays the only urgent red).
--
-- Idempotent — safe to re-run.
-- =========================================================================

insert into public.status_phase_configs (code, label, color, sort_order) values
  ('hold', 'Hold', 'blue', 4)
on conflict (code) do update set
  label = excluded.label,
  color = excluded.color,
  sort_order = excluded.sort_order;

update public.status_phase_configs
   set color = 'amber',
       updated_at = now()
 where code = 'umpire' and color <> 'amber';

-- Verification
select code, label, color, sort_order from public.status_phase_configs order by sort_order;
