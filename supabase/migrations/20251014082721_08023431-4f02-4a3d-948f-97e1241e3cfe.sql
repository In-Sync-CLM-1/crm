-- Add unique constraint on org_id and item_id_sku for inventory items
-- This allows proper upsert handling during bulk imports

ALTER TABLE inventory_items
ADD CONSTRAINT inventory_items_org_id_item_id_sku_key 
UNIQUE (org_id, item_id_sku);