-- Creates the private chat-attachments bucket and its storage policies.
-- Run after migration-chat.sql.

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
