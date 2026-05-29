-- Remove the entire email-verification subsystem. The self-hosted SMTP probe
-- it relied on never worked reliably; user decision is to drop everything.

-- Unschedule the cron job that called the verifier every 15 minutes.
SELECT cron.unschedule('mkt-email-verifier');

-- Drop indexes that referenced the verification columns.
DROP INDEX IF EXISTS public.idx_contacts_email_unverified;
DROP INDEX IF EXISTS public.idx_contacts_email_verification_status;

-- Drop the verification columns from contacts. Existing bounce-tracking column
-- (email_bounce_type) is unrelated and stays in place.
ALTER TABLE public.contacts
  DROP COLUMN IF EXISTS email_verification_status,
  DROP COLUMN IF EXISTS email_verification_provider,
  DROP COLUMN IF EXISTS email_verified_at;
