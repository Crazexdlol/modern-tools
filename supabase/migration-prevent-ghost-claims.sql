-- =========================================================================
-- HamsPortal — Prevent "ghost" claims (2026-10-02)
--
-- Blocks INSERT or UPDATE of an acv_history row where the row has NOTHING
-- identifying it — no ma_number, no claim.insuredName, no claim.claimNumber.
-- Historically these rows were created by the standalone Comp Finder tool
-- as VIN-lookup scratchpads; they'd land in the DB with mode='comp-finder',
-- no MA#, no insured, closed status — invisible to admins browsing claims
-- but counted as "claims" by the system.
--
-- Belt-and-suspenders alongside the client-side guards in ClaimWorkspace
-- auto-save and saveACVHistory().
--
-- Idempotent. Reverses via -rollback.sql.
-- =========================================================================

-- 1. Add the CHECK constraint — if any identifier field has content, pass.
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'acv_history_identifiable_check'
  ) then
    alter table public.acv_history
      add constraint acv_history_identifiable_check
      check (
        coalesce(nullif(trim(ma_number), ''), '') <> ''
        or coalesce(nullif(trim(claim->>'insuredName'), ''), '') <> ''
        or coalesce(nullif(trim(claim->>'claimNumber'), ''), '') <> ''
      )
      not valid;
    -- Add as NOT VALID first so we don't scan the whole table during the
    -- ALTER (fast, non-blocking). Validate separately below.
  end if;
end $$;

-- 2. Validate against the existing rows. After today's cleanup there
--    shouldn't be any violators left; if there are, VALIDATE will raise.
alter table public.acv_history validate constraint acv_history_identifiable_check;

-- 3. Verification — expect 1.
select 'acv_history_identifiable_check present' as label,
  (select count(*)::int from pg_constraint where conname = 'acv_history_identifiable_check') as value;
