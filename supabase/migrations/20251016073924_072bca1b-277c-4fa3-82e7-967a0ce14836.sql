-- Enable platform_admin feature for the organization
UPDATE org_feature_access 
SET is_enabled = true 
WHERE org_id = '65e22e43-f23d-4c0a-9d84-2eba65ad0e12' 
AND feature_key = 'platform_admin';