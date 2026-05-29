-- Update create_organization_for_user function to automatically create subscription
CREATE OR REPLACE FUNCTION public.create_organization_for_user(
  p_user_id uuid,
  p_org_name text,
  p_org_slug text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org_id uuid;
  v_unique_slug text;
  v_per_user_cost NUMERIC;
BEGIN
  -- Generate unique slug if needed
  v_unique_slug := generate_unique_slug(p_org_slug);
  
  -- Create organization
  INSERT INTO public.organizations (name, slug)
  VALUES (p_org_name, v_unique_slug)
  RETURNING id INTO v_org_id;
  
  -- Update profile with org_id
  UPDATE public.profiles
  SET org_id = v_org_id
  WHERE id = p_user_id;
  
  -- Assign admin role
  INSERT INTO public.user_roles (user_id, org_id, role)
  VALUES (p_user_id, v_org_id, 'admin');
  
  -- Get per user cost from active pricing
  SELECT per_user_monthly_cost INTO v_per_user_cost
  FROM subscription_pricing
  WHERE is_active = true
  LIMIT 1;
  
  -- Create initial subscription with 5000 wallet balance for new orgs
  INSERT INTO public.organization_subscriptions (
    org_id,
    subscription_status,
    billing_cycle_start,
    next_billing_date,
    user_count,
    monthly_subscription_amount,
    wallet_balance,
    wallet_minimum_balance,
    wallet_auto_topup_enabled
  ) VALUES (
    v_org_id,
    'active',
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '1 month',
    1,
    COALESCE(v_per_user_cost, 500),
    5000,
    5000,
    true
  );
  
  -- Create default pipeline stages
  PERFORM create_default_pipeline_stages(v_org_id);
  
  -- Create default call dispositions
  PERFORM create_default_call_dispositions(v_org_id);
  
  RETURN v_org_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Organization name or URL is already taken';
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to create organization: %', SQLERRM;
END;
$$;