-- =========================================================================
-- HamsPortal — Per-client RTA default + Sedgwick backfill (2026-10-18)
-- Run in the Supabase SQL Editor (Dashboard → SQL Editor).
--
-- Adds a mirror of clients.rough_numbers_default for the Right To
-- Appraisal (RTA) flag. When flipped on, new claims linked to the client
-- auto-add 'rta' to claim.claimTypes at creation (handled in the
-- ClaimWorkspace client-picker useEffect). Opens the door for any future
-- TPA / carrier whose claims always get RTA tagged.
--
-- Second step flips the flag on every client whose name contains
-- "Sedgwick" (case-insensitive). Henry's spec: every Sedgwick claim gets
-- RTA selected, going forward.
--
-- Third step backfills every OPEN acv_history row whose client_id points
-- to a now-rta_default=true client — appends 'rta' to claim.claimTypes if
-- it isn't already there. CLOSED claims are intentionally left alone
-- (changing a settled claim's type is noisier than it's worth).
-- =========================================================================

-- 1. Add the column (idempotent).
alter table public.clients
  add column if not exists rta_default boolean not null default false;

-- 2. Flip on for Sedgwick clients.
update public.clients
   set rta_default = true
 where name ilike '%sedgwick%';

-- 3. Backfill open linked claims. Appends 'rta' to the jsonb array
--    claim->'claimTypes' if the array doesn't already contain it.
--    `? 'rta'` on a jsonb array returns true when 'rta' is one of its
--    string elements. Null-safety: coalesce to [] in case claimTypes is
--    missing entirely on a legacy row.
update public.acv_history h
   set claim = jsonb_set(
     h.claim,
     '{claimTypes}',
     coalesce(h.claim->'claimTypes', '[]'::jsonb) || '["rta"]'::jsonb
   )
 where h.client_id in (select id from public.clients where rta_default = true)
   and coalesce(h.status, 'open') <> 'closed'
   and not (coalesce(h.claim->'claimTypes', '[]'::jsonb) ? 'rta');

-- 4. Verification (inspect manually).
select 'clients.rta_default column exists' as label,
       count(*) as value
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'clients'
   and column_name = 'rta_default'
union all
select 'clients flagged rta_default=true', count(*)::int
  from public.clients
 where rta_default = true
union all
select 'open claims with rta in claim.claimTypes', count(*)::int
  from public.acv_history
 where coalesce(status, 'open') <> 'closed'
   and coalesce(claim->'claimTypes', '[]'::jsonb) ? 'rta';
