-- Rollback for migration-user-claim-views.sql.
drop table if exists public.user_claim_views cascade;
