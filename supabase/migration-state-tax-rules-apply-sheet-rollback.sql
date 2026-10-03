-- Rollback: reset the rule for every state back to the pre-sheet default
-- ('parts_materials' as seeded in migration-state-tax-rules-rates.sql).
-- This does NOT restore any prior MANUALLY edited rules — only use if you
-- want to wipe the sheet-applied values.
update public.state_tax_rules set rule = 'parts_materials';
