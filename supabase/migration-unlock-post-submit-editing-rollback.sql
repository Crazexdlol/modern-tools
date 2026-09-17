-- Rollback for migration-unlock-post-submit-editing.sql — restores the
-- original acv_update policy that locked appraisers out once submitted_at
-- was set. Idempotent.

drop policy if exists acv_update on public.acv_history;

create policy acv_update on public.acv_history for update
  using (
    public.is_admin()
    or (assigned_to = auth.uid() and submitted_at is null)
  )
  with check (
    public.is_admin()
    or (assigned_to = auth.uid() and submitted_at is null)
  );
