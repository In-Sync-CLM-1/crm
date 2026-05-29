-- Add unique constraint on item_id_sku for inventory_items table
-- This will allow ON CONFLICT upserts during bulk import

ALTER TABLE public.inventory_items 
ADD CONSTRAINT inventory_items_item_id_sku_org_unique 
UNIQUE (item_id_sku, org_id);