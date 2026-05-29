-- Phase 4: Future Enhancements

-- 4.1 Lead Scoring System
CREATE TABLE contact_lead_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  score INTEGER NOT NULL DEFAULT 0,
  score_category TEXT, -- 'cold', 'warm', 'hot'
  last_calculated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  score_breakdown JSONB DEFAULT '{}'::jsonb, -- detailed scoring breakdown
  UNIQUE(contact_id)
);

-- RLS for lead scores
ALTER TABLE contact_lead_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view lead scores in their org"
ON contact_lead_scores FOR SELECT
TO authenticated
USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Service role can manage lead scores"
ON contact_lead_scores FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE INDEX idx_lead_scores_contact ON contact_lead_scores(contact_id);
CREATE INDEX idx_lead_scores_score ON contact_lead_scores(org_id, score DESC);
CREATE INDEX idx_lead_scores_category ON contact_lead_scores(org_id, score_category);

-- Function to update lead score and trigger automations
CREATE OR REPLACE FUNCTION update_lead_score(
  _contact_id UUID,
  _org_id UUID,
  _score_delta INTEGER,
  _reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  old_score INTEGER;
  new_score INTEGER;
  old_category TEXT;
  new_category TEXT;
BEGIN
  -- Get current score
  SELECT score, score_category INTO old_score, old_category
  FROM contact_lead_scores
  WHERE contact_id = _contact_id;

  IF NOT FOUND THEN
    old_score := 0;
    old_category := 'cold';
  END IF;

  -- Calculate new score
  new_score := old_score + _score_delta;
  new_score := GREATEST(0, LEAST(100, new_score)); -- Clamp between 0-100

  -- Determine category
  new_category := CASE
    WHEN new_score >= 70 THEN 'hot'
    WHEN new_score >= 40 THEN 'warm'
    ELSE 'cold'
  END;

  -- Upsert score
  INSERT INTO contact_lead_scores (
    org_id, contact_id, score, score_category, last_calculated,
    score_breakdown
  )
  VALUES (
    _org_id, _contact_id, new_score, new_category, NOW(),
    jsonb_build_object(_reason, _score_delta)
  )
  ON CONFLICT (contact_id)
  DO UPDATE SET
    score = new_score,
    score_category = new_category,
    last_calculated = NOW(),
    score_breakdown = contact_lead_scores.score_breakdown || jsonb_build_object(_reason, _score_delta);

  -- Trigger automation if score changed significantly or category changed
  IF old_category IS DISTINCT FROM new_category OR ABS(old_score - new_score) >= 10 THEN
    PERFORM net.http_post(
      url := 'https://aizgpxaqvtvvqarzjmze.supabase.co/functions/v1/automation-trigger-handler',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object(
        'orgId', _org_id,
        'triggerType', 'lead_score_change',
        'contactId', _contact_id,
        'triggerData', jsonb_build_object(
          'old_score', old_score,
          'new_score', new_score,
          'old_category', old_category,
          'new_category', new_category,
          'reason', _reason
        )
      )
    );
  END IF;
END;
$$;

-- 4.2 Contact Tags System
CREATE TABLE contact_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#3b82f6',
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, name)
);

CREATE TABLE contact_tag_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES contact_tags(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by UUID REFERENCES auth.users(id),
  UNIQUE(contact_id, tag_id)
);

-- RLS for tags
ALTER TABLE contact_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_tag_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view tags in their org"
ON contact_tags FOR SELECT
TO authenticated
USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Admins can manage tags"
ON contact_tags FOR ALL
TO authenticated
USING (
  org_id = get_user_org_id(auth.uid()) AND
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
)
WITH CHECK (
  org_id = get_user_org_id(auth.uid()) AND
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
);

CREATE POLICY "Users can view tag assignments in their org"
ON contact_tag_assignments FOR SELECT
TO authenticated
USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Users can manage tag assignments in their org"
ON contact_tag_assignments FOR ALL
TO authenticated
USING (org_id = get_user_org_id(auth.uid()))
WITH CHECK (org_id = get_user_org_id(auth.uid()));

CREATE INDEX idx_tag_assignments_contact ON contact_tag_assignments(contact_id);
CREATE INDEX idx_tag_assignments_tag ON contact_tag_assignments(tag_id);

-- Trigger for tag assignments
CREATE OR REPLACE FUNCTION trigger_tag_assigned_automation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://aizgpxaqvtvvqarzjmze.supabase.co/functions/v1/automation-trigger-handler',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'orgId', NEW.org_id,
      'triggerType', 'tag_assigned',
      'contactId', NEW.contact_id,
      'triggerData', jsonb_build_object(
        'tag_id', NEW.tag_id,
        'assigned_by', NEW.assigned_by
      )
    )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER tag_assignment_trigger
AFTER INSERT ON contact_tag_assignments
FOR EACH ROW
EXECUTE FUNCTION trigger_tag_assigned_automation();

-- 4.3 Approval Workflow System
CREATE TABLE automation_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  rule_id UUID NOT NULL REFERENCES email_automation_rules(id) ON DELETE CASCADE,
  execution_id UUID NOT NULL REFERENCES email_automation_executions(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  requested_by UUID REFERENCES auth.users(id),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  approval_notes TEXT,
  expires_at TIMESTAMPTZ, -- auto-reject after this time
  UNIQUE(execution_id)
);

-- RLS for approvals
ALTER TABLE automation_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view approvals in their org"
ON automation_approvals FOR SELECT
TO authenticated
USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Users can request approvals"
ON automation_approvals FOR INSERT
TO authenticated
WITH CHECK (
  org_id = get_user_org_id(auth.uid()) AND
  requested_by = auth.uid()
);

CREATE POLICY "Admins can review approvals"
ON automation_approvals FOR UPDATE
TO authenticated
USING (
  org_id = get_user_org_id(auth.uid()) AND
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
)
WITH CHECK (
  org_id = get_user_org_id(auth.uid()) AND
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
);

CREATE INDEX idx_approvals_status ON automation_approvals(org_id, status);
CREATE INDEX idx_approvals_expires ON automation_approvals(expires_at) WHERE status = 'pending';

-- Add approval requirement flag to rules
ALTER TABLE email_automation_rules
ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS approval_timeout_hours INTEGER DEFAULT 24;

-- 4.4 Advanced Reporting: Campaign Performance Aggregates
CREATE TABLE automation_performance_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  rule_id UUID REFERENCES email_automation_rules(id) ON DELETE CASCADE,
  report_date DATE NOT NULL,
  total_triggered INTEGER DEFAULT 0,
  total_sent INTEGER DEFAULT 0,
  total_failed INTEGER DEFAULT 0,
  total_opened INTEGER DEFAULT 0,
  total_clicked INTEGER DEFAULT 0,
  total_converted INTEGER DEFAULT 0,
  unique_opens INTEGER DEFAULT 0,
  unique_clicks INTEGER DEFAULT 0,
  avg_time_to_open_minutes NUMERIC(10,2),
  avg_time_to_click_minutes NUMERIC(10,2),
  avg_time_to_convert_minutes NUMERIC(10,2),
  total_conversion_value NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, rule_id, report_date)
);

-- RLS for performance reports
ALTER TABLE automation_performance_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view performance reports in their org"
ON automation_performance_daily FOR SELECT
TO authenticated
USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Service role can manage performance reports"
ON automation_performance_daily FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE INDEX idx_performance_daily_org_date ON automation_performance_daily(org_id, report_date DESC);
CREATE INDEX idx_performance_daily_rule_date ON automation_performance_daily(rule_id, report_date DESC);

-- Function to aggregate daily performance
CREATE OR REPLACE FUNCTION aggregate_automation_performance_daily(_date DATE)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO automation_performance_daily (
    org_id,
    rule_id,
    report_date,
    total_triggered,
    total_sent,
    total_failed,
    total_opened,
    total_clicked,
    total_converted,
    unique_opens,
    unique_clicks,
    avg_time_to_open_minutes,
    avg_time_to_click_minutes,
    avg_time_to_convert_minutes,
    total_conversion_value
  )
  SELECT
    e.org_id,
    e.rule_id,
    _date,
    COUNT(*) FILTER (WHERE e.status IN ('sent', 'scheduled', 'pending', 'failed')) as total_triggered,
    COUNT(*) FILTER (WHERE e.status = 'sent') as total_sent,
    COUNT(*) FILTER (WHERE e.status = 'failed') as total_failed,
    COUNT(*) FILTER (WHERE ec.opened_at IS NOT NULL) as total_opened,
    COUNT(*) FILTER (WHERE ec.first_clicked_at IS NOT NULL) as total_clicked,
    COUNT(*) FILTER (WHERE e.converted_at IS NOT NULL) as total_converted,
    COUNT(DISTINCT e.contact_id) FILTER (WHERE ec.opened_at IS NOT NULL) as unique_opens,
    COUNT(DISTINCT e.contact_id) FILTER (WHERE ec.first_clicked_at IS NOT NULL) as unique_clicks,
    AVG(EXTRACT(EPOCH FROM (ec.opened_at - e.sent_at)) / 60) FILTER (WHERE ec.opened_at IS NOT NULL) as avg_time_to_open_minutes,
    AVG(EXTRACT(EPOCH FROM (ec.first_clicked_at - e.sent_at)) / 60) FILTER (WHERE ec.first_clicked_at IS NOT NULL) as avg_time_to_click_minutes,
    AVG(EXTRACT(EPOCH FROM (e.converted_at - e.sent_at)) / 60) FILTER (WHERE e.converted_at IS NOT NULL) as avg_time_to_convert_minutes,
    SUM(e.conversion_value) FILTER (WHERE e.converted_at IS NOT NULL) as total_conversion_value
  FROM email_automation_executions e
  LEFT JOIN email_conversations ec ON ec.id = e.email_conversation_id
  WHERE DATE(e.created_at) = _date
  GROUP BY e.org_id, e.rule_id
  ON CONFLICT (org_id, rule_id, report_date)
  DO UPDATE SET
    total_triggered = EXCLUDED.total_triggered,
    total_sent = EXCLUDED.total_sent,
    total_failed = EXCLUDED.total_failed,
    total_opened = EXCLUDED.total_opened,
    total_clicked = EXCLUDED.total_clicked,
    total_converted = EXCLUDED.total_converted,
    unique_opens = EXCLUDED.unique_opens,
    unique_clicks = EXCLUDED.unique_clicks,
    avg_time_to_open_minutes = EXCLUDED.avg_time_to_open_minutes,
    avg_time_to_click_minutes = EXCLUDED.avg_time_to_click_minutes,
    avg_time_to_convert_minutes = EXCLUDED.avg_time_to_convert_minutes,
    total_conversion_value = EXCLUDED.total_conversion_value;
END;
$$;

-- Schedule daily aggregation (runs at 1 AM)
SELECT cron.schedule(
  'aggregate-automation-performance',
  '0 1 * * *',
  $$SELECT aggregate_automation_performance_daily(CURRENT_DATE - 1)$$
);