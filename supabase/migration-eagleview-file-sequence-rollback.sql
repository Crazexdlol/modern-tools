-- Rollback for migration-eagleview-file-sequence.sql. Drops the sequence
-- and the RPC. After this, /api/companies/next-file-number returns
-- { supported: false } and the EV claim-info UI falls back to a plain
-- manual-entry input.

drop function if exists public.nextval_public_eagleview_file_seq();
drop sequence if exists public.eagleview_file_seq;
