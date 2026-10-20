-- supabase/migration-rough-numbers.sql
-- Rough-numbers workflow (2026-10-13).
-- Spec: docs/superpowers/specs/2026-10-13-rough-numbers-workflow-design.md
-- Plan: docs/superpowers/plans/2026-10-13-rough-numbers-workflow.md
--
-- Idempotent: every ADD COLUMN uses IF NOT EXISTS, the status-phase seed
-- uses ON CONFLICT DO NOTHING, and the site_settings upsert is skipped
-- entirely (admin picks the value in the UI).
--
-- What this does:
--  1. acv_history gets two new columns:
--       needs_rough_numbers       — set at claim creation, immutable
--       rough_numbers_handoff_at  — one-shot timestamp set the first time
--                                   Submit fires on a rough-numbers claim
--  2. clients gets rough_numbers_default (per-client default for the toggle
--     on the new-claim form).
--  3. status_phase_configs gets a seed row for the "Rough Numbers" phase
--     with pauses_cycle_time=true, so parked claims don't accrue cycle time.
--  4. No site_settings change — the inbox-owner id is stored under the
--     existing key/value table with key 'rough_numbers_inbox_owner_id',
--     written by the admin UI when picked.

-- 1. acv_history columns.
ALTER TABLE public.acv_history
  ADD COLUMN IF NOT EXISTS needs_rough_numbers boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rough_numbers_handoff_at timestamptz NULL;

-- 2. clients column.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS rough_numbers_default boolean NOT NULL DEFAULT false;

-- 3. Seed the Rough Numbers status phase. Admin can edit label/color/sort
--    order later from the Status Phases page; the critical invariant is
--    pauses_cycle_time=true.
INSERT INTO public.status_phase_configs (code, label, color, sort_order, archived, pauses_cycle_time)
VALUES ('rough_numbers', 'Rough Numbers', 'blue', 50, false, true)
ON CONFLICT (code) DO NOTHING;

-- 4. Verification. Expected (idempotent runs will all show these):
--      - needs_rough_numbers + rough_numbers_handoff_at present on acv_history
--      - rough_numbers_default present on clients
--      - rough_numbers phase row present
SELECT 'acv_history.needs_rough_numbers present' AS label,
       count(*) AS value
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'acv_history'
   AND column_name = 'needs_rough_numbers'
UNION ALL
SELECT 'acv_history.rough_numbers_handoff_at present' AS label,
       count(*) AS value
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'acv_history'
   AND column_name = 'rough_numbers_handoff_at'
UNION ALL
SELECT 'clients.rough_numbers_default present' AS label,
       count(*) AS value
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'clients'
   AND column_name = 'rough_numbers_default'
UNION ALL
SELECT 'rough_numbers phase seeded' AS label,
       count(*) AS value
  FROM public.status_phase_configs
 WHERE code = 'rough_numbers';
-- All four should return value=1.
