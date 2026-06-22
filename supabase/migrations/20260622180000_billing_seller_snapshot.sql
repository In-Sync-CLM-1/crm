-- Freeze the issuing company ("issued by" / seller) onto each billing document.
--
-- Previously the seller block on every document (invoice / proforma / credit note)
-- was rendered live from the single billing_settings row. When the company profile
-- was changed (ECR Technical Innovations Pvt Ltd → Prosync AI Solutions), every
-- historical document silently started showing the new entity, and credit notes
-- raised against old invoices inherited the wrong issuer.
--
-- seller_snapshot stores the issuer exactly as it was when the document was created,
-- so history is immutable and a credit note always carries the same issuing entity
-- as the invoice it is raised against. Shape mirrors billing_settings company fields:
--   { company_name, company_gstin, company_pan, company_state, company_state_code,
--     company_address, company_email, company_phone,
--     bank_name, bank_account_number, bank_ifsc, bank_branch, bank_upi_id,
--     logo_url, signature_url }
-- NULL means "no frozen issuer" → the UI falls back to current billing_settings
-- (so pre-existing docs keep working until backfilled).

ALTER TABLE public.billing_documents
  ADD COLUMN IF NOT EXISTS seller_snapshot JSONB;
