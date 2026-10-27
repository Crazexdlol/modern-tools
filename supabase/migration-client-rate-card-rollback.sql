-- Rollback for migration-client-rate-card.sql.
-- Drops the per-client billing rates column. Any stored rates are lost.

alter table public.clients drop column if exists rate_card;
