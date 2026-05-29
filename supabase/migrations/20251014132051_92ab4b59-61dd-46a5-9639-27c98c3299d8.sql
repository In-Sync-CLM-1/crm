-- Add missing feature keys to feature_permissions table
INSERT INTO public.feature_permissions (feature_key, feature_name, feature_description, category, is_premium)
VALUES 
  ('dashboard', 'Dashboard', 'Main dashboard and overview page', 'Core', false),
  ('inventory', 'Inventory Management', 'Product and inventory tracking (C.Parekh specific)', 'Operations', false),
  ('org_chart', 'Organization Chart', 'View organizational structure and hierarchy', 'Organization', false),
  ('organization_settings', 'Organization Settings', 'Manage organization settings and configuration', 'Admin', false),
  ('approval_matrix', 'Approval Matrix', 'Manage approval workflows and permissions', 'Admin', false)
ON CONFLICT (feature_key) DO NOTHING;