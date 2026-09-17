-- ============================================================
-- Modern Tools — unlock post-submit editing (2026-09-15)
-- Run in the Supabase SQL Editor.
-- Reverses cleanly with migration-unlock-post-submit-editing-rollback.sql.
--
-- Purpose:
--   Loosen the acv_update RLS policy so an assignee can keep editing their
--   claim after they hit Submit. Previously the policy required
--   `submitted_at is null` — once submitted, the appraiser hit a
--   permission_denied on any subsequent auto-save.
--
--   The column-guard trigger `acv_history_appraiser_guard` (defined in
--   migration-roles.sql) still prevents appraisers from changing
--   protected columns (submitted_at, submitted_by, assigned_to, status,
--   user_id), so this only unlocks content editing — the appraiser can
--   still not un-submit, close, or reassign themselves.
--
--   The remaining lock is `status <> 'closed'`: once the admin closes
--   the claim (Complete or Cancelled), the appraiser can no longer edit.
--   Admins are unaffected — they can edit any claim, closed or open.
-- ============================================================

drop policy if exists acv_update on public.acv_history;

create policy acv_update on public.acv_history for update
  using (
    public.is_admin()
    or (assigned_to = auth.uid() and status <> 'closed')
  )
  with check (
    public.is_admin()
    or (assigned_to = auth.uid() and status <> 'closed')
  );

-- Verification (should return one row for the new policy):
select 'acv_update policy' as label, count(*)::int as value
  from pg_policies
  where schemaname = 'public' and tablename = 'acv_history' and policyname = 'acv_update';
