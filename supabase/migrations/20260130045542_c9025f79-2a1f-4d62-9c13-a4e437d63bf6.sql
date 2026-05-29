-- Fix the function that was broken by the previous migration
-- Restore the name-based stage matching and add GST to invoiced amount
DROP FUNCTION IF EXISTS public.get_monthly_actuals_optimized(uuid, integer);

CREATE OR REPLACE FUNCTION public.get_monthly_actuals_optimized(_org_id uuid, _year integer)
RETURNS TABLE(
  month integer, 
  qualified bigint,
  proposals bigint, 
  deals bigint,
  invoiced numeric, 
  received numeric, 
  invoiced_invoice_ids uuid[], 
  received_invoice_ids uuid[],
  qualified_contact_ids uuid[],
  proposal_contact_ids uuid[],
  deal_contact_ids uuid[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  qualified_stage_ids uuid[];
  proposal_stage_ids uuid[];
  deal_stage_ids uuid[];
BEGIN
  -- Get stage IDs for qualified stages (demo, qualified)
  SELECT array_agg(id) INTO qualified_stage_ids
  FROM pipeline_stages
  WHERE org_id = _org_id
    AND (lower(name) LIKE '%demo%' OR lower(name) LIKE '%qualified%');

  -- Get stage IDs for proposal stages (proposal, quote, quotation)
  SELECT array_agg(id) INTO proposal_stage_ids
  FROM pipeline_stages
  WHERE org_id = _org_id
    AND (lower(name) LIKE '%proposal%' OR lower(name) LIKE '%quote%' OR lower(name) LIKE '%quotation%');

  -- Get stage IDs for deal stages (won, deal, negotiation)
  SELECT array_agg(id) INTO deal_stage_ids
  FROM pipeline_stages
  WHERE org_id = _org_id
    AND (lower(name) LIKE '%won%' OR lower(name) LIKE '%deal%' OR lower(name) LIKE '%negotiation%');

  RETURN QUERY
  WITH months AS (
    SELECT generate_series(1, 12) AS m
  ),
  pipeline_qualified AS (
    SELECT 
      EXTRACT(MONTH FROM pmh.moved_at)::integer AS m,
      COUNT(DISTINCT pmh.contact_id) AS cnt,
      array_agg(DISTINCT pmh.contact_id) AS contact_ids
    FROM pipeline_movement_history pmh
    WHERE pmh.org_id = _org_id
      AND EXTRACT(YEAR FROM pmh.moved_at) = _year
      AND pmh.to_stage_id = ANY(COALESCE(qualified_stage_ids, ARRAY[]::uuid[]))
    GROUP BY EXTRACT(MONTH FROM pmh.moved_at)
  ),
  pipeline_proposals AS (
    SELECT 
      EXTRACT(MONTH FROM pmh.moved_at)::integer AS m,
      COUNT(DISTINCT pmh.contact_id) AS cnt,
      array_agg(DISTINCT pmh.contact_id) AS contact_ids
    FROM pipeline_movement_history pmh
    WHERE pmh.org_id = _org_id
      AND EXTRACT(YEAR FROM pmh.moved_at) = _year
      AND pmh.to_stage_id = ANY(COALESCE(proposal_stage_ids, ARRAY[]::uuid[]))
    GROUP BY EXTRACT(MONTH FROM pmh.moved_at)
  ),
  pipeline_deals AS (
    SELECT 
      EXTRACT(MONTH FROM pmh.moved_at)::integer AS m,
      COUNT(DISTINCT pmh.contact_id) AS cnt,
      array_agg(DISTINCT pmh.contact_id) AS contact_ids
    FROM pipeline_movement_history pmh
    WHERE pmh.org_id = _org_id
      AND EXTRACT(YEAR FROM pmh.moved_at) = _year
      AND pmh.to_stage_id = ANY(COALESCE(deal_stage_ids, ARRAY[]::uuid[]))
    GROUP BY EXTRACT(MONTH FROM pmh.moved_at)
  ),
  -- FIXED: Include GST (tax_amount) in invoiced total
  invoiced_data AS (
    SELECT 
      EXTRACT(MONTH FROM invoice_date)::integer AS m,
      SUM(amount + COALESCE(tax_amount, 0)) AS total,
      array_agg(id) AS invoice_ids
    FROM client_invoices
    WHERE org_id = _org_id
      AND EXTRACT(YEAR FROM invoice_date) = _year
      AND document_type = 'invoice'
    GROUP BY EXTRACT(MONTH FROM invoice_date)
  ),
  received_data AS (
    SELECT 
      EXTRACT(MONTH FROM payment_received_date)::integer AS m,
      SUM(COALESCE(net_received_amount, actual_payment_received, amount)) AS total,
      array_agg(id) AS invoice_ids
    FROM client_invoices
    WHERE org_id = _org_id
      AND EXTRACT(YEAR FROM payment_received_date) = _year
      AND status = 'paid'
      AND document_type = 'invoice'
    GROUP BY EXTRACT(MONTH FROM payment_received_date)
  )
  SELECT 
    months.m AS month,
    COALESCE(pq.cnt, 0) AS qualified,
    COALESCE(pp.cnt, 0) AS proposals,
    COALESCE(pd.cnt, 0) AS deals,
    COALESCE(inv.total, 0) AS invoiced,
    COALESCE(rec.total, 0) AS received,
    COALESCE(inv.invoice_ids, ARRAY[]::uuid[]) AS invoiced_invoice_ids,
    COALESCE(rec.invoice_ids, ARRAY[]::uuid[]) AS received_invoice_ids,
    COALESCE(pq.contact_ids, ARRAY[]::uuid[]) AS qualified_contact_ids,
    COALESCE(pp.contact_ids, ARRAY[]::uuid[]) AS proposal_contact_ids,
    COALESCE(pd.contact_ids, ARRAY[]::uuid[]) AS deal_contact_ids
  FROM months
  LEFT JOIN pipeline_qualified pq ON pq.m = months.m
  LEFT JOIN pipeline_proposals pp ON pp.m = months.m
  LEFT JOIN pipeline_deals pd ON pd.m = months.m
  LEFT JOIN invoiced_data inv ON inv.m = months.m
  LEFT JOIN received_data rec ON rec.m = months.m
  ORDER BY months.m;
END;
$$;