-- =========================================================================
-- HamsPortal — Rollback for migration-clients-rta-default.sql
-- Run in the Supabase SQL Editor (Dashboard → SQL Editor).
--
-- Drops the rta_default column. The 'rta' values appended to
-- acv_history.claim->'claimTypes' by the backfill are LEFT IN PLACE —
-- removing them later would also wipe RTA tags added manually by users
-- after the migration ran, which we can't distinguish. If you need to
-- strip 'rta' from every claim, run this manually:
--
--   update public.acv_history h
--      set claim = jsonb_set(
--        h.claim,
--        '{claimTypes}',
--        (select coalesce(jsonb_agg(elem), '[]'::jsonb)
--           from jsonb_array_elements(coalesce(h.claim->'claimTypes','[]'::jsonb)) elem
--          where elem <> '"rta"'::jsonb)
--      );
-- =========================================================================

alter table public.clients
  drop column if exists rta_default;
