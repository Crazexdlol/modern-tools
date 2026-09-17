-- Security fix: appraiser-documents SELECT policy has an operator-precedence bug.
--
-- Old:
--   (bucket_id = 'appraiser-documents'
--    and (storage.foldername(name))[1] = auth.uid()::text
--    or public.is_admin())
--
-- Because AND binds tighter than OR, this parses as:
--   (bucket_id='appraiser-documents' AND foldername=self) OR is_admin()
-- Effect: admins get blanket SELECT across EVERY storage bucket, not just
-- appraiser-documents. Fix by wrapping the OR in parens so the bucket_id
-- filter is applied first.

drop policy if exists appraiser_docs_view on storage.objects;

create policy appraiser_docs_view on storage.objects
  for select
  using (
    bucket_id = 'appraiser-documents'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );

-- Verification: expect 1 (policy present).
select count(*) from pg_policies
where schemaname = 'storage' and tablename = 'objects' and policyname = 'appraiser_docs_view';
