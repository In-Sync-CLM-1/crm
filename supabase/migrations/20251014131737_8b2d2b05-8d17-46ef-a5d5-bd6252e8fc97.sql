-- Drop the duplicate unique constraint that's causing conflicts
ALTER TABLE public.inventory_items 
DROP CONSTRAINT IF EXISTS inventory_items_item_id_sku_org_unique;

-- Add import_job_id column to track which records belong to which import
ALTER TABLE public.inventory_items 
ADD COLUMN IF NOT EXISTS import_job_id uuid REFERENCES public.import_jobs(id);

-- Create index for faster rollback queries
CREATE INDEX IF NOT EXISTS idx_inventory_items_import_job 
ON public.inventory_items(import_job_id) 
WHERE import_job_id IS NOT NULL;