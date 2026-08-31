-- =========================================================================
-- Modern Tools — Rollback for can-edit-claim-info (2026-08-26)
-- =========================================================================

alter table public.profiles drop column if exists can_edit_claim_info;
