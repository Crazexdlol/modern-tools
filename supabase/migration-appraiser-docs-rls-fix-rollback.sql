-- Rollback: restore the buggy operator-precedence version of the policy
-- (do NOT run this in production — this reverts to the insecure state).
drop policy if exists appraiser_docs_view on storage.objects;

create policy appraiser_docs_view on storage.objects
  for select
  using (
    bucket_id = 'appraiser-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  );
