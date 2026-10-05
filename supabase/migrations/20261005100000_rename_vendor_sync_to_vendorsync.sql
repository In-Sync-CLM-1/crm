-- The product label is now "Vendorsync" (one word) everywhere it is stored.
-- Replaces both earlier spellings, "Vendor Verification" and "Vendor-Sync".
-- Idempotent.
UPDATE public.li_prospects SET matched_product = 'Vendorsync' WHERE matched_product IN ('Vendor Verification', 'Vendor-Sync');
UPDATE public.li_connection_messages SET matched_product = 'Vendorsync' WHERE matched_product IN ('Vendor Verification', 'Vendor-Sync');
UPDATE public.li_connection_messages
   SET message_text = replace(replace(message_text, 'Vendor Verification', 'Vendorsync'), 'Vendor-Sync', 'Vendorsync')
 WHERE status IN ('pending','approved') AND (message_text LIKE '%Vendor Verification%' OR message_text LIKE '%Vendor-Sync%');
UPDATE public.li_prospects
   SET reason = replace(replace(reason, 'Vendor Verification', 'Vendorsync'), 'Vendor-Sync', 'Vendorsync')
 WHERE reason LIKE '%Vendor Verification%' OR reason LIKE '%Vendor-Sync%';
UPDATE public.chart_of_accounts SET name = 'Revenue - Vendorsync' WHERE name IN ('Revenue - Vendor Verification', 'Revenue - Vendor-Sync');

-- Live marketing content that carries the product name (templates, scripts,
-- product record, campaign name). Historical content (sent messages, logs,
-- transcripts, blog posts, digests) and machine identifiers (product_key,
-- URLs, WhatsApp template_name) are left as written.
UPDATE public.mkt_products SET
  product_name  = regexp_replace(product_name,  'Vendor Verification|Vendor-Sync|vendor verification', 'Vendorsync', 'g'),
  product_notes = regexp_replace(product_notes, 'Vendor Verification|Vendor-Sync|vendor verification', 'Vendorsync', 'g')
 WHERE product_name ~ 'Vendor Verification|Vendor-Sync|vendor verification' OR product_notes ~ 'Vendor Verification|Vendor-Sync|vendor verification';
UPDATE public.mkt_campaigns SET name = regexp_replace(name, 'Vendor Verification|Vendor-Sync|vendor verification', 'Vendorsync', 'g')
 WHERE name ~ 'Vendor Verification|Vendor-Sync|vendor verification';
UPDATE public.mkt_call_scripts SET
  name       = regexp_replace(name,       'Vendor Verification|Vendor-Sync|vendor verification', 'Vendorsync', 'g'),
  objective  = regexp_replace(objective,  'Vendor Verification|Vendor-Sync|vendor verification', 'Vendorsync', 'g'),
  opening    = regexp_replace(opening,    'Vendor Verification|Vendor-Sync|vendor verification', 'Vendorsync', 'g'),
  key_points = regexp_replace(key_points::text, 'Vendor Verification|Vendor-Sync|vendor verification', 'Vendorsync', 'g')::jsonb,
  objection_handling = regexp_replace(objection_handling::text, 'Vendor Verification|Vendor-Sync|vendor verification', 'Vendorsync', 'g')::jsonb;
UPDATE public.mkt_whatsapp_templates SET
  name = regexp_replace(name, 'Vendor Verification|Vendor-Sync|vendor verification', 'Vendorsync', 'g'),
  body = regexp_replace(body, 'Vendor Verification|Vendor-Sync|vendor verification', 'Vendorsync', 'g')
 WHERE name ~ 'Vendor Verification|Vendor-Sync|vendor verification' OR body ~ 'Vendor Verification|Vendor-Sync|vendor verification';
UPDATE public.mkt_email_templates SET
  name      = regexp_replace(name,      'Vendor Verification|Vendor-Sync|vendor verification', 'Vendorsync', 'g'),
  subject   = regexp_replace(subject,   'Vendor Verification|Vendor-Sync|vendor verification', 'Vendorsync', 'g'),
  body_html = regexp_replace(body_html, 'Vendor Verification|Vendor-Sync|vendor verification', 'Vendorsync', 'g'),
  body_text = regexp_replace(body_text, 'Vendor Verification|Vendor-Sync|vendor verification', 'Vendorsync', 'g')
 WHERE concat_ws(' ', name, subject, body_html, body_text) ~ 'Vendor Verification|Vendor-Sync|vendor verification';
