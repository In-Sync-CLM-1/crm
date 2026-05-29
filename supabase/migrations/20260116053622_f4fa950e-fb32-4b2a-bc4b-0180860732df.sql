-- Update function to include invoice IDs for drill-down
DROP FUNCTION IF EXISTS public.get_monthly_actuals_optimized(uuid, integer);

CREATE OR REPLACE FUNCTION public.get_monthly_actuals_optimized(_org_id uuid, _year integer)
RETURNS TABLE(
  month integer, 
  invoiced numeric, 
  received numeric,
  invoiced_invoice_ids uuid[],
  received_invoice_ids uuid[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH invoiced_data AS (
    SELECT 
      EXTRACT(MONTH FROM invoice_date)::integer as inv_month,
      COALESCE(SUM(amount), 0) as total_invoiced,
      ARRAY_AGG(id) as invoice_ids
    FROM client_invoices
    WHERE org_id = _org_id
      AND EXTRACT(YEAR FROM invoice_date) = _year
      AND status != 'cancelled'
    GROUP BY EXTRACT(MONTH FROM invoice_date)
  ),
  received_data AS (
    SELECT 
      EXTRACT(MONTH FROM payment_received_date)::integer as rec_month,
      COALESCE(SUM(
        CASE 
          WHEN actual_payment_received IS NOT NULL THEN actual_payment_received
          WHEN net_received_amount IS NOT NULL THEN net_received_amount
          ELSE amount + COALESCE(tax_amount, 0) - COALESCE(tds_amount, 0)
        END
      ), 0) as total_received,
      ARRAY_AGG(id) as invoice_ids
    FROM client_invoices
    WHERE org_id = _org_id
      AND EXTRACT(YEAR FROM payment_received_date) = _year
      AND status = 'paid'
      AND payment_received_date IS NOT NULL
    GROUP BY EXTRACT(MONTH FROM payment_received_date)
  ),
  months AS (
    SELECT generate_series(1, 12) as month_num
  )
  SELECT 
    m.month_num as month,
    COALESCE(i.total_invoiced, 0) as invoiced,
    COALESCE(r.total_received, 0) as received,
    COALESCE(i.invoice_ids, ARRAY[]::uuid[]) as invoiced_invoice_ids,
    COALESCE(r.invoice_ids, ARRAY[]::uuid[]) as received_invoice_ids
  FROM months m
  LEFT JOIN invoiced_data i ON m.month_num = i.inv_month
  LEFT JOIN received_data r ON m.month_num = r.rec_month
  ORDER BY m.month_num;
END;
$$;