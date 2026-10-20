-- Restore the pre-admin-only (post multi-company) messages RLS policies and
-- drop the column. Rows that had is_admin_only=true become visible to all
-- claim-accessing users again after rollback.

DROP POLICY IF EXISTS messages_select ON public.messages;
CREATE POLICY messages_select ON public.messages FOR SELECT TO authenticated
  USING (
    public.active_company_id() = company_id
    AND public.has_company_access(company_id)
    AND EXISTS (
      SELECT 1 FROM public.acv_history a
      WHERE a.id = messages.claim_id
        AND (public.is_admin() OR a.assigned_to = auth.uid())
    )
  );

DROP POLICY IF EXISTS messages_insert ON public.messages;
CREATE POLICY messages_insert ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    public.active_company_id() = company_id
    AND public.has_company_access(company_id)
    AND EXISTS (
      SELECT 1 FROM public.acv_history a
      WHERE a.id = messages.claim_id
        AND (public.is_admin() OR a.assigned_to = auth.uid())
    )
  );

ALTER TABLE public.messages DROP COLUMN IF EXISTS is_admin_only;
