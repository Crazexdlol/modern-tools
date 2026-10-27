-- Creates the private chat-attachments bucket and its storage policies.
--
-- HARD DEPENDENCY: migration-chat.sql MUST be applied first. If it hasn't
-- been, this migration will raise an exception rather than create orphan
-- policies - because orphan policies on storage.objects that reference a
-- non-existent table cause EVERY authenticated storage query project-wide
-- to fail with "DatabaseInvalidObjectDefinition". Learned the hard way
-- 2026-10-27: a stray run of this file broke the Documents tab for every
-- claim on the whole project. The guard below prevents a repeat.

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'chat_conversation_members'
  ) then
    raise exception
      'migration-chat-storage.sql requires chat_conversation_members to exist. '
      'Run supabase/migration-chat.sql FIRST, then rerun this file.';
  end if;
end $$;

insert into storage.buckets (id, name, public)
  values ('chat-attachments', 'chat-attachments', false)
  on conflict (id) do nothing;

-- A storage path's first folder segment is the conversation_id. Membership
-- check uses chat_conversation_members.
drop policy if exists chat_attachments_select on storage.objects;
create policy chat_attachments_select on storage.objects for select to authenticated
  using (
    bucket_id = 'chat-attachments'
    and exists (
      select 1 from public.chat_conversation_members m
      where m.user_id = auth.uid()
        and m.conversation_id::text = split_part(name, '/', 1)
    )
  );

drop policy if exists chat_attachments_insert on storage.objects;
create policy chat_attachments_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-attachments'
    and exists (
      select 1 from public.chat_conversation_members m
      where m.user_id = auth.uid()
        and m.conversation_id::text = split_part(name, '/', 1)
    )
  );

-- Updates/deletes: only the uploader (owner column).
drop policy if exists chat_attachments_update_own on storage.objects;
create policy chat_attachments_update_own on storage.objects for update to authenticated
  using (bucket_id = 'chat-attachments' and owner = auth.uid())
  with check (bucket_id = 'chat-attachments' and owner = auth.uid());

drop policy if exists chat_attachments_delete_own on storage.objects;
create policy chat_attachments_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'chat-attachments' and owner = auth.uid());

select 'chat-attachments bucket' as label, count(*)::int as value
  from storage.buckets where id = 'chat-attachments';
