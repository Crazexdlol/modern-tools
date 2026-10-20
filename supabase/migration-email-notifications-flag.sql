-- Per-user opt-out for system-generated email notifications. Defaults to
-- true so every existing user is enabled by default; users can disable
-- themselves on My Profile, admins can disable on behalf of a user from
-- the admin user editor. All claim-trigger emails (assign / removed /
-- submitted / message) consult this flag before sending via
-- src/lib/email/claim-notifications.ts → loadRecipient().

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_notifications_enabled boolean NOT NULL DEFAULT true;
