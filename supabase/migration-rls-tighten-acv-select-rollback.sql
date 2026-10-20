-- Rollback for migration-rls-tighten-acv-select.sql.
-- Restores the old SELECT policy where non-admins could see any claim they
-- either (a) are currently assigned to, or (b) ever created.

drop policy if exists acv_select on public.acv_history;
create policy acv_select on public.acv_history for select to authenticated
  using (
    public.active_company_id() = company_id
    and public.has_company_access(company_id)
    and (
      public.is_admin()
      or assigned_to = auth.uid()
      or user_id = auth.uid()
    )
  );
