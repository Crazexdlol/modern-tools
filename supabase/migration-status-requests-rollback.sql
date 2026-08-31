-- =========================================================================
-- Modern Tools — Auto Status Requests ROLLBACK (2026-08-26)
-- Only run this if the corresponding forward migration caused a problem.
-- =========================================================================

drop index if exists public.messages_auto_request_idx;
alter table public.messages       drop column if exists is_auto_request;
alter table public.acv_history    drop column if exists assigned_at;
alter table public.acv_history    drop column if exists last_status_request_at;
delete from public.site_settings where key = 'auto_status_requests_enabled';
