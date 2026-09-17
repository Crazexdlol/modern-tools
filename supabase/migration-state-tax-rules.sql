-- ============================================================
-- Modern Tools — State Sales Tax Rules migration (2026-09-12)
-- Run in the Supabase SQL Editor (Dashboard → SQL Editor).
-- Reverses cleanly with migration-state-tax-rules-rollback.sql.
--
-- Purpose:
--   One row per US state, storing which components are taxable per that
--   state's sales tax rules for auto-body work. Imported from
--   "Sales Tax Application by State 5-9-19.xlsx". Editable in-app at
--   /admin/settings/tax-rules.
--
--   The rule enum matches the spreadsheet's five mutually-exclusive columns:
--     'none'                     — no sales tax at all
--     'all'                      — tax on labor, parts, materials, sublet
--     'parts_materials'          — tax on parts & materials only
--     'parts_only'               — tax on parts only
--     'parts_materials_refinish' — tax on parts, materials, and refinish labor only
--
-- Every Estimate Review pulls the row for the claim's loss state and
-- auto-flags any tax charged against components the rule doesn't cover.
--
-- Idempotent — safe to re-run.
-- ============================================================

create table if not exists public.state_tax_rules (
  state text primary key,
  rule text not null check (rule in ('none', 'all', 'parts_materials', 'parts_only', 'parts_materials_refinish')),
  notes text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

alter table public.state_tax_rules enable row level security;

drop policy if exists "Authenticated read state_tax_rules" on public.state_tax_rules;
create policy "Authenticated read state_tax_rules"
  on public.state_tax_rules for select
  using (auth.role() = 'authenticated');

drop policy if exists "Admin write state_tax_rules" on public.state_tax_rules;
create policy "Admin write state_tax_rules"
  on public.state_tax_rules for all
  using (public.is_admin())
  with check (public.is_admin());

-- Verification
select 'state_tax_rules table' as label, count(*)::int as value
  from information_schema.tables
  where table_schema = 'public' and table_name = 'state_tax_rules';
