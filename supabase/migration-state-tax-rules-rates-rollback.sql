-- ============================================================
-- Rollback: remove rate column from state_tax_rules (2026-10-03)
-- NOTE: does NOT delete the seeded rows — the base rule data is still useful.
-- ============================================================

alter table public.state_tax_rules
  drop column if exists rate;
