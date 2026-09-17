-- Rollback: remove the sender_name guard trigger.
drop trigger if exists messages_sender_name_guard on public.messages;
drop function if exists public.messages_sender_name_guard();
