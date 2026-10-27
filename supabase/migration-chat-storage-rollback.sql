-- Rollback for migration-chat-storage.sql.
drop policy if exists chat_attachments_select on storage.objects;
drop policy if exists chat_attachments_insert on storage.objects;
drop policy if exists chat_attachments_update_own on storage.objects;
drop policy if exists chat_attachments_delete_own on storage.objects;
delete from storage.buckets where id = 'chat-attachments';
