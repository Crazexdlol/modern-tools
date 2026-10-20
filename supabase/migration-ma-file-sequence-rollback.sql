-- =========================================================================
-- Rollback for migration-ma-file-sequence.sql (2026-10-10)
-- =========================================================================

-- 1. Drop the safety-net trigger + function.
drop trigger if exists trg_assign_ma_number_if_missing on public.acv_history;
drop function if exists public.assign_ma_number_if_missing();

-- 2. Drop the UNIQUE index. (If you want to KEEP uniqueness protection
-- while rolling back auto-generation, skip this step.)
drop index if exists public.acv_history_ma_number_unique;

-- 3. Drop the RPC + sequence.
drop function if exists public.nextval_public_ma_file_seq();
drop sequence if exists public.ma_file_seq;
