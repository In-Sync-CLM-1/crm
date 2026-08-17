-- Purge the bought prospect dataset and the two dead lists derived from it.
--
-- 63,021 of 63,132 contacts carried source='native_dataset' — a bulk-loaded
-- prospect list, last added 2026-05-18, with nothing added since and nothing
-- live reading it: the founder-follow campaign sources from RMPL's master
-- table, BD outreach from bd_firms, and bulk WhatsApp/SMS have never sent a
-- campaign. The 111 real contacts stay, including all 13 that client records
-- point at (clients.contact_id is ON DELETE CASCADE, so the delete is also
-- guarded explicitly against them — losing a client row here would be
-- unrecoverable).
--
-- Approved by Amit 2026-08-17, with a gzipped export taken first.

-- 1. Keep the unsubscribe suppression. mkt_unsubscribes.lead_id is ON DELETE
--    CASCADE, so 71 opt-out records would vanish with their contact and those
--    people could be contacted again. The email is what suppression matches
--    on, so detach the row instead of losing it.
UPDATE public.mkt_unsubscribes
   SET lead_id = NULL
 WHERE lead_id IN (SELECT id FROM public.contacts WHERE source = 'native_dataset')
   AND email IS NOT NULL;

-- 2. Delete the dataset. Cascades take contact_emails / contact_phones /
--    contact_activities (63,021 each) plus the removed outreach engine's
--    mkt_sequence_enrollments (84,482) and mkt_conversation_memory (27,698).
DELETE FROM public.contacts
 WHERE source = 'native_dataset'
   AND id NOT IN (SELECT contact_id FROM public.clients WHERE contact_id IS NOT NULL);

-- 3. The two dead loops built from it.
--    platform_email_sending_list: 77,081 addresses rebuilt daily by
--    sync_platform_email_list, read by no code at all, and the cron feeding it
--    has been failing since 2026-06-01 anyway (its worker still authenticates
--    with a legacy key that was disabled).
--    mkt_native_contacts: 194,701 rows of the same bought dataset, also unread.
DROP FUNCTION IF EXISTS public.sync_platform_email_list();
DROP TABLE IF EXISTS public.platform_email_sending_list CASCADE;
DROP TABLE IF EXISTS public.mkt_native_contacts CASCADE;
