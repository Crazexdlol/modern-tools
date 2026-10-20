-- Rollback: tickets.number
alter table public.tickets drop constraint if exists tickets_number_unique;
alter table public.tickets alter column number drop not null;
alter table public.tickets alter column number drop default;
alter table public.tickets drop column if exists number;
drop sequence if exists public.tickets_number_seq;
