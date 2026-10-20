-- =========================================================================
-- HamsPortal — "Court Appointed Umpire" status phase (2026-10-10)
--
-- Adds a new orthogonal status-phase chip for claims where a court has
-- formally appointed the umpire (distinct from the standard "Umpire" phase
-- which covers the appraisers' own umpire-selection step).
--
-- Fuchsia keeps it visually distinct from the existing palette (green/red/
-- amber/blue/purple/teal are all taken by other phases).
--
-- Idempotent — safe to re-run.
-- =========================================================================

-- Note: color 'yellow' per the 2026-10-10 palette repaint. Requires the
-- 'yellow' entry in phaseColorClasses (status-phase-configs.ts) — added in
-- the same deploy.
insert into public.status_phase_configs (code, label, color, sort_order) values
  ('court_umpire', 'Court Appointed Umpire', 'yellow', 6)
on conflict (code) do update set
  label = excluded.label,
  color = excluded.color,
  sort_order = excluded.sort_order;

-- Verification
select code, label, color, sort_order, archived
  from public.status_phase_configs
 order by sort_order;
