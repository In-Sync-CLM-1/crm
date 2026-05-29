-- Step 1: Delete all existing inventory data
TRUNCATE TABLE inventory_items;

-- Step 2: Drop unnecessary columns
ALTER TABLE inventory_items
  DROP COLUMN IF EXISTS brand,
  DROP COLUMN IF EXISTS category,
  DROP COLUMN IF EXISTS subcategory,
  DROP COLUMN IF EXISTS grade_class,
  DROP COLUMN IF EXISTS material,
  DROP COLUMN IF EXISTS finish_coating,
  DROP COLUMN IF EXISTS diameter_mm,
  DROP COLUMN IF EXISTS length_mm,
  DROP COLUMN IF EXISTS thread_pitch,
  DROP COLUMN IF EXISTS head_type,
  DROP COLUMN IF EXISTS drive_type,
  DROP COLUMN IF EXISTS standard_spec,
  DROP COLUMN IF EXISTS reorder_level,
  DROP COLUMN IF EXISTS reorder_qty,
  DROP COLUMN IF EXISTS storage_location,
  DROP COLUMN IF EXISTS warehouse_branch,
  DROP COLUMN IF EXISTS supplier_name,
  DROP COLUMN IF EXISTS supplier_code,
  DROP COLUMN IF EXISTS last_purchase_date,
  DROP COLUMN IF EXISTS last_purchase_price,
  DROP COLUMN IF EXISTS lead_time_days,
  DROP COLUMN IF EXISTS purchase_order_no,
  DROP COLUMN IF EXISTS discount_pct,
  DROP COLUMN IF EXISTS customer_project,
  DROP COLUMN IF EXISTS last_sale_date,
  DROP COLUMN IF EXISTS gst_pct,
  DROP COLUMN IF EXISTS hsn_code,
  DROP COLUMN IF EXISTS batch_no,
  DROP COLUMN IF EXISTS heat_no,
  DROP COLUMN IF EXISTS inspection_status,
  DROP COLUMN IF EXISTS certificate_no,
  DROP COLUMN IF EXISTS date_of_entry,
  DROP COLUMN IF EXISTS remarks_notes,
  DROP COLUMN IF EXISTS weight_per_unit,
  DROP COLUMN IF EXISTS image_ref,
  DROP COLUMN IF EXISTS expiry_review_date,
  DROP COLUMN IF EXISTS issued_to;

-- Step 3: Add new columns for simplified inventory management
ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS pending_po INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pending_so INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount NUMERIC(10,2) DEFAULT 0;