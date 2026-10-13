-- supabase/migration-comps-drop-source-rollback.sql
-- Restores the `source` text column (nullable, no default).
ALTER TABLE listings ADD COLUMN IF NOT EXISTS source text;
