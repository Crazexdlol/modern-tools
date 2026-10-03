-- ============================================================
-- HamsPortal — State tax rules: add rate column + 51-state seed (2026-10-03)
-- Run in the Supabase SQL Editor (Dashboard → SQL Editor).
-- Reverses cleanly with migration-state-tax-rules-rates-rollback.sql.
--
-- Purpose:
--   Add a numeric `rate` column to state_tax_rules holding the base statewide
--   sales tax rate as a percentage (e.g. 7.25 for 7.25%). Nullable so missing
--   data never blocks existing claims. Seed all 50 states + DC with 2024/2025
--   verified base rates; the coalesce on conflict preserves any rate already
--   manually entered.
--
-- Idempotent — safe to re-run.
-- ============================================================

-- 1. Add the column.
alter table public.state_tax_rules
  add column if not exists rate numeric(5,3) null;

-- 2. Seed 51 rows (all 50 states + DC).
--    On conflict: only fill rate if not already set; preserve existing rule/notes.
insert into public.state_tax_rules (state, rate, rule, notes)
values
  ('AL',  4.000, 'parts_materials', 'auto-seeded 2026-10-03'),
  ('AK',  0.000, 'none',            'auto-seeded 2026-10-03'),
  ('AZ',  5.600, 'parts_materials', 'auto-seeded 2026-10-03'),
  ('AR',  6.500, 'parts_materials', 'auto-seeded 2026-10-03'),
  ('CA',  7.250, 'parts_materials', 'auto-seeded 2026-10-03'),
  ('CO',  2.900, 'parts_materials', 'auto-seeded 2026-10-03'),
  ('CT',  6.350, 'parts_materials', 'auto-seeded 2026-10-03'),
  ('DE',  0.000, 'none',            'auto-seeded 2026-10-03'),
  ('DC',  6.000, 'parts_materials', 'auto-seeded 2026-10-03'),
  ('FL',  6.000, 'parts_materials', 'auto-seeded 2026-10-03'),
  ('GA',  4.000, 'parts_materials', 'auto-seeded 2026-10-03'),
  ('HI',  4.000, 'parts_materials', 'auto-seeded 2026-10-03'),
  ('ID',  6.000, 'parts_materials', 'auto-seeded 2026-10-03'),
  ('IL',  6.250, 'parts_materials', 'auto-seeded 2026-10-03'),
  ('IN',  7.000, 'parts_only',      'auto-seeded 2026-10-03'),
  ('IA',  6.000, 'parts_materials', 'auto-seeded 2026-10-03'),
  ('KS',  6.500, 'parts_materials', 'auto-seeded 2026-10-03'),
  ('KY',  6.000, 'parts_materials', 'auto-seeded 2026-10-03'),
  ('LA',  4.450, 'parts_materials', 'auto-seeded 2026-10-03'),
  ('ME',  5.500, 'parts_materials', 'auto-seeded 2026-10-03'),
  ('MD',  6.000, 'parts_materials', 'auto-seeded 2026-10-03'),
  ('MA',  6.250, 'parts_materials', 'auto-seeded 2026-10-03'),
  ('MI',  6.000, 'parts_materials', 'auto-seeded 2026-10-03'),
  ('MN',  6.875, 'parts_materials', 'auto-seeded 2026-10-03'),
  ('MS',  7.000, 'parts_materials', 'auto-seeded 2026-10-03'),
  ('MO',  4.225, 'parts_materials', 'auto-seeded 2026-10-03'),
  ('MT',  0.000, 'none',            'auto-seeded 2026-10-03'),
  ('NE',  5.500, 'parts_materials', 'auto-seeded 2026-10-03'),
  ('NV',  6.850, 'parts_materials', 'auto-seeded 2026-10-03'),
  ('NH',  0.000, 'none',            'auto-seeded 2026-10-03'),
  ('NJ',  6.625, 'parts_materials', 'auto-seeded 2026-10-03'),
  ('NM',  4.875, 'parts_materials', 'auto-seeded 2026-10-03'),
  ('NY',  4.000, 'parts_materials', 'auto-seeded 2026-10-03'),
  ('NC',  4.750, 'parts_materials', 'auto-seeded 2026-10-03'),
  ('ND',  5.000, 'parts_materials', 'auto-seeded 2026-10-03'),
  ('OH',  5.750, 'parts_materials', 'auto-seeded 2026-10-03'),
  ('OK',  4.500, 'parts_materials', 'auto-seeded 2026-10-03'),
  ('OR',  0.000, 'none',            'auto-seeded 2026-10-03'),
  ('PA',  6.000, 'parts_materials', 'auto-seeded 2026-10-03'),
  ('RI',  7.000, 'parts_materials', 'auto-seeded 2026-10-03'),
  ('SC',  6.000, 'parts_materials', 'auto-seeded 2026-10-03'),
  ('SD',  4.200, 'parts_materials', 'auto-seeded 2026-10-03'),
  ('TN',  7.000, 'parts_materials', 'auto-seeded 2026-10-03'),
  ('TX',  6.250, 'parts_materials', 'auto-seeded 2026-10-03'),
  ('UT',  6.100, 'parts_materials', 'auto-seeded 2026-10-03'),
  ('VT',  6.000, 'parts_materials', 'auto-seeded 2026-10-03'),
  ('VA',  5.300, 'parts_materials', 'auto-seeded 2026-10-03'),
  ('WA',  6.500, 'parts_materials', 'auto-seeded 2026-10-03'),
  ('WV',  6.000, 'parts_materials', 'auto-seeded 2026-10-03'),
  ('WI',  5.000, 'parts_materials', 'auto-seeded 2026-10-03'),
  ('WY',  4.000, 'parts_materials', 'auto-seeded 2026-10-03')
on conflict (state) do update
  set rate = coalesce(public.state_tax_rules.rate, excluded.rate);

-- 3. Verification — expect 51 rows.
select state, rate, rule from public.state_tax_rules order by state;
