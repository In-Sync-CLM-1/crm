-- Step 1: Add applies_to_table column to custom_fields table
ALTER TABLE custom_fields 
ADD COLUMN applies_to_table text;

-- Step 2: Categorize existing custom fields based on field names
-- Repository-specific fields
UPDATE custom_fields 
SET applies_to_table = 'redefine_data_repository'
WHERE field_name IN ('company_name', 'industry', 'annual_revenue', 
                     'headquarters_location', 'number_of_employees', 
                     'parent_company_/_subsidiary_info', 'linkedin_company_profile',
                     'website_url', 'billing_cycle', 'current_plan_/_subscription');

-- Inventory-specific fields
UPDATE custom_fields 
SET applies_to_table = 'inventory_items'
WHERE field_name IN ('available_qty', 'hsn_code', 'category', 'brand', 
                     'batch_no', 'diameter_mm', 'grade_class', 'heat_no');

-- All remaining fields default to contacts
UPDATE custom_fields 
SET applies_to_table = 'contacts'
WHERE applies_to_table IS NULL;

-- Step 3: Make column NOT NULL and add constraint
ALTER TABLE custom_fields 
ALTER COLUMN applies_to_table SET NOT NULL;

ALTER TABLE custom_fields
ADD CONSTRAINT check_applies_to_table 
CHECK (applies_to_table IN ('contacts', 'redefine_data_repository', 'inventory_items', 'all'));

-- Step 4: Create index for efficient filtering
CREATE INDEX idx_custom_fields_org_table 
ON custom_fields(org_id, applies_to_table, is_active);