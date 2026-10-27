-- 2026-10-20
-- Allow every authenticated user (not just the row owner + admins) to SELECT
-- from appraiser_licenses.
--
-- Why: the state-licensing badge at the top of the claim workspace AND the
-- Negotiating Appraiser license roster below the handler picker both read
-- ALL licenses via fetchAllLicenses() so they can answer "is <handler/
-- assignee> licensed in <loss state>?" and "who IS licensed in <loss state>?".
-- Under the old policy (auth.uid() = user_id OR is_admin()), a non-admin
-- appraiser's query returned only their own rows, so viewing a claim assigned
-- to a different appraiser surfaced a false "NOT LICENSED" badge and a false
-- "No appraisers currently hold an active <state> license." line even when
-- the handler had a valid license on file.
--
-- Scope: reads only. Writes remain admin-only via the existing
-- "Admin write appraiser_licenses" policy — not touched here.
--
-- Verification (Oct 2026): MA# 555657 (NY loss, Alex Aleksanyan negotiating,
-- Alex holds active NY license #1897419 exp 2026-12-31) showed NOT LICENSED
-- + empty roster to Henry's appraiser account before this change. After this
-- migration Henry sees the correct roster + the top badge uses the current
-- assignee's license (separate code change in state-licensing-top-badge.tsx).

drop policy if exists "Read own licenses or admin all" on public.appraiser_licenses;

create policy "Read appraiser_licenses (all authenticated)"
  on public.appraiser_licenses for select
  using (auth.role() = 'authenticated');
