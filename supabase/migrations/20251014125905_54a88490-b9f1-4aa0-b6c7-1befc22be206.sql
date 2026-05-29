-- Add missing features to feature_permissions table

INSERT INTO public.feature_permissions (feature_key, feature_name, feature_description, category, is_premium) VALUES
-- Core Features
('dashboard', 'Dashboard', 'Main dashboard view with key metrics', 'core', false),
('documentation', 'Documentation', 'Access to documentation and help resources', 'core', false),
('org_chart', 'Organization Chart', 'View organization hierarchy and reporting structure', 'core', false),
('inventory', 'Inventory Management', 'Manage inventory items and stock', 'core', true),

-- Analytics Features  
('campaign_overview', 'Campaign Overview', 'Combined analytics dashboard for all campaigns', 'analytics', false),

-- Communication Features
('communications', 'Communications Hub', 'Unified inbox for emails and WhatsApp', 'communication', false),
('call_logs', 'Call Logs', 'View and manage call history', 'communication', false),
('bulk_email_sender', 'Bulk Email Sender', 'Send bulk email campaigns', 'communication', true),
('bulk_whatsapp_sender', 'Bulk WhatsApp Sender', 'Send bulk WhatsApp campaigns', 'communication', true),

-- Admin Features
('users', 'User Management', 'Manage users and their roles', 'admin', false),
('organization_settings', 'Organization Settings', 'Configure organization-wide settings', 'admin', false),
('pipeline_stages', 'Pipeline Stages', 'Configure pipeline stages and workflow', 'admin', false),
('call_dispositions', 'Call Dispositions', 'Manage call disposition categories', 'admin', false),
('approval_matrix', 'Approval Matrix', 'Configure approval workflows', 'admin', true),
('email_settings', 'Email Settings', 'Configure email domain and settings', 'admin', false),
('exotel_settings', 'Exotel Settings', 'Configure calling integration settings', 'admin', false),
('whatsapp_settings', 'WhatsApp Settings', 'Configure WhatsApp integration settings', 'admin', false),
('connectors', 'Connectors', 'Manage external integrations and webhooks', 'admin', true),
('queue_status', 'Queue Status', 'Monitor background job queues', 'admin', true),
('platform_admin', 'Platform Administration', 'Access to platform-wide administration', 'admin', true)

ON CONFLICT (feature_key) DO NOTHING;