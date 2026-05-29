
-- Create import status enum
CREATE TYPE import_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'partial', 'cancelled', 'reverted');

-- Enhanced import history tracking
CREATE TABLE bulk_import_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  table_name TEXT NOT NULL,
  file_name TEXT NOT NULL,
  status import_status DEFAULT 'pending',
  total_records INTEGER NOT NULL,
  processed_records INTEGER DEFAULT 0,
  successful_records INTEGER DEFAULT 0,
  failed_records INTEGER DEFAULT 0,
  current_batch INTEGER DEFAULT 0,
  total_batches INTEGER NOT NULL,
  error_log JSONB DEFAULT '[]',
  can_revert BOOLEAN DEFAULT true,
  reverted_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Track inserted records for revert capability
CREATE TABLE bulk_import_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  import_id UUID NOT NULL REFERENCES bulk_import_history(id) ON DELETE CASCADE,
  record_id UUID NOT NULL,
  table_name TEXT NOT NULL,
  row_number INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Staging table for hybrid processing
CREATE TABLE import_staging (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  import_id UUID NOT NULL,
  row_number INTEGER NOT NULL,
  raw_data JSONB NOT NULL,
  processed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_bulk_import_history_org ON bulk_import_history(org_id);
CREATE INDEX idx_bulk_import_history_user ON bulk_import_history(user_id);
CREATE INDEX idx_bulk_import_history_status ON bulk_import_history(status);
CREATE INDEX idx_bulk_import_records_import ON bulk_import_records(import_id);
CREATE INDEX idx_import_staging_import ON import_staging(import_id);
CREATE INDEX idx_import_staging_processed ON import_staging(import_id, processed);

-- Enable RLS
ALTER TABLE bulk_import_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulk_import_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_staging ENABLE ROW LEVEL SECURITY;

-- RLS Policies for bulk_import_history
CREATE POLICY "Users can view their org imports"
ON bulk_import_history FOR SELECT
USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Users can create imports in their org"
ON bulk_import_history FOR INSERT
WITH CHECK (org_id = get_user_org_id(auth.uid()) AND user_id = auth.uid());

CREATE POLICY "Users can update their own imports"
ON bulk_import_history FOR UPDATE
USING (org_id = get_user_org_id(auth.uid()) AND user_id = auth.uid());

CREATE POLICY "Service role full access to bulk_import_history"
ON bulk_import_history FOR ALL
USING (true)
WITH CHECK (true);

-- RLS Policies for bulk_import_records
CREATE POLICY "Users can view their org import records"
ON bulk_import_records FOR SELECT
USING (EXISTS (
  SELECT 1 FROM bulk_import_history h 
  WHERE h.id = bulk_import_records.import_id 
  AND h.org_id = get_user_org_id(auth.uid())
));

CREATE POLICY "Service role full access to bulk_import_records"
ON bulk_import_records FOR ALL
USING (true)
WITH CHECK (true);

-- RLS Policies for import_staging
CREATE POLICY "Service role full access to import_staging"
ON import_staging FOR ALL
USING (true)
WITH CHECK (true);

-- PostgreSQL function for hybrid bulk import processing
CREATE OR REPLACE FUNCTION process_bulk_import_batch(
  p_import_id UUID,
  p_table_name TEXT,
  p_org_id UUID,
  p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_record RECORD;
  v_new_record_id UUID;
  v_processed INTEGER := 0;
  v_inserted INTEGER := 0;
  v_failed INTEGER := 0;
  v_skipped INTEGER := 0;
  v_errors JSONB := '[]'::JSONB;
BEGIN
  FOR v_record IN 
    SELECT * FROM import_staging 
    WHERE import_id = p_import_id AND NOT processed
    ORDER BY row_number
  LOOP
    BEGIN
      CASE p_table_name
        WHEN 'contacts' THEN
          INSERT INTO contacts (
            org_id, created_by, first_name, last_name, email, phone, 
            company, job_title, source, status, address, city, state, country, postal_code, notes
          ) 
          VALUES (
            p_org_id,
            p_user_id,
            COALESCE(v_record.raw_data->>'first_name', ''),
            v_record.raw_data->>'last_name',
            v_record.raw_data->>'email',
            v_record.raw_data->>'phone',
            v_record.raw_data->>'company',
            v_record.raw_data->>'job_title',
            COALESCE(v_record.raw_data->>'source', 'bulk_import'),
            COALESCE(v_record.raw_data->>'status', 'new'),
            v_record.raw_data->>'address',
            v_record.raw_data->>'city',
            v_record.raw_data->>'state',
            v_record.raw_data->>'country',
            v_record.raw_data->>'postal_code',
            v_record.raw_data->>'notes'
          )
          ON CONFLICT DO NOTHING
          RETURNING id INTO v_new_record_id;

        WHEN 'inventory' THEN
          INSERT INTO inventory_items (
            org_id, created_by, import_job_id, item_id_sku, item_name, 
            uom, available_qty, selling_price, pending_po, pending_so, amount
          )
          VALUES (
            p_org_id,
            p_user_id,
            p_import_id,
            v_record.raw_data->>'item_id_sku',
            v_record.raw_data->>'item_name',
            v_record.raw_data->>'uom',
            COALESCE((v_record.raw_data->>'available_qty')::numeric, 0),
            (v_record.raw_data->>'selling_price')::numeric,
            COALESCE((v_record.raw_data->>'pending_po')::integer, 0),
            COALESCE((v_record.raw_data->>'pending_so')::integer, 0),
            COALESCE((v_record.raw_data->>'amount')::numeric, 0)
          )
          ON CONFLICT (org_id, item_id_sku) DO UPDATE SET
            item_name = EXCLUDED.item_name,
            uom = EXCLUDED.uom,
            available_qty = EXCLUDED.available_qty,
            selling_price = EXCLUDED.selling_price,
            pending_po = EXCLUDED.pending_po,
            pending_so = EXCLUDED.pending_so,
            amount = EXCLUDED.amount,
            updated_at = now()
          RETURNING id INTO v_new_record_id;

        WHEN 'redefine_repository' THEN
          INSERT INTO redefine_data_repository (
            org_id, created_by, email, first_name, last_name, phone,
            company, job_title, source, linkedin_url, city, state, country
          )
          VALUES (
            p_org_id,
            p_user_id,
            v_record.raw_data->>'email',
            v_record.raw_data->>'first_name',
            v_record.raw_data->>'last_name',
            v_record.raw_data->>'phone',
            v_record.raw_data->>'company',
            v_record.raw_data->>'job_title',
            COALESCE(v_record.raw_data->>'source', 'bulk_import'),
            v_record.raw_data->>'linkedin_url',
            v_record.raw_data->>'city',
            v_record.raw_data->>'state',
            v_record.raw_data->>'country'
          )
          ON CONFLICT DO NOTHING
          RETURNING id INTO v_new_record_id;

        ELSE
          -- Unsupported table
          v_failed := v_failed + 1;
          v_errors := v_errors || jsonb_build_object(
            'row', v_record.row_number,
            'error', 'Unsupported table: ' || p_table_name
          );
          CONTINUE;
      END CASE;

      -- Track the inserted record for revert capability
      IF v_new_record_id IS NOT NULL THEN
        INSERT INTO bulk_import_records (import_id, record_id, table_name, row_number)
        VALUES (p_import_id, v_new_record_id, p_table_name, v_record.row_number);
        v_inserted := v_inserted + 1;
      ELSE
        v_skipped := v_skipped + 1;
      END IF;

      -- Mark as processed
      UPDATE import_staging SET processed = true WHERE id = v_record.id;
      v_processed := v_processed + 1;

    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      v_errors := v_errors || jsonb_build_object(
        'row', v_record.row_number,
        'error', SQLERRM
      );
      -- Mark as processed even on error
      UPDATE import_staging SET processed = true WHERE id = v_record.id;
      v_processed := v_processed + 1;
    END;
  END LOOP;

  -- Clean up staging records for this import
  DELETE FROM import_staging WHERE import_id = p_import_id;

  RETURN jsonb_build_object(
    'processed', v_processed,
    'inserted', v_inserted,
    'skipped', v_skipped,
    'failed', v_failed,
    'errors', v_errors
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Function to revert an import
CREATE OR REPLACE FUNCTION revert_bulk_import(
  p_import_id UUID,
  p_org_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_record RECORD;
  v_deleted INTEGER := 0;
  v_table_name TEXT;
BEGIN
  -- Get the table name
  SELECT table_name INTO v_table_name 
  FROM bulk_import_history 
  WHERE id = p_import_id AND org_id = p_org_id;

  IF v_table_name IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Import not found');
  END IF;

  -- Delete all records from the import
  FOR v_record IN 
    SELECT record_id FROM bulk_import_records 
    WHERE import_id = p_import_id
  LOOP
    CASE v_table_name
      WHEN 'contacts' THEN
        DELETE FROM contacts WHERE id = v_record.record_id AND org_id = p_org_id;
      WHEN 'inventory' THEN
        DELETE FROM inventory_items WHERE id = v_record.record_id AND org_id = p_org_id;
      WHEN 'redefine_repository' THEN
        DELETE FROM redefine_data_repository WHERE id = v_record.record_id AND org_id = p_org_id;
    END CASE;
    v_deleted := v_deleted + 1;
  END LOOP;

  -- Update import history
  UPDATE bulk_import_history 
  SET status = 'reverted', reverted_at = now(), can_revert = false, updated_at = now()
  WHERE id = p_import_id;

  -- Clean up import records
  DELETE FROM bulk_import_records WHERE import_id = p_import_id;

  RETURN jsonb_build_object('success', true, 'deleted', v_deleted);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
