DROP FUNCTION IF EXISTS public.get_monthly_actuals_optimized(uuid, integer);

CREATE OR REPLACE FUNCTION public.get_monthly_actuals_optimized(_org_id uuid, _year integer)
RETURNS TABLE(
  month integer,
  qualified numeric,
  proposals numeric,
  deals numeric,
  invoiced numeric,
  received numeric,
  qualified_contact_ids uuid[],
  proposal_contact_ids uuid[],
  deal_contact_ids uuid[],
  invoice_ids uuid[],
  received_invoice_ids uuid[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH months AS (
    SELECT generate_series(1, 12) AS m
  ),
  -- Get qualified leads by month (when they first moved to qualified stage)
  qualified_data AS (
    SELECT 
      EXTRACT(MONTH FROM pmh.moved_at)::integer AS m,
      COUNT(DISTINCT pmh.contact_id) AS total,
      array_agg(DISTINCT pmh.contact_id) AS contact_ids
    FROM pipeline_movement_history pmh
    JOIN pipeline_stages ps ON pmh.to_stage_id = ps.id
    WHERE pmh.org_id = _org_id
      AND EXTRACT(YEAR FROM pmh.moved_at) = _year
      AND ps.is_qualified = true
    GROUP BY EXTRACT(MONTH FROM pmh.moved_at)
  ),
  -- Get proposals sent by month
  proposal_data AS (
    SELECT 
      EXTRACT(MONTH FROM pmh.moved_at)::integer AS m,
      COUNT(DISTINCT pmh.contact_id) AS total,
      array_agg(DISTINCT pmh.contact_id) AS contact_ids
    FROM pipeline_movement_history pmh
    JOIN pipeline_stages ps ON pmh.to_stage_id = ps.id
    WHERE pmh.org_id = _org_id
      AND EXTRACT(YEAR FROM pmh.moved_at) = _year
      AND ps.is_proposal_sent = true
    GROUP BY EXTRACT(MONTH FROM pmh.moved_at)
  ),
  -- Get deals closed by month
  deal_data AS (
    SELECT 
      EXTRACT(MONTH FROM pmh.moved_at)::integer AS m,
      COUNT(DISTINCT pmh.contact_id) AS total,
      array_agg(DISTINCT pmh.contact_id) AS contact_ids
    FROM pipeline_movement_history pmh
    JOIN pipeline_stages ps ON pmh.to_stage_id = ps.id
    WHERE pmh.org_id = _org_id
      AND EXTRACT(YEAR FROM pmh.moved_at) = _year
      AND ps.is_deal_closed = true
    GROUP BY EXTRACT(MONTH FROM pmh.moved_at)
  ),
  -- Get invoiced amounts by month (including GST)
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
  -- Get received payments by month
  received_data AS (
    SELECT 
      EXTRACT(MONTH FROM payment_received_date)::integer AS m,
      SUM(COALESCE(net_received_amount, amount + COALESCE(tax_amount, 0) - COALESCE(tds_amount, 0))) AS total,
      array_agg(id) AS invoice_ids
    FROM client_invoices
    WHERE org_id = _org_id
      AND EXTRACT(YEAR FROM payment_received_date) = _year
      AND document_type = 'invoice'
      AND status = 'paid'
    GROUP BY EXTRACT(MONTH FROM payment_received_date)
  )
  SELECT 
    months.m AS month,
    COALESCE(qd.total, 0) AS qualified,
    COALESCE(pd.total, 0) AS proposals,
    COALESCE(dd.total, 0) AS deals,
    COALESCE(id.total, 0) AS invoiced,
    COALESCE(rd.total, 0) AS received,
    COALESCE(qd.contact_ids, ARRAY[]::uuid[]) AS qualified_contact_ids,
    COALESCE(pd.contact_ids, ARRAY[]::uuid[]) AS proposal_contact_ids,
    COALESCE(dd.contact_ids, ARRAY[]::uuid[]) AS deal_contact_ids,
    COALESCE(id.invoice_ids, ARRAY[]::uuid[]) AS invoice_ids,
    COALESCE(rd.invoice_ids, ARRAY[]::uuid[]) AS received_invoice_ids
  FROM months
  LEFT JOIN qualified_data qd ON months.m = qd.m
  LEFT JOIN proposal_data pd ON months.m = pd.m
  LEFT JOIN deal_data dd ON months.m = dd.m
  LEFT JOIN invoiced_data id ON months.m = id.m
  LEFT JOIN received_data rd ON months.m = rd.m
  ORDER BY months.m;
END;
$$;