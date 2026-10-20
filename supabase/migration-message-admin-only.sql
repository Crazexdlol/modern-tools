-- Admin-only messages. When is_admin_only=true, non-admins can't SELECT the
-- row (RLS filters it out) and the INSERT policy prevents non-admins from
-- setting the flag in the first place. Belt + suspenders at the DB layer
-- so a buggy or malicious client can't bypass via the API.
--
-- Policies are rewritten from their current (post multi-company) shape:
-- the only new predicate added is `(NOT is_admin_only OR public.is_admin())`
-- on both SELECT and INSERT. Everything else is preserved verbatim.

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS is_admin_only boolean NOT NULL DEFAULT false;

DROP POLICY IF EXISTS messages_select ON public.messages;
CREATE POLICY messages_select ON public.messages FOR SELECT TO authenticated
  USING (
    public.active_company_id() = company_id
    AND public.has_company_access(company_id)
    AND (NOT is_admin_only OR public.is_admin())
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
    AND (NOT is_admin_only OR public.is_admin())
    AND EXISTS (
      SELECT 1 FROM public.acv_history a
      WHERE a.id = messages.claim_id
        AND (public.is_admin() OR a.assigned_to = auth.uid())
    )
  );
