-- =========================================================================
-- HamsPortal — Loss of Use (LOU) tool column (2026-10-04)
--
-- Adds a jsonb column to acv_history so the LOU tab inside the claim
-- workspace can auto-save its state alongside every other tool.
--
-- Shape (TypeScript LOUState in src/lib/acv/types.ts):
--   {
--     template: 'days' | 'hours',       -- which PDF template to fill
--     insuranceCompany: string,
--     insuranceAddress: string,
--     insurancePhone: string,
--     insuranceEmail: string,
--     ownerName: string,
--     ownerEmail: string,
--     ownerPhone: string,
--     adjusterName: string,
--     adjusterPhone: string,
--     adjusterEmail: string,
--     licensePlate: string,
--     licenseState: string,
--     dateUnitReceived: string,         -- YYYY-MM-DD
--     rentals: [
--       { description: string, dailyRate: number },
--       { description: string, dailyRate: number },
--       { description: string, dailyRate: number },
--     ],
--     days: number,                     -- used when template = 'days'
--     laborHours: number,               -- used when template = 'hours'
--     businessRepairDays: number,
--     weekends: number,
--     additionalDays: number,
--   }
--
-- Idempotent — safe to re-run.
-- =========================================================================

alter table public.acv_history
  add column if not exists lou jsonb;

-- Verification
select 'lou column exists' as label,
       count(*)::int as value
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'acv_history'
   and column_name = 'lou';
