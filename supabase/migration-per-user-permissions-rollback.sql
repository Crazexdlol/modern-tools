-- =========================================================================
-- Modern Tools — Per-User Permissions ROLLBACK (2026-08-26)
-- =========================================================================

alter table public.profiles drop column if exists can_reassign_claims;
alter table public.profiles drop column if exists auto_status_requests_override;
