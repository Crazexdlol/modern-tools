-- Rollback: tickets table
-- Run in the Supabase SQL editor ONLY to undo migration-tickets.sql

drop policy if exists tickets_insert on public.tickets;
drop policy if exists tickets_select_own on public.tickets;
drop policy if exists tickets_super_admin_all on public.tickets;

drop index if exists public.tickets_status_created_at_idx;
drop index if exists public.tickets_submitted_by_idx;

drop table if exists public.tickets;
