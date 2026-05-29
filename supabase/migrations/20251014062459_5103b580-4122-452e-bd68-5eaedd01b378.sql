-- Create inventory_items table for Unbrako Fasteners
CREATE TABLE public.inventory_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL,
  
  -- Basic Item Info
  item_id_sku TEXT NOT NULL,
  item_name TEXT NOT NULL,
  brand TEXT NOT NULL,
  category TEXT NOT NULL,
  subcategory TEXT,
  
  -- Technical Specs
  grade_class TEXT,
  material TEXT,
  finish_coating TEXT,
  diameter_mm TEXT NOT NULL,
  length_mm TEXT NOT NULL,
  thread_pitch TEXT,
  head_type TEXT,
  drive_type TEXT,
  standard_spec TEXT,
  
  -- Inventory Management
  available_qty NUMERIC NOT NULL DEFAULT 0,
  reorder_level NUMERIC,
  reorder_qty NUMERIC,
  uom TEXT NOT NULL,
  storage_location TEXT,
  warehouse_branch TEXT,
  
  -- Supplier Info
  supplier_name TEXT,
  supplier_code TEXT,
  last_purchase_date DATE,
  last_purchase_price NUMERIC,
  lead_time_days INTEGER,
  purchase_order_no TEXT,
  
  -- Sales Info
  selling_price NUMERIC,
  discount_pct NUMERIC,
  customer_project TEXT,
  last_sale_date DATE,
  
  -- Tax & Compliance
  gst_pct NUMERIC,
  hsn_code TEXT,
  
  -- Quality Control
  batch_no TEXT,
  heat_no TEXT,
  inspection_status TEXT,
  certificate_no TEXT,
  
  -- Additional Info
  date_of_entry DATE,
  remarks_notes TEXT,
  weight_per_unit NUMERIC,
  image_ref TEXT,
  expiry_review_date DATE,
  issued_to TEXT,
  
  -- Audit fields
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view inventory in their org"
  ON public.inventory_items
  FOR SELECT
  USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Users can create inventory in their org"
  ON public.inventory_items
  FOR INSERT
  WITH CHECK (org_id = get_user_org_id(auth.uid()) AND created_by = auth.uid());

CREATE POLICY "Users can update inventory in their org"
  ON public.inventory_items
  FOR UPDATE
  USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Admins can delete inventory in their org"
  ON public.inventory_items
  FOR DELETE
  USING (
    org_id = get_user_org_id(auth.uid()) AND 
    (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
  );

-- Create trigger for updated_at
CREATE TRIGGER update_inventory_items_updated_at
  BEFORE UPDATE ON public.inventory_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_inventory_items_org_id ON public.inventory_items(org_id);
CREATE INDEX idx_inventory_items_item_id_sku ON public.inventory_items(item_id_sku);
CREATE INDEX idx_inventory_items_category ON public.inventory_items(category);
CREATE INDEX idx_inventory_items_brand ON public.inventory_items(brand);
CREATE INDEX idx_inventory_items_available_qty ON public.inventory_items(available_qty);