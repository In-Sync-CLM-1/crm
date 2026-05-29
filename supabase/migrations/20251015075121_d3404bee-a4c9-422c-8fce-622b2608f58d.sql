-- =============================================
-- SUBSCRIPTION & BILLING SYSTEM - DATABASE SCHEMA
-- Phase 1: Tables, Functions, Triggers, RLS Policies
-- =============================================

-- 1. SUBSCRIPTION PRICING TABLE
-- Platform-level pricing configuration
CREATE TABLE IF NOT EXISTS public.subscription_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  one_time_setup_cost NUMERIC NOT NULL DEFAULT 2000,
  per_user_monthly_cost NUMERIC NOT NULL DEFAULT 500,
  min_wallet_balance NUMERIC NOT NULL DEFAULT 5000,
  email_cost_per_unit NUMERIC NOT NULL DEFAULT 1,
  whatsapp_cost_per_unit NUMERIC NOT NULL DEFAULT 0.50,
  call_cost_per_minute NUMERIC NOT NULL DEFAULT 2,
  call_cost_per_call NUMERIC, -- Optional flat rate per call
  auto_topup_amount NUMERIC NOT NULL DEFAULT 5000,
  auto_topup_enabled BOOLEAN DEFAULT true,
  gst_percentage NUMERIC NOT NULL DEFAULT 18,
  is_active BOOLEAN DEFAULT false, -- Only one can be active
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pricing_active ON public.subscription_pricing(is_active) WHERE is_active = true;

ALTER TABLE public.subscription_pricing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view active pricing"
ON public.subscription_pricing FOR SELECT
USING (true);

CREATE POLICY "Platform admins can manage pricing"
ON public.subscription_pricing FOR ALL
USING (is_platform_admin(auth.uid()))
WITH CHECK (is_platform_admin(auth.uid()));

-- 2. ORGANIZATION SUBSCRIPTIONS TABLE
-- Each org's subscription status
CREATE TABLE IF NOT EXISTS public.organization_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE UNIQUE NOT NULL,
  subscription_status TEXT NOT NULL DEFAULT 'active' 
    CHECK (subscription_status IN ('active', 'suspended_grace', 'suspended_readonly', 'suspended_locked', 'cancelled')),
  
  -- Billing cycle
  billing_cycle_start DATE NOT NULL,
  next_billing_date DATE NOT NULL,
  last_payment_date DATE,
  
  -- User count for billing
  user_count INTEGER NOT NULL DEFAULT 0,
  monthly_subscription_amount NUMERIC NOT NULL DEFAULT 0,
  
  -- Wallet (two-tier system)
  wallet_balance NUMERIC NOT NULL DEFAULT 0,
  wallet_minimum_balance NUMERIC NOT NULL DEFAULT 0, -- 0 for existing orgs, 5000 for new
  wallet_last_topup_date TIMESTAMPTZ,
  wallet_auto_topup_enabled BOOLEAN DEFAULT true,
  
  -- Suspension tracking
  suspension_date TIMESTAMPTZ,
  suspension_reason TEXT,
  grace_period_end DATE,
  readonly_period_end DATE,
  lockout_date DATE,
  
  -- Admin overrides
  suspension_override_until DATE,
  override_reason TEXT,
  override_by UUID REFERENCES auth.users(id),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_org_subs_org ON public.organization_subscriptions(org_id);
CREATE INDEX idx_org_subs_status ON public.organization_subscriptions(subscription_status);
CREATE INDEX idx_org_subs_billing_date ON public.organization_subscriptions(next_billing_date);

ALTER TABLE public.organization_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their org subscription"
ON public.organization_subscriptions FOR SELECT
USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Service role can manage all subscriptions"
ON public.organization_subscriptions FOR ALL
USING (true)
WITH CHECK (true);

CREATE POLICY "Platform admins can manage all subscriptions"
ON public.organization_subscriptions FOR ALL
USING (is_platform_admin(auth.uid()))
WITH CHECK (is_platform_admin(auth.uid()));

-- 3. SUBSCRIPTION INVOICES TABLE
-- Monthly invoices with GST
CREATE TABLE IF NOT EXISTS public.subscription_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  
  invoice_number TEXT UNIQUE NOT NULL,
  invoice_date DATE NOT NULL,
  due_date DATE NOT NULL,
  billing_period_start DATE NOT NULL,
  billing_period_end DATE NOT NULL,
  
  -- Line items
  setup_fee NUMERIC DEFAULT 0,
  base_subscription_amount NUMERIC NOT NULL,
  user_count INTEGER NOT NULL,
  prorated_amount NUMERIC DEFAULT 0,
  
  -- Totals
  subtotal NUMERIC NOT NULL,
  gst_amount NUMERIC NOT NULL,
  total_amount NUMERIC NOT NULL,
  
  paid_amount NUMERIC DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'pending' 
    CHECK (payment_status IN ('pending', 'paid', 'partially_paid', 'overdue', 'waived', 'cancelled')),
  
  paid_at TIMESTAMPTZ,
  waived_by UUID REFERENCES auth.users(id),
  waive_reason TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_invoices_org ON public.subscription_invoices(org_id);
CREATE INDEX idx_invoices_status ON public.subscription_invoices(payment_status);
CREATE INDEX idx_invoices_due_date ON public.subscription_invoices(due_date);
CREATE INDEX idx_invoices_number ON public.subscription_invoices(invoice_number);

ALTER TABLE public.subscription_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their org invoices"
ON public.subscription_invoices FOR SELECT
USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Service role can manage invoices"
ON public.subscription_invoices FOR ALL
USING (true)
WITH CHECK (true);

CREATE POLICY "Platform admins can manage all invoices"
ON public.subscription_invoices FOR ALL
USING (is_platform_admin(auth.uid()))
WITH CHECK (is_platform_admin(auth.uid()));

-- 4. PAYMENT TRANSACTIONS TABLE
-- All Razorpay payments
CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  invoice_id UUID REFERENCES public.subscription_invoices(id),
  
  transaction_type TEXT NOT NULL 
    CHECK (transaction_type IN ('subscription_payment', 'wallet_topup', 'wallet_auto_topup', 'refund')),
  
  amount NUMERIC NOT NULL,
  
  -- Razorpay details
  razorpay_order_id TEXT,
  razorpay_payment_id TEXT,
  razorpay_signature TEXT,
  
  payment_status TEXT NOT NULL DEFAULT 'initiated' 
    CHECK (payment_status IN ('initiated', 'processing', 'success', 'failed', 'refunded')),
  payment_method TEXT,
  
  initiated_by UUID REFERENCES auth.users(id),
  initiated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  
  failure_reason TEXT,
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payments_org ON public.payment_transactions(org_id);
CREATE INDEX idx_payments_invoice ON public.payment_transactions(invoice_id);
CREATE INDEX idx_payments_razorpay_order ON public.payment_transactions(razorpay_order_id);
CREATE INDEX idx_payments_status ON public.payment_transactions(payment_status);

ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their org transactions"
ON public.payment_transactions FOR SELECT
USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Users can create transactions for their org"
ON public.payment_transactions FOR INSERT
WITH CHECK (org_id = get_user_org_id(auth.uid()) AND initiated_by = auth.uid());

CREATE POLICY "Service role can manage transactions"
ON public.payment_transactions FOR ALL
USING (true)
WITH CHECK (true);

CREATE POLICY "Platform admins can view all transactions"
ON public.payment_transactions FOR SELECT
USING (is_platform_admin(auth.uid()));

-- 5. WALLET TRANSACTIONS TABLE
-- Wallet credits/debits
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  
  transaction_type TEXT NOT NULL 
    CHECK (transaction_type IN ('topup', 'auto_topup', 'deduction_email', 'deduction_whatsapp', 'deduction_call', 'refund', 'admin_adjustment')),
  
  amount NUMERIC NOT NULL,
  balance_before NUMERIC NOT NULL,
  balance_after NUMERIC NOT NULL,
  
  -- Reference to service usage
  reference_id UUID,
  reference_type TEXT,
  quantity INTEGER,
  unit_cost NUMERIC,
  
  payment_transaction_id UUID REFERENCES public.payment_transactions(id),
  
  description TEXT,
  
  -- Admin adjustments
  created_by UUID REFERENCES auth.users(id),
  admin_reason TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_wallet_txn_org ON public.wallet_transactions(org_id);
CREATE INDEX idx_wallet_txn_type ON public.wallet_transactions(transaction_type);
CREATE INDEX idx_wallet_txn_reference ON public.wallet_transactions(reference_id, reference_type);
CREATE INDEX idx_wallet_txn_created ON public.wallet_transactions(created_at DESC);

ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their org wallet transactions"
ON public.wallet_transactions FOR SELECT
USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Service role can create wallet transactions"
ON public.wallet_transactions FOR INSERT
WITH CHECK (true);

CREATE POLICY "Platform admins can manage wallet transactions"
ON public.wallet_transactions FOR ALL
USING (is_platform_admin(auth.uid()))
WITH CHECK (is_platform_admin(auth.uid()));

-- 6. SERVICE USAGE LOGS TABLE
-- Granular usage tracking
CREATE TABLE IF NOT EXISTS public.service_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  
  service_type TEXT NOT NULL CHECK (service_type IN ('email', 'whatsapp', 'call')),
  reference_id UUID NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  
  quantity NUMERIC NOT NULL,
  cost NUMERIC NOT NULL,
  
  wallet_deducted BOOLEAN DEFAULT false,
  wallet_transaction_id UUID REFERENCES public.wallet_transactions(id),
  deduction_error TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_usage_org ON public.service_usage_logs(org_id);
CREATE INDEX idx_usage_service ON public.service_usage_logs(service_type);
CREATE INDEX idx_usage_reference ON public.service_usage_logs(reference_id);
CREATE INDEX idx_usage_created ON public.service_usage_logs(created_at DESC);

ALTER TABLE public.service_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own usage"
ON public.service_usage_logs FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Admins can view org usage"
ON public.service_usage_logs FOR SELECT
USING (org_id = get_user_org_id(auth.uid()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)));

CREATE POLICY "Service role can insert usage"
ON public.service_usage_logs FOR INSERT
WITH CHECK (true);

CREATE POLICY "Platform admins can view all usage"
ON public.service_usage_logs FOR SELECT
USING (is_platform_admin(auth.uid()));

-- 7. SUBSCRIPTION NOTIFICATIONS TABLE
-- Email notification tracking
CREATE TABLE IF NOT EXISTS public.subscription_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  
  notification_type TEXT NOT NULL 
    CHECK (notification_type IN (
      'invoice_generated', 'payment_due_reminder', 'payment_overdue',
      'grace_period_warning', 'readonly_warning', 'lockout_warning', 'account_locked',
      'wallet_low_balance', 'wallet_critical_balance', 'service_suspended_wallet',
      'payment_successful', 'services_restored', 'auto_topup_required'
    )),
  
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  recipient_emails TEXT[] NOT NULL,
  email_subject TEXT NOT NULL,
  
  invoice_id UUID REFERENCES public.subscription_invoices(id),
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_org ON public.subscription_notifications(org_id);
CREATE INDEX idx_notifications_type ON public.subscription_notifications(notification_type);
CREATE INDEX idx_notifications_sent ON public.subscription_notifications(sent_at DESC);

ALTER TABLE public.subscription_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages notifications"
ON public.subscription_notifications FOR ALL
USING (true)
WITH CHECK (true);

CREATE POLICY "Platform admins can view all notifications"
ON public.subscription_notifications FOR SELECT
USING (is_platform_admin(auth.uid()));

-- 8. SUBSCRIPTION AUDIT LOG TABLE
-- Admin action tracking
CREATE TABLE IF NOT EXISTS public.subscription_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id),
  
  action TEXT NOT NULL 
    CHECK (action IN (
      'pricing_updated', 'suspension_overridden', 'grace_period_extended',
      'payment_waived', 'wallet_adjusted', 'invoice_generated_manually',
      'subscription_created_manually'
    )),
  
  performed_by UUID REFERENCES auth.users(id) NOT NULL,
  target_record_id UUID,
  target_record_type TEXT,
  
  old_values JSONB,
  new_values JSONB,
  reason TEXT NOT NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_org ON public.subscription_audit_log(org_id);
CREATE INDEX idx_audit_performed_by ON public.subscription_audit_log(performed_by);
CREATE INDEX idx_audit_created ON public.subscription_audit_log(created_at DESC);

ALTER TABLE public.subscription_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can manage audit log"
ON public.subscription_audit_log FOR ALL
USING (is_platform_admin(auth.uid()))
WITH CHECK (is_platform_admin(auth.uid()));

CREATE POLICY "Service role can insert audit log"
ON public.subscription_audit_log FOR INSERT
WITH CHECK (true);

-- 9. MODIFY EXISTING ORGANIZATIONS TABLE
-- Add subscription-related columns
ALTER TABLE public.organizations 
ADD COLUMN IF NOT EXISTS subscription_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS services_enabled BOOLEAN DEFAULT true;

-- =============================================
-- DATABASE FUNCTIONS
-- =============================================

-- Function 1: Get active pricing
CREATE OR REPLACE FUNCTION public.get_active_pricing()
RETURNS TABLE (
  one_time_setup_cost NUMERIC,
  per_user_monthly_cost NUMERIC,
  min_wallet_balance NUMERIC,
  email_cost_per_unit NUMERIC,
  whatsapp_cost_per_unit NUMERIC,
  call_cost_per_minute NUMERIC,
  call_cost_per_call NUMERIC,
  auto_topup_amount NUMERIC,
  gst_percentage NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    one_time_setup_cost, per_user_monthly_cost, min_wallet_balance,
    email_cost_per_unit, whatsapp_cost_per_unit, call_cost_per_minute, call_cost_per_call,
    auto_topup_amount, gst_percentage
  FROM subscription_pricing
  WHERE is_active = true
  LIMIT 1;
$$;

-- Function 2: Calculate monthly amount
CREATE OR REPLACE FUNCTION public.calculate_monthly_amount(_org_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_count INT;
  per_user_cost NUMERIC;
  monthly_amount NUMERIC;
BEGIN
  SELECT COUNT(*) INTO user_count
  FROM profiles
  WHERE org_id = _org_id;
  
  SELECT per_user_monthly_cost INTO per_user_cost
  FROM subscription_pricing
  WHERE is_active = true
  LIMIT 1;
  
  monthly_amount := user_count * per_user_cost;
  
  RETURN monthly_amount;
END;
$$;

-- Function 3: Deduct from wallet (atomic operation with locking)
CREATE OR REPLACE FUNCTION public.deduct_from_wallet(
  _org_id UUID,
  _amount NUMERIC,
  _service_type TEXT,
  _reference_id UUID,
  _quantity NUMERIC,
  _unit_cost NUMERIC,
  _user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_balance NUMERIC;
  min_balance NUMERIC;
  new_balance NUMERIC;
  wallet_txn_id UUID;
  result JSONB;
BEGIN
  -- Get current wallet balance with row lock
  SELECT wallet_balance, wallet_minimum_balance INTO current_balance, min_balance
  FROM organization_subscriptions
  WHERE org_id = _org_id
  FOR UPDATE;
  
  -- Check if sufficient balance
  IF current_balance - _amount < min_balance THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'insufficient_wallet_balance',
      'current_balance', current_balance,
      'min_balance', min_balance
    );
  END IF;
  
  -- Calculate new balance
  new_balance := current_balance - _amount;
  
  -- Update wallet balance
  UPDATE organization_subscriptions
  SET wallet_balance = new_balance,
      updated_at = NOW()
  WHERE org_id = _org_id;
  
  -- Create wallet transaction
  INSERT INTO wallet_transactions (
    org_id, transaction_type, amount, balance_before, balance_after,
    reference_id, reference_type, quantity, unit_cost
  ) VALUES (
    _org_id, 
    CASE 
      WHEN _service_type = 'email' THEN 'deduction_email'
      WHEN _service_type = 'whatsapp' THEN 'deduction_whatsapp'
      WHEN _service_type = 'call' THEN 'deduction_call'
    END,
    -_amount, current_balance, new_balance,
    _reference_id, _service_type, _quantity, _unit_cost
  )
  RETURNING id INTO wallet_txn_id;
  
  -- Create usage log
  INSERT INTO service_usage_logs (
    org_id, service_type, reference_id, user_id,
    quantity, cost, wallet_deducted, wallet_transaction_id
  ) VALUES (
    _org_id, _service_type, _reference_id, _user_id,
    _quantity, _amount, true, wallet_txn_id
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'new_balance', new_balance,
    'wallet_transaction_id', wallet_txn_id
  );
END;
$$;

-- Function 4: Check and update subscription status
CREATE OR REPLACE FUNCTION public.check_and_update_subscription_status(_org_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sub RECORD;
  latest_invoice RECORD;
  days_overdue INT;
  new_status TEXT;
BEGIN
  -- Get subscription
  SELECT * INTO sub
  FROM organization_subscriptions
  WHERE org_id = _org_id;
  
  -- Skip if subscription override is active
  IF sub.suspension_override_until IS NOT NULL AND sub.suspension_override_until >= CURRENT_DATE THEN
    RETURN;
  END IF;
  
  -- Get latest unpaid invoice
  SELECT * INTO latest_invoice
  FROM subscription_invoices
  WHERE org_id = _org_id
    AND payment_status IN ('pending', 'overdue')
    AND due_date <= CURRENT_DATE
  ORDER BY due_date DESC
  LIMIT 1;
  
  -- If no overdue invoice, ensure status is active
  IF latest_invoice IS NULL THEN
    IF sub.subscription_status != 'active' THEN
      UPDATE organization_subscriptions
      SET subscription_status = 'active',
          suspension_date = NULL,
          suspension_reason = NULL,
          updated_at = NOW()
      WHERE org_id = _org_id;
      
      UPDATE organizations
      SET services_enabled = true
      WHERE id = _org_id;
    END IF;
    RETURN;
  END IF;
  
  -- Calculate days overdue
  days_overdue := CURRENT_DATE - latest_invoice.due_date;
  
  -- Determine new status
  IF days_overdue >= 0 AND days_overdue <= 3 THEN
    new_status := 'suspended_grace';
  ELSIF days_overdue >= 4 AND days_overdue <= 10 THEN
    new_status := 'suspended_readonly';
  ELSIF days_overdue >= 11 THEN
    new_status := 'suspended_locked';
  ELSE
    new_status := 'active';
  END IF;
  
  -- Update if status changed
  IF sub.subscription_status != new_status THEN
    UPDATE organization_subscriptions
    SET subscription_status = new_status,
        suspension_date = CASE WHEN new_status != 'active' THEN NOW() ELSE NULL END,
        suspension_reason = CASE WHEN new_status != 'active' 
          THEN 'Payment overdue for invoice ' || latest_invoice.invoice_number 
          ELSE NULL END,
        grace_period_end = latest_invoice.due_date + INTERVAL '3 days',
        readonly_period_end = latest_invoice.due_date + INTERVAL '10 days',
        lockout_date = latest_invoice.due_date + INTERVAL '11 days',
        updated_at = NOW()
    WHERE org_id = _org_id;
    
    -- Update organizations table
    UPDATE organizations
    SET services_enabled = CASE WHEN new_status = 'active' THEN true ELSE false END
    WHERE id = _org_id;
    
    -- Update invoice status
    IF new_status != 'active' THEN
      UPDATE subscription_invoices
      SET payment_status = 'overdue'
      WHERE id = latest_invoice.id;
    END IF;
  END IF;
END;
$$;