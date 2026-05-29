-- Phase 1: Database Indexes for Performance
-- ==========================================

-- user_roles: heavily queried for role checks
CREATE INDEX IF NOT EXISTS idx_user_roles_org_id 
ON public.user_roles (org_id);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_org 
ON public.user_roles (user_id, org_id);

-- profiles: queried on every auth check
CREATE INDEX IF NOT EXISTS idx_profiles_id_org 
ON public.profiles (id, org_id);

CREATE INDEX IF NOT EXISTS idx_profiles_org_id 
ON public.profiles (org_id);

-- agent_call_sessions: dashboard queries
CREATE INDEX IF NOT EXISTS idx_agent_call_sessions_org_id 
ON public.agent_call_sessions (org_id);

-- outbound_webhooks: settings pages
CREATE INDEX IF NOT EXISTS idx_outbound_webhooks_org_id 
ON public.outbound_webhooks (org_id);

-- contact_activities: activity timeline queries
CREATE INDEX IF NOT EXISTS idx_contact_activities_org_contact 
ON public.contact_activities (org_id, contact_id, created_at DESC);

-- contacts: pipeline and listing queries
CREATE INDEX IF NOT EXISTS idx_contacts_org_stage 
ON public.contacts (org_id, pipeline_stage_id, created_at DESC);

-- tasks: task listing and filtering
CREATE INDEX IF NOT EXISTS idx_tasks_org_assigned 
ON public.tasks (org_id, assigned_to, status, due_date);

-- client_invoices: revenue calculations
CREATE INDEX IF NOT EXISTS idx_client_invoices_org_date 
ON public.client_invoices (org_id, invoice_date, status);

-- pipeline_movement_history: monthly actuals calculations
CREATE INDEX IF NOT EXISTS idx_pipeline_movement_org_stage 
ON public.pipeline_movement_history (org_id, to_stage_id, moved_at);

-- bulk_import_history: import history queries
CREATE INDEX IF NOT EXISTS idx_bulk_import_history_org 
ON public.bulk_import_history (org_id, created_at DESC);

-- Phase 7: PostgreSQL Functions for Data Aggregation
-- ===================================================

-- 7.1 get_monthly_actuals_optimized: Replace 72 round-trips with single query
CREATE OR REPLACE FUNCTION public.get_monthly_actuals_optimized(
  _org_id UUID,
  _year INT
) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result JSONB := '[]'::JSONB;
  month_data JSONB;
  m INT;
  frozen_data RECORD;
  won_stage_id UUID;
  start_date DATE;
  end_date DATE;
BEGIN
  -- Get the "Won" stage ID for this org
  SELECT id INTO won_stage_id
  FROM pipeline_stages
  WHERE org_id = _org_id AND LOWER(name) = 'won'
  LIMIT 1;
  
  FOR m IN 1..12 LOOP
    start_date := make_date(_year, m, 1);
    end_date := (start_date + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    
    -- Check for frozen snapshot first
    SELECT * INTO frozen_data
    FROM monthly_actuals_snapshot
    WHERE org_id = _org_id AND year = _year AND month = m;
    
    IF frozen_data IS NOT NULL THEN
      month_data := jsonb_build_object(
        'month', m,
        'isFrozen', true,
        'newLeads', frozen_data.new_leads_count,
        'qualifiedLeads', frozen_data.qualified_leads_count,
        'conversions', frozen_data.conversions_count,
        'revenue', frozen_data.revenue_amount,
        'contactIds', frozen_data.contact_ids,
        'invoiceIds', frozen_data.invoice_ids
      );
    ELSE
      -- Calculate live data using CTEs
      WITH new_leads AS (
        SELECT 
          COUNT(*) as count,
          COALESCE(array_agg(id), '{}') as contact_ids
        FROM contacts
        WHERE org_id = _org_id 
        AND created_at >= start_date 
        AND created_at < (end_date + INTERVAL '1 day')
      ),
      qualified_movements AS (
        SELECT 
          COUNT(DISTINCT pmh.contact_id) as count,
          COALESCE(array_agg(DISTINCT pmh.contact_id), '{}') as contact_ids
        FROM pipeline_movement_history pmh
        JOIN pipeline_stages ps ON pmh.to_stage_id = ps.id
        WHERE pmh.org_id = _org_id
        AND pmh.moved_at >= start_date
        AND pmh.moved_at < (end_date + INTERVAL '1 day')
        AND LOWER(ps.name) IN ('qualified', 'demo')
      ),
      conversions AS (
        SELECT 
          COUNT(DISTINCT pmh.contact_id) as count,
          COALESCE(array_agg(DISTINCT pmh.contact_id), '{}') as contact_ids
        FROM pipeline_movement_history pmh
        WHERE pmh.org_id = _org_id
        AND pmh.to_stage_id = won_stage_id
        AND pmh.moved_at >= start_date
        AND pmh.moved_at < (end_date + INTERVAL '1 day')
      ),
      revenue AS (
        SELECT 
          COALESCE(SUM(amount), 0) as total,
          COALESCE(array_agg(id), '{}') as invoice_ids
        FROM client_invoices
        WHERE org_id = _org_id
        AND invoice_date >= start_date
        AND invoice_date <= end_date
        AND status = 'paid'
      )
      SELECT jsonb_build_object(
        'month', m,
        'isFrozen', false,
        'newLeads', nl.count,
        'qualifiedLeads', qm.count,
        'conversions', cv.count,
        'revenue', rv.total,
        'contactIds', nl.contact_ids,
        'qualifiedContactIds', qm.contact_ids,
        'conversionContactIds', cv.contact_ids,
        'invoiceIds', rv.invoice_ids
      ) INTO month_data
      FROM new_leads nl, qualified_movements qm, conversions cv, revenue rv;
    END IF;
    
    result := result || month_data;
  END LOOP;
  
  RETURN result;
END;
$$;

-- 7.2 merge_clients_atomic: Transaction-safe client merge
CREATE OR REPLACE FUNCTION public.merge_clients_atomic(
  _primary_client_id UUID,
  _duplicate_client_ids UUID[],
  _org_id UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  deleted_count INT;
  docs_transferred INT;
  invoices_transferred INT;
  contacts_transferred INT;
BEGIN
  -- Verify primary client belongs to org
  IF NOT EXISTS (
    SELECT 1 FROM clients 
    WHERE id = _primary_client_id AND org_id = _org_id
  ) THEN
    RAISE EXCEPTION 'Primary client does not belong to organization';
  END IF;

  -- Verify all duplicate clients belong to org
  IF EXISTS (
    SELECT 1 FROM clients 
    WHERE id = ANY(_duplicate_client_ids) 
    AND org_id != _org_id
  ) THEN
    RAISE EXCEPTION 'One or more duplicate clients do not belong to organization';
  END IF;
  
  -- Verify primary is not in duplicates list
  IF _primary_client_id = ANY(_duplicate_client_ids) THEN
    RAISE EXCEPTION 'Primary client cannot be in the duplicates list';
  END IF;

  -- Transfer documents
  UPDATE client_documents 
  SET client_id = _primary_client_id, updated_at = NOW()
  WHERE client_id = ANY(_duplicate_client_ids);
  GET DIAGNOSTICS docs_transferred = ROW_COUNT;
  
  -- Transfer invoices
  UPDATE client_invoices 
  SET client_id = _primary_client_id, updated_at = NOW()
  WHERE client_id = ANY(_duplicate_client_ids);
  GET DIAGNOSTICS invoices_transferred = ROW_COUNT;
  
  -- Transfer alternate contacts
  UPDATE client_alternate_contacts 
  SET client_id = _primary_client_id, updated_at = NOW()
  WHERE client_id = ANY(_duplicate_client_ids);
  GET DIAGNOSTICS contacts_transferred = ROW_COUNT;
  
  -- Delete duplicates
  DELETE FROM clients 
  WHERE id = ANY(_duplicate_client_ids) AND org_id = _org_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN jsonb_build_object(
    'success', true,
    'deleted_count', deleted_count,
    'documents_transferred', docs_transferred,
    'invoices_transferred', invoices_transferred,
    'contacts_transferred', contacts_transferred
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- 7.3 bulk_delete_verified: Single-transaction bulk delete with verification
CREATE OR REPLACE FUNCTION public.bulk_delete_verified(
  _table_name TEXT,
  _record_ids UUID[],
  _org_id UUID,
  _user_id UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  deleted_count INT;
  valid_tables TEXT[] := ARRAY[
    'contacts', 'clients', 'tasks', 'client_invoices', 
    'client_documents', 'contact_activities', 'email_templates',
    'forms', 'teams', 'inventory_items', 'redefine_repository'
  ];
  records_in_org INT;
BEGIN
  -- Validate table name (prevent SQL injection)
  IF NOT (_table_name = ANY(valid_tables)) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid table name: ' || _table_name
    );
  END IF;
  
  -- Verify all records belong to org
  EXECUTE format(
    'SELECT COUNT(*) FROM %I WHERE id = ANY($1) AND org_id = $2',
    _table_name
  ) INTO records_in_org USING _record_ids, _org_id;
  
  IF records_in_org != array_length(_record_ids, 1) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Some records do not belong to the organization',
      'found', records_in_org,
      'requested', array_length(_record_ids, 1)
    );
  END IF;
  
  -- Delete records
  EXECUTE format(
    'DELETE FROM %I WHERE id = ANY($1) AND org_id = $2',
    _table_name
  ) USING _record_ids, _org_id;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN jsonb_build_object(
    'success', true,
    'deleted', deleted_count,
    'table', _table_name
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- 7.4 capture_carry_forward_optimized: Atomic carry-forward snapshot
CREATE OR REPLACE FUNCTION public.capture_carry_forward_optimized(
  _org_id UUID,
  _reference_year INT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  contact_ids UUID[];
  snapshot_id UUID;
  existing_snapshot_id UUID;
BEGIN
  -- Check existing snapshot
  SELECT id INTO existing_snapshot_id
  FROM carry_forward_snapshot 
  WHERE org_id = _org_id AND reference_year = _reference_year;
  
  IF existing_snapshot_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'exists', true,
      'id', existing_snapshot_id
    );
  END IF;
  
  -- Get qualified contacts created before reference year in single query
  SELECT COALESCE(array_agg(c.id), '{}') INTO contact_ids
  FROM contacts c
  JOIN pipeline_stages ps ON c.pipeline_stage_id = ps.id
  WHERE c.org_id = _org_id
  AND c.created_at < make_date(_reference_year, 1, 1)
  AND LOWER(ps.name) IN ('demo', 'qualified');
  
  -- Insert snapshot
  INSERT INTO carry_forward_snapshot (org_id, reference_year, qualified_contact_ids, captured_at)
  VALUES (_org_id, _reference_year, contact_ids, NOW())
  RETURNING id INTO snapshot_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'id', snapshot_id,
    'count', COALESCE(array_length(contact_ids, 1), 0)
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- Add RLS policy for bulk_import_history (allows removing edge function)
DROP POLICY IF EXISTS "Users can view their org import history" ON public.bulk_import_history;
CREATE POLICY "Users can view their org import history"
ON public.bulk_import_history
FOR SELECT
USING (
  org_id IN (
    SELECT org_id FROM profiles WHERE id = auth.uid()
  )
  OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_platform_admin = true)
);