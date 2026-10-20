-- Rollback: restore the original Main label + description.

update public.dashboard_configs
   set label = 'Main',
       description = 'Active appraisal work'
 where code = 'main';
