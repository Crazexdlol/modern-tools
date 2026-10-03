-- =========================================================================
-- HamsPortal — Apply "Sales Tax Application by State" (2019 reference sheet)
-- to the state_tax_rules.rule column.
--
-- Source: scripts/_parse-sales-tax-xlsx.mjs reading the uploaded xlsx on
-- 2026-10-03. Only updates the rule column — leaves rate + notes untouched
-- (rate was seeded by migration-state-tax-rules-rates.sql).
--
-- Idempotent — safe to re-run.
-- =========================================================================

-- No sales tax
update public.state_tax_rules set rule = 'none' where state in ('AK','DE','MT','NH','OR');

-- Sales tax on EVERYTHING (labor + parts + materials + sublet)
update public.state_tax_rules set rule = 'all' where state in (
  'AR','CT','FL','HI','IA','KS','KY','LA','MS','NJ','NM','NY','NC','ND',
  'OH','PA','SD','TN','UT','WA','WV','WI','WY'
);

-- Parts + materials only (no labor tax)
update public.state_tax_rules set rule = 'parts_materials' where state in (
  'AL','AZ','CA','CO','GA','ID','IL','IN','ME','MD','MA','MI','MN','MO',
  'NV','OK','RI','TX','VT','VA'
);

-- Parts only (narrower than parts_materials)
update public.state_tax_rules set rule = 'parts_only' where state in ('SC');

-- Parts + materials + refinish labor only (no other labor)
update public.state_tax_rules set rule = 'parts_materials_refinish' where state in ('NE');

-- DC was not on the 2019 sheet. Default to parts_materials — the most
-- common Mid-Atlantic pattern. Henry can edit via /admin/settings/state-tax-rules.
update public.state_tax_rules set rule = 'parts_materials' where state = 'DC' and rule is null;

-- Verification: expect counts per rule to match the sheet (5 / 23 / 20 / 1 / 1 / DC free).
select rule, count(*)::int as states from public.state_tax_rules group by rule order by rule;
