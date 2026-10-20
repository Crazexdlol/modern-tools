-- supabase/migration-rename-handling-to-negotiating-appraiser.sql
-- Idempotent. Renames the jsonb key handlingAppraiser → negotiatingAppraiser
-- on every row that still has the old key, and drops the appraiser_guard
-- check on the (now obsolete) handlingAppraiser key.
--
-- Context: per spec 2026-10-13-rough-numbers-workflow-design, the renamed
-- `negotiatingAppraiser` is metadata only — it no longer drives submit
-- routing. The UI already restricts the dropdown to admins, so the guard
-- is redundant.
--
-- The SQL Editor runs as the postgres role (neither service_role nor an
-- authenticated admin), which the acv_history_appraiser_guard would normally
-- block. We DISABLE the trigger around the UPDATE and re-ENABLE after —
-- same workaround as migration 3a8c4ec used for the user_id backfill.

-- 1. Disable the guard trigger so the rename UPDATE can run from the SQL
--    Editor (postgres role).
ALTER TABLE public.acv_history DISABLE TRIGGER acv_history_appraiser_guard;

-- 2. Rename the key on every row that still has the old one.
--    Idempotent — the WHERE clause filters out already-migrated rows.
UPDATE public.acv_history
SET claim = (claim - 'handlingAppraiser')
         || jsonb_build_object('negotiatingAppraiser', claim->'handlingAppraiser')
WHERE claim ? 'handlingAppraiser';

-- 3. Replace the guard function to drop the obsolete handlingAppraiser
--    check. All other guards (assigned_to, status, submitted_*, user_id,
--    client_id, clientName) are preserved exactly as they were.
CREATE OR REPLACE FUNCTION public.acv_history_appraiser_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_can_edit boolean;
BEGIN
  IF auth.role() = 'service_role' THEN RETURN new; END IF;
  IF public.is_admin() THEN RETURN new; END IF;

  SELECT coalesce(can_edit_claim_info, false)
    INTO caller_can_edit
    FROM public.profiles
   WHERE id = auth.uid();
  caller_can_edit := coalesce(caller_can_edit, false);

  -- Existing guards — appraisers can never flip these regardless of edit flag.
  IF new.assigned_to  IS DISTINCT FROM old.assigned_to  THEN RAISE EXCEPTION 'not allowed to change assigned_to';  END IF;
  IF new.status       IS DISTINCT FROM old.status       THEN RAISE EXCEPTION 'not allowed to change status';       END IF;
  IF new.submitted_at IS DISTINCT FROM old.submitted_at THEN RAISE EXCEPTION 'not allowed to change submitted_at'; END IF;
  IF new.submitted_by IS DISTINCT FROM old.submitted_by THEN RAISE EXCEPTION 'not allowed to change submitted_by'; END IF;
  IF new.user_id      IS DISTINCT FROM old.user_id      THEN RAISE EXCEPTION 'not allowed to change user_id';      END IF;

  -- (The old handlingAppraiser guard is intentionally removed — the renamed
  -- negotiatingAppraiser is metadata only and the UI already restricts the
  -- dropdown to admins.)

  -- Client fields: admin OR an appraiser with can_edit_claim_info can edit.
  IF NOT caller_can_edit THEN
    IF new.client_id IS DISTINCT FROM old.client_id THEN
      RAISE EXCEPTION 'not allowed to change client_id';
    END IF;
    IF new.claim->>'clientName' IS DISTINCT FROM old.claim->>'clientName' THEN
      RAISE EXCEPTION 'not allowed to change clientName';
    END IF;
  END IF;

  RETURN new;
END;
$$;

-- 4. Re-enable the guard.
ALTER TABLE public.acv_history ENABLE TRIGGER acv_history_appraiser_guard;

-- 5. Verification. Expected: 0 rows left with the old key.
SELECT 'rows still carrying handlingAppraiser (should be 0)' AS label,
       count(*) AS value
  FROM public.acv_history
 WHERE claim ? 'handlingAppraiser'
UNION ALL
SELECT 'rows now carrying negotiatingAppraiser' AS label,
       count(*) AS value
  FROM public.acv_history
 WHERE claim ? 'negotiatingAppraiser';
