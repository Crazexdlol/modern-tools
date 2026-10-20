-- Tighten acv_history SELECT RLS: non-admin appraisers only see claims
-- CURRENTLY ASSIGNED to them. The previous policy also exposed any claim
-- they had ever created (user_id = auth.uid()), which meant reassigned
-- claims stayed visible to the original creator forever and polluted
-- their dashboard counts.
--
-- After this migration:
--   - admins: see every claim in their active company (unchanged)
--   - appraisers: see only claims where assigned_to = me AND company_id
--     matches their active company
--
-- Safe because:
--   - INSERT policy is unchanged. Non-admin creators self-assign via the
--     client (saveToHistory sets assigned_to = user_id for non-admins) so
--     they still see claims they just created.
--   - UPDATE policy already required `assigned_to = me` to edit, so this
--     doesn't change what anyone can modify.

drop policy if exists acv_select on public.acv_history;
create policy acv_select on public.acv_history for select to authenticated
  using (
    public.active_company_id() = company_id
    and public.has_company_access(company_id)
    and (
      public.is_admin()
      or assigned_to = auth.uid()
    )
  );
