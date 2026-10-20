-- supabase/migration-rename-handling-to-negotiating-appraiser-rollback.sql
-- Reverses the rename migration:
--   1. Disables the guard trigger
--   2. Renames negotiatingAppraiser → handlingAppraiser on every row
--   3. Restores the guard function with the original handlingAppraiser check
--   4. Re-enables the guard
-- Idempotent — only touches rows that still have the new key.

ALTER TABLE public.acv_history DISABLE TRIGGER acv_history_appraiser_guard;

UPDATE public.acv_history
SET claim = (claim - 'negotiatingAppraiser')
         || jsonb_build_object('handlingAppraiser', claim->'negotiatingAppraiser')
WHERE claim ? 'negotiatingAppraiser';

-- Restore the original guard (verbatim from migration-client-name-edit-permission.sql).
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

  IF new.assigned_to  IS DISTINCT FROM old.assigned_to  THEN RAISE EXCEPTION 'not allowed to change assigned_to';  END IF;
  IF new.status       IS DISTINCT FROM old.status       THEN RAISE EXCEPTION 'not allowed to change status';       END IF;
  IF new.submitted_at IS DISTINCT FROM old.submitted_at THEN RAISE EXCEPTION 'not allowed to change submitted_at'; END IF;
  IF new.submitted_by IS DISTINCT FROM old.submitted_by THEN RAISE EXCEPTION 'not allowed to change submitted_by'; END IF;
  IF new.user_id      IS DISTINCT FROM old.user_id      THEN RAISE EXCEPTION 'not allowed to change user_id';      END IF;

  IF new.claim->>'handlingAppraiser' IS DISTINCT FROM old.claim->>'handlingAppraiser' THEN
    RAISE EXCEPTION 'not allowed to change handlingAppraiser';
  END IF;

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

ALTER TABLE public.acv_history ENABLE TRIGGER acv_history_appraiser_guard;
