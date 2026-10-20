-- =========================================================================
-- HamsPortal — Seed per-user claim types (2026-10-10)
--
-- Henry's instructions:
--   • Nick Boras          → only ACVs
--   • Che Rios            → only Estimate Disputes
--   • George Aleksanyan   → only Estimate Disputes
--   • Vahan (Zurnachyan)  → does NOT handle Estimate Disputes (everything else)
--   • Arthur              → does NOT handle Estimate Disputes (everything else)
--
-- "Everything else" is spelled out explicitly rather than left empty so the
-- intent is auditable in the row. (Empty claim_types = handles everything
-- per the back-compat rule in userHandlesClaimTypes.)
--
-- Each UPDATE uses an ilike pattern on name so minor display variations
-- (middle initial, suffix) still match. Rerun safe — the WHERE clauses
-- only touch the targeted rows.
--
-- RUN AS: Supabase SQL Editor. The editor connects as the `postgres` role,
-- which is NOT caught by profiles_role_guard's `auth.role() = 'service_role'`
-- early-return — so the guard rejects these writes even though they're
-- clearly admin-intent. Workaround: disable the trigger for the duration
-- of this migration, then re-enable. Same pattern Henry used on the
-- 2026-10-04 user_id backfill (see migration-acv-user-id-backfill.sql).
-- =========================================================================

alter table public.profiles disable trigger profiles_role_guard;

-- First a visibility select so you can eyeball matches before the updates fire.
-- Expect one row per name (if a name has no match the update is a no-op).
select id, name, email, role, is_active, claim_types
  from public.profiles
 where name ilike 'Nick Boras%'
    or name ilike 'Che Rios%'
    or name ilike 'George Aleksanyan%'
    or name ilike 'Vahan%'
    or name ilike 'Arthur%'
 order by name;

-- Nick Boras — only ACV.
update public.profiles
   set claim_types = array['acv'],
       updated_at  = now()
 where name ilike 'Nick Boras%';

-- Che Rios — only Estimate Disputes.
update public.profiles
   set claim_types = array['estimate'],
       updated_at  = now()
 where name ilike 'Che Rios%';

-- George Aleksanyan — only Estimate Disputes.
update public.profiles
   set claim_types = array['estimate'],
       updated_at  = now()
 where name ilike 'George Aleksanyan%';

-- Vahan — everything EXCEPT Estimate Disputes.
update public.profiles
   set claim_types = array['acv','dv','lou','storage','salvage','full','desk','other'],
       updated_at  = now()
 where name ilike 'Vahan%';

-- Arthur — everything EXCEPT Estimate Disputes.
update public.profiles
   set claim_types = array['acv','dv','lou','storage','salvage','full','desk','other'],
       updated_at  = now()
 where name ilike 'Arthur%';

-- Re-enable the guard so appraisers can't quietly flip their own fields
-- between now and the next SQL-editor session.
alter table public.profiles enable trigger profiles_role_guard;

-- Verification — expect each targeted user to show the array above.
select name, email, role, claim_types
  from public.profiles
 where name ilike 'Nick Boras%'
    or name ilike 'Che Rios%'
    or name ilike 'George Aleksanyan%'
    or name ilike 'Vahan%'
    or name ilike 'Arthur%'
 order by name;
