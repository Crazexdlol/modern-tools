-- =========================================================================
-- Modern Tools — Tighten summaries UPDATE RLS (2026-08-26)
-- Run in the Supabase SQL Editor (Dashboard -> SQL Editor).
--
-- BEFORE: any authenticated user could UPDATE any summary row. Combined
-- with the rich-text HTML rendered via dangerouslySetInnerHTML on the
-- print view, this was a stored-XSS + cross-user-tampering vector.
--
-- AFTER: only admins, the creator, or the appraiser assigned to the
-- claim that owns this summary can UPDATE it. Preserves the day-to-day
-- workflow (admin creates → assignee fills in) without letting a random
-- team member overwrite someone else's work.
--
-- SELECT stays open to all authenticated (unchanged) — team-wide read
-- access is still fine, and it powers the summaries list at
-- /summary-page.
-- =========================================================================

drop policy if exists "Authenticated users can update summaries" on public.summaries;
drop policy if exists summaries_update on public.summaries;

create policy summaries_update on public.summaries for update
  using (
    public.is_admin()
    or created_by = auth.uid()
    or exists (
      select 1 from public.acv_history c
      where c.reports_state->>'summaryId' = summaries.id
        and c.assigned_to = auth.uid()
    )
  )
  with check (
    public.is_admin()
    or created_by = auth.uid()
    or exists (
      select 1 from public.acv_history c
      where c.reports_state->>'summaryId' = summaries.id
        and c.assigned_to = auth.uid()
    )
  );

-- Verification
select 'summaries policies' as label,
       count(*) as value
  from pg_policies where schemaname = 'public' and tablename = 'summaries';
