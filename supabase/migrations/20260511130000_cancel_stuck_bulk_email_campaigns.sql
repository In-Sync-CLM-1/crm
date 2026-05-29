-- Cancel four bulk-email campaigns that have been stuck in status='sending'
-- since Nov-Dec 2025. None of their recipients ever received an actual send
-- attempt (the bulk-email pipeline was never operational for this org —
-- email_settings is empty, and the real outbound runs through the marketing
-- engine on mkt_sequence_actions instead).
--
-- Also resets the per-campaign counters, which had been inflated by an older
-- code path (e.g. sent_count = 600 against total_recipients = 498).
-- Recipient rows are left as 'pending' so they remain a truthful record that
-- those addresses were queued but never dispatched.
--
-- Idempotent: re-running rewrites the same values from the recipient table.

update public.email_bulk_campaigns c
set
  status = 'failed',
  completed_at = coalesce(c.completed_at, now()),
  sent_count    = (select count(*) from public.email_campaign_recipients r where r.campaign_id = c.id and r.status = 'sent'),
  failed_count  = (select count(*) from public.email_campaign_recipients r where r.campaign_id = c.id and r.status = 'failed'),
  pending_count = (select count(*) from public.email_campaign_recipients r where r.campaign_id = c.id and r.status = 'pending')
where c.id in (
  '242683cd-8b29-40f1-acae-e108b09e78d4',  -- Email 1B            (started 2025-12-09, 500 recipients)
  '54dc7d6b-d097-49d2-b1ab-0ed52e6948c5',  -- Email Campaign 1 - A (started 2025-11-19, 498 recipients)
  '6c88da37-d075-4377-9baa-2239c3fd8848',  -- Email 1 A 500       (started 2025-11-19, 498 recipients)
  'ef6e0cdf-66ec-4996-af13-4c5cc495c2cc'   -- Drip 1 A 10 Nov 2025 (started 2025-11-10, 500 recipients)
);
