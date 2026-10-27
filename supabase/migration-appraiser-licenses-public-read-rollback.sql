-- Rollback for migration-appraiser-licenses-public-read.sql.
-- Restores the original SELECT policy: own rows OR admin.

drop policy if exists "Read appraiser_licenses (all authenticated)" on public.appraiser_licenses;

create policy "Read own licenses or admin all"
  on public.appraiser_licenses for select
  using (
    auth.uid() = user_id
    or public.is_admin()
  );
