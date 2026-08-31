-- =========================================================================
-- Modern Tools — Rollback for tightened summaries UPDATE RLS
-- Only run if the tightened policy caused a problem for your team's flow.
-- =========================================================================

drop policy if exists summaries_update on public.summaries;

create policy "Authenticated users can update summaries"
  on public.summaries for update
  using (auth.role() = 'authenticated');
