-- Table shipped without RLS (Supabase "Table publicly accessible" + Health Sentinel
-- alert); internal state table only ever touched via service-role key, so enabling
-- with no policies is a pure lockdown with no functional impact.
ALTER TABLE public.lead_alert_calls ENABLE ROW LEVEL SECURITY;
