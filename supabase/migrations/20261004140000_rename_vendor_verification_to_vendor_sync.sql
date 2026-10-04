-- The product is called Vendor-Sync (rebranded 2026-07-17). Rename the old
-- "Vendor Verification" label wherever it is a stored label. Historical text
-- (sent messages, tickets, blog posts) is left as written. Idempotent.
UPDATE public.li_prospects SET matched_product = 'Vendor-Sync' WHERE matched_product = 'Vendor Verification';
UPDATE public.li_connection_messages SET matched_product = 'Vendor-Sync' WHERE matched_product = 'Vendor Verification';
UPDATE public.li_connection_messages
   SET message_text = replace(message_text, 'Vendor Verification', 'Vendor-Sync')
 WHERE status IN ('pending','approved') AND message_text LIKE '%Vendor Verification%';
UPDATE public.li_prospects
   SET reason = replace(reason, 'Vendor Verification', 'Vendor-Sync')
 WHERE status IN ('pending','approved') AND reason LIKE '%Vendor Verification%';
UPDATE public.chart_of_accounts SET name = 'Revenue - Vendor-Sync' WHERE name = 'Revenue - Vendor Verification';
