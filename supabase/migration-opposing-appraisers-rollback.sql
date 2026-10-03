-- =========================================================================
-- Rollback: migration-opposing-appraisers.sql
-- Drops the opposing_appraisers table and its associated objects.
-- Does NOT drop pg_trgm — it may be used by other tables (e.g. clients).
-- =========================================================================

drop trigger  if exists opposing_appraisers_updated_at_trigger on public.opposing_appraisers;
drop function if exists public.opposing_appraisers_bump_updated_at();

drop policy if exists "oa_delete_admin"        on public.opposing_appraisers;
drop policy if exists "oa_update_admin"        on public.opposing_appraisers;
drop policy if exists "oa_insert_admin"        on public.opposing_appraisers;
drop policy if exists "oa_select_authenticated" on public.opposing_appraisers;

drop table if exists public.opposing_appraisers;
