-- Rename the Main dashboard label to "Appraiser" to match the new tab
-- taxonomy. The 'main' code itself stays the same (used by workflow_stage
-- + API routes); only the display label changes.
--
-- "New Assignments" and "All" are UI-only virtual tabs — no DB rows needed
-- for them. They're prepended / appended in useUserDashboards().

update public.dashboard_configs
   set label = 'Appraiser',
       description = 'Claims assigned to an appraiser (actively working the report)'
 where code = 'main';
