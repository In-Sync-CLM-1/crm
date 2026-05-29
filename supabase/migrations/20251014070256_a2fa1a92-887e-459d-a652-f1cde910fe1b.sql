-- Make inventory columns nullable except item_id_sku, org_id, and available_qty
ALTER TABLE inventory_items 
  ALTER COLUMN item_name DROP NOT NULL,
  ALTER COLUMN brand DROP NOT NULL,
  ALTER COLUMN category DROP NOT NULL,
  ALTER COLUMN diameter_mm DROP NOT NULL,
  ALTER COLUMN length_mm DROP NOT NULL,
  ALTER COLUMN uom DROP NOT NULL;

-- Add comment explaining the change
COMMENT ON TABLE inventory_items IS 'Inventory items table - only item_id_sku, org_id, and available_qty are required fields';