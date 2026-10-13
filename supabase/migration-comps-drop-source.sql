-- supabase/migration-comps-drop-source.sql
-- Removes the obsolete `source` column from the listings table in the XSFA
-- comps-db Supabase. Henry's directive 2026-10-13: all comps live in one
-- place now and we don't need a per-source slug column anymore.
--
-- RUN THIS IN THE XSFA comps-db SUPABASE SQL EDITOR (project COMPS_DB_URL),
-- NOT in the HamsPortal project (ektglhdstobaipdqssjx).

ALTER TABLE listings DROP COLUMN IF EXISTS source;
