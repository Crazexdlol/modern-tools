-- Rollback for migration-chat.sql.
-- Drops all chat tables; all stored chats are lost.
alter publication supabase_realtime drop table if exists public.chat_messages;
drop table if exists public.chat_messages cascade;
drop table if exists public.chat_conversation_members cascade;
drop table if exists public.chat_conversations cascade;
drop table if exists public.chat_permissions cascade;
