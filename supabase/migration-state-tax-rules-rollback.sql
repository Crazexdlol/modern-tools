-- ============================================================
-- Modern Tools — State Tax Rules ROLLBACK (2026-09-12)
-- ============================================================

drop policy if exists "Admin write state_tax_rules"       on public.state_tax_rules;
drop policy if exists "Authenticated read state_tax_rules" on public.state_tax_rules;

drop table if exists public.state_tax_rules;
