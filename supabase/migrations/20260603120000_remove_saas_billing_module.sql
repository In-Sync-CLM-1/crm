-- Remove the SaaS / Razorpay subscription + wallet billing module.
-- This CRM is internal and never bills via Razorpay, so the subscription,
-- payment, and wallet machinery is dead weight.
--
-- INTENTIONALLY KEPT (these are separate product features, NOT SaaS billing):
--   * Client invoicing: billing_documents, billing_document_items, billing_payments,
--     billing_settings, client_invoices, invoice_imports, gst_payment_tracking
--   * Revenue / sales actuals: monthly_actuals_snapshot, carry_forward_snapshot
--   * Usage metering: service_usage_logs (kept; only its wallet FK is removed)
--
-- Pre-checked: no view and no kept-table FK depends on these tables except
-- service_usage_logs.wallet_transaction_id (dropped below). No kept trigger calls
-- the dropped functions.

-- 1. Release the only external FK into the drop set (kept table -> wallet_transactions).
alter table if exists public.service_usage_logs
  drop constraint if exists service_usage_logs_wallet_transaction_id_fkey;

-- 2. Drop SaaS-billing RPCs (no longer referenced by any edge function or trigger).
drop function if exists public.deduct_from_wallet(uuid, numeric, text, uuid, numeric, numeric, uuid);
drop function if exists public.get_active_pricing();
drop function if exists public.check_and_update_subscription_status(uuid);

-- 3. Drop the SaaS-billing tables (near-empty; CASCADE clears their own
--    policies/triggers and any inter-table FKs within this set).
drop table if exists public.subscription_audit_log     cascade;
drop table if exists public.subscription_notifications cascade;
drop table if exists public.subscription_invoices      cascade;
drop table if exists public.payment_transactions       cascade;
drop table if exists public.wallet_transactions        cascade;
drop table if exists public.subscription_pricing       cascade;
drop table if exists public.organization_subscriptions cascade;
