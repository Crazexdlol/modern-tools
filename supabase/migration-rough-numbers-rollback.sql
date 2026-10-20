-- supabase/migration-rough-numbers-rollback.sql
-- WARNING: dropping the acv_history columns will lose any rough-numbers
-- data captured so far (which claims have the flag on, which have been
-- parked). Only use in dev / if you need to reset.

ALTER TABLE public.acv_history
  DROP COLUMN IF EXISTS needs_rough_numbers,
  DROP COLUMN IF EXISTS rough_numbers_handoff_at;

ALTER TABLE public.clients
  DROP COLUMN IF EXISTS rough_numbers_default;

DELETE FROM public.status_phase_configs WHERE code = 'rough_numbers';

-- Clear the admin-picked inbox owner if it was set.
DELETE FROM public.site_settings WHERE key = 'rough_numbers_inbox_owner_id';
