CREATE OR REPLACE FUNCTION public.get_monthly_actuals_optimized(_org_id uuid, _year integer)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  result JSONB := '[]'::JSONB;
  month_data JSONB;
  m INT;
  won_stage_id UUID;
  proposal_stage_ids UUID[];
  deal_stage_ids UUID[];
  qualified_stage_ids UUID[];
  start_date DATE;
  end_date DATE;
BEGIN
  -- Get the "Won" stage ID for this org
  SELECT id INTO won_stage_id
  FROM pipeline_stages
  WHERE org_id = _org_id AND LOWER(name) = 'won'
  LIMIT 1;
  
  -- Get proposal stage IDs (stages containing 'proposal' or 'quote')
  SELECT COALESCE(array_agg(id), '{}')
  INTO proposal_stage_ids
  FROM pipeline_stages
  WHERE org_id = _org_id 
  AND (LOWER(name) LIKE '%proposal%' OR LOWER(name) LIKE '%quote%' OR LOWER(name) LIKE '%quotation%');
  
  -- Get deal stage IDs (stages containing 'deal', 'negotiation', or 'won')
  SELECT COALESCE(array_agg(id), '{}')
  INTO deal_stage_ids
  FROM pipeline_stages
  WHERE org_id = _org_id 
  AND (LOWER(name) LIKE '%deal%' OR LOWER(name) LIKE '%negotiation%' OR LOWER(name) = 'won');
  
  -- Get qualified stage IDs (stages containing 'qualified' or 'demo')
  SELECT COALESCE(array_agg(id), '{}')
  INTO qualified_stage_ids
  FROM pipeline_stages
  WHERE org_id = _org_id 
  AND (LOWER(name) LIKE '%qualified%' OR LOWER(name) LIKE '%demo%');
  
  FOR m IN 1..12 LOOP
    start_date := make_date(_year, m, 1);
    end_date := (start_date + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    
    -- Calculate live data using CTEs
    WITH qualified_movements AS (
      SELECT 
        COUNT(DISTINCT pmh.contact_id) as count,
        COALESCE(array_agg(DISTINCT pmh.contact_id), '{}') as contact_ids
      FROM pipeline_movement_history pmh
      WHERE pmh.org_id = _org_id
      AND pmh.moved_at >= start_date
      AND pmh.moved_at < (end_date + INTERVAL '1 day')
      AND pmh.to_stage_id = ANY(qualified_stage_ids)
    ),
    proposal_movements AS (
      SELECT 
        COUNT(DISTINCT pmh.contact_id) as count,
        COALESCE(array_agg(DISTINCT pmh.contact_id), '{}') as contact_ids
      FROM pipeline_movement_history pmh
      WHERE pmh.org_id = _org_id
      AND pmh.moved_at >= start_date
      AND pmh.moved_at < (end_date + INTERVAL '1 day')
      AND pmh.to_stage_id = ANY(proposal_stage_ids)
    ),
    deal_movements AS (
      SELECT 
        COUNT(DISTINCT pmh.contact_id) as count,
        COALESCE(array_agg(DISTINCT pmh.contact_id), '{}') as contact_ids
      FROM pipeline_movement_history pmh
      WHERE pmh.org_id = _org_id
      AND pmh.moved_at >= start_date
      AND pmh.moved_at < (end_date + INTERVAL '1 day')
      AND pmh.to_stage_id = ANY(deal_stage_ids)
    ),
    invoiced_data AS (
      SELECT 
        COALESCE(SUM(amount), 0) as total,
        COALESCE(array_agg(id), '{}') as invoice_ids
      FROM client_invoices
      WHERE org_id = _org_id
      AND invoice_date >= start_date
      AND invoice_date <= end_date
      AND (document_type IS NULL OR document_type != 'quotation')
    ),
    received_data AS (
      SELECT 
        COALESCE(SUM(amount), 0) as total,
        COALESCE(array_agg(id), '{}') as invoice_ids
      FROM client_invoices
      WHERE org_id = _org_id
      AND payment_received_date >= start_date
      AND payment_received_date <= end_date
      AND status = 'paid'
      AND (document_type IS NULL OR document_type != 'quotation')
    )
    SELECT jsonb_build_object(
      'month', m,
      'qualified', qm.count,
      'qualified_contact_ids', qm.contact_ids,
      'proposals', pm.count,
      'proposal_contact_ids', pm.contact_ids,
      'deals', dm.count,
      'deal_contact_ids', dm.contact_ids,
      'invoiced', inv.total,
      'invoiced_invoice_ids', inv.invoice_ids,
      'received', rec.total,
      'received_invoice_ids', rec.invoice_ids
    ) INTO month_data
    FROM qualified_movements qm, proposal_movements pm, deal_movements dm, invoiced_data inv, received_data rec;
    
    result := result || month_data;
  END LOOP;
  
  RETURN jsonb_build_object(
    'monthly_actuals', result,
    'annual_totals', jsonb_build_object(
      'qualified', (SELECT COALESCE(SUM((elem->>'qualified')::int), 0) FROM jsonb_array_elements(result) elem),
      'proposals', (SELECT COALESCE(SUM((elem->>'proposals')::int), 0) FROM jsonb_array_elements(result) elem),
      'deals', (SELECT COALESCE(SUM((elem->>'deals')::int), 0) FROM jsonb_array_elements(result) elem),
      'invoiced', (SELECT COALESCE(SUM((elem->>'invoiced')::numeric), 0) FROM jsonb_array_elements(result) elem),
      'received', (SELECT COALESCE(SUM((elem->>'received')::numeric), 0) FROM jsonb_array_elements(result) elem)
    )
  );
END;
$$;