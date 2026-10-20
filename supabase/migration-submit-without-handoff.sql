-- Per-user flag: appraisers with this flag can submit a claim directly to QC
-- even when they are NOT the handling appraiser on the file. Normally the
-- "Submit" button on a non-handling-appraiser hands the claim off to the
-- handling appraiser first; this flag bypasses that handoff.
--
-- Default: false (preserve current behavior for everyone).
-- Henry seeds true for Henry Aleksanyan + George Aleksanyan after running
-- this via scripts/seed-submit-without-handoff.mjs.

alter table public.profiles
  add column if not exists can_submit_without_handoff boolean not null default false;

comment on column public.profiles.can_submit_without_handoff is
  'When true, this appraiser can click Submit for QC even when they are not the handling appraiser on the file (skips the Complete Report handoff).';
