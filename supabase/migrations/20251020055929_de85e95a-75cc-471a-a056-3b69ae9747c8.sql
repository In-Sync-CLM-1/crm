-- Phase 3: Nice-to-Have Features Schema

-- 3.1 Rule Templates Gallery
CREATE TABLE email_automation_rule_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL, -- 'onboarding', 'engagement', 'retention', 'conversion'
  icon TEXT,
  trigger_type TEXT NOT NULL,
  trigger_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  conditions JSONB DEFAULT '[]'::jsonb,
  condition_logic TEXT DEFAULT 'AND',
  send_delay_minutes INTEGER DEFAULT 0,
  cooldown_period_days INTEGER DEFAULT 3,
  priority INTEGER DEFAULT 50,
  is_popular BOOLEAN DEFAULT false,
  use_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS for templates (public read)
ALTER TABLE email_automation_rule_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view rule templates"
ON email_automation_rule_templates FOR SELECT
TO authenticated
USING (true);

-- Index for performance
CREATE INDEX idx_rule_templates_category ON email_automation_rule_templates(category);
CREATE INDEX idx_rule_templates_popular ON email_automation_rule_templates(is_popular) WHERE is_popular = true;

-- Seed popular templates
INSERT INTO email_automation_rule_templates (name, description, category, icon, trigger_type, trigger_config, conditions, is_popular) VALUES
(
  'Welcome New Contacts',
  'Send a welcome email immediately when a new contact is created',
  'onboarding',
  'Mail',
  'contact_created',
  '{"immediate": true}'::jsonb,
  '[]'::jsonb,
  true
),
(
  'Follow-up After 3 Days',
  'Automatically follow up with contacts 3 days after creation',
  'engagement',
  'Clock',
  'time_based',
  '{"trigger_date_type": "contact_created", "relative_days": 3}'::jsonb,
  '[]'::jsonb,
  true
),
(
  'Re-engage Inactive Contacts',
  'Send re-engagement email to contacts with no activity in 30 days',
  'retention',
  'UserX',
  'inactivity',
  '{"inactivity_days": 30}'::jsonb,
  '[]'::jsonb,
  true
),
(
  'Stage Change Notification',
  'Notify when contact moves to a specific pipeline stage',
  'conversion',
  'TrendingUp',
  'stage_change',
  '{}'::jsonb,
  '[{"field": "to_stage_id", "operator": "equals", "value": ""}]'::jsonb,
  true
),
(
  'Email Opened Follow-up',
  'Send follow-up when contact opens an email within 24 hours',
  'engagement',
  'Eye',
  'email_engagement',
  '{"engagement_type": "opened", "within_hours": 24}'::jsonb,
  '[]'::jsonb,
  true
),
(
  'Deal Won Celebration',
  'Send thank you email when deal is marked as won',
  'conversion',
  'Trophy',
  'stage_change',
  '{}'::jsonb,
  '[{"field": "to_stage_id", "operator": "equals", "value": "won"}]'::jsonb,
  true
);

-- 3.2 Email Engagement Patterns (for Smart Send Time)
CREATE TABLE email_engagement_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  hour_of_day INTEGER NOT NULL CHECK (hour_of_day >= 0 AND hour_of_day <= 23),
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  open_count INTEGER DEFAULT 0,
  click_count INTEGER DEFAULT 0,
  engagement_score NUMERIC(5,2) DEFAULT 0, -- weighted score
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, contact_id, hour_of_day, day_of_week)
);

-- RLS for engagement patterns
ALTER TABLE email_engagement_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view patterns in their org"
ON email_engagement_patterns FOR SELECT
TO authenticated
USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Service role can manage patterns"
ON email_engagement_patterns FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Index for optimal send time lookup
CREATE INDEX idx_engagement_patterns_org_contact 
ON email_engagement_patterns(org_id, contact_id);

CREATE INDEX idx_engagement_patterns_score 
ON email_engagement_patterns(org_id, contact_id, engagement_score DESC);

-- Function to get optimal send time for a contact
CREATE OR REPLACE FUNCTION get_optimal_send_time(
  _org_id UUID,
  _contact_id UUID,
  _default_hour INTEGER DEFAULT 10
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  best_pattern RECORD;
  result JSONB;
BEGIN
  -- Get best performing time slot for this contact
  SELECT hour_of_day, day_of_week, engagement_score
  INTO best_pattern
  FROM email_engagement_patterns
  WHERE org_id = _org_id 
    AND contact_id = _contact_id
    AND engagement_score > 0
  ORDER BY engagement_score DESC
  LIMIT 1;

  IF FOUND THEN
    result := jsonb_build_object(
      'hour', best_pattern.hour_of_day,
      'day_of_week', best_pattern.day_of_week,
      'score', best_pattern.engagement_score,
      'optimized', true
    );
  ELSE
    -- Fall back to org-wide best time
    SELECT hour_of_day, day_of_week, AVG(engagement_score) as avg_score
    INTO best_pattern
    FROM email_engagement_patterns
    WHERE org_id = _org_id
      AND engagement_score > 0
    GROUP BY hour_of_day, day_of_week
    ORDER BY avg_score DESC
    LIMIT 1;

    IF FOUND THEN
      result := jsonb_build_object(
        'hour', best_pattern.hour_of_day,
        'day_of_week', best_pattern.day_of_week,
        'score', best_pattern.avg_score,
        'optimized', false
      );
    ELSE
      -- Use default
      result := jsonb_build_object(
        'hour', _default_hour,
        'day_of_week', 2, -- Tuesday
        'score', 0,
        'optimized', false
      );
    END IF;
  END IF;

  RETURN result;
END;
$$;

-- 3.3 Rule Dependencies
CREATE TABLE email_automation_rule_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES email_automation_rules(id) ON DELETE CASCADE,
  depends_on_rule_id UUID NOT NULL REFERENCES email_automation_rules(id) ON DELETE CASCADE,
  dependency_type TEXT NOT NULL, -- 'required', 'blocks', 'triggers'
  delay_minutes INTEGER DEFAULT 0, -- minimum delay after dependency
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(rule_id, depends_on_rule_id),
  CHECK (rule_id != depends_on_rule_id)
);

-- RLS for dependencies
ALTER TABLE email_automation_rule_dependencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view dependencies in their org"
ON email_automation_rule_dependencies FOR SELECT
TO authenticated
USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Admins can manage dependencies"
ON email_automation_rule_dependencies FOR ALL
TO authenticated
USING (
  org_id = get_user_org_id(auth.uid()) AND
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
)
WITH CHECK (
  org_id = get_user_org_id(auth.uid()) AND
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
);

-- Index for dependency lookups
CREATE INDEX idx_rule_dependencies_rule 
ON email_automation_rule_dependencies(rule_id);

CREATE INDEX idx_rule_dependencies_depends_on 
ON email_automation_rule_dependencies(depends_on_rule_id);

-- Function to detect circular dependencies
CREATE OR REPLACE FUNCTION check_circular_dependency(
  _rule_id UUID,
  _depends_on_rule_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_cycle BOOLEAN;
BEGIN
  -- Check if adding this dependency would create a cycle
  WITH RECURSIVE dependency_chain AS (
    -- Start from the depends_on_rule
    SELECT depends_on_rule_id as rule_id, 1 as depth
    FROM email_automation_rule_dependencies
    WHERE rule_id = _depends_on_rule_id
    
    UNION ALL
    
    -- Follow the chain
    SELECT d.depends_on_rule_id, dc.depth + 1
    FROM email_automation_rule_dependencies d
    INNER JOIN dependency_chain dc ON d.rule_id = dc.rule_id
    WHERE dc.depth < 10 -- Prevent infinite loops
  )
  SELECT EXISTS(
    SELECT 1 FROM dependency_chain WHERE rule_id = _rule_id
  ) INTO has_cycle;
  
  RETURN COALESCE(has_cycle, false);
END;
$$;

-- Function to get rule execution order based on dependencies
CREATE OR REPLACE FUNCTION get_rule_execution_order(_org_id UUID)
RETURNS TABLE(rule_id UUID, execution_level INTEGER)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE rule_levels AS (
    -- Level 0: Rules with no dependencies
    SELECT r.id as rule_id, 0 as level
    FROM email_automation_rules r
    WHERE r.org_id = _org_id
      AND r.is_active = true
      AND NOT EXISTS (
        SELECT 1 FROM email_automation_rule_dependencies d
        WHERE d.rule_id = r.id
      )
    
    UNION ALL
    
    -- Higher levels: Rules that depend on previous levels
    SELECT r.id, rl.level + 1
    FROM email_automation_rules r
    INNER JOIN email_automation_rule_dependencies d ON d.rule_id = r.id
    INNER JOIN rule_levels rl ON rl.rule_id = d.depends_on_rule_id
    WHERE r.org_id = _org_id
      AND r.is_active = true
      AND rl.level < 10
  )
  SELECT DISTINCT ON (rl.rule_id) rl.rule_id, rl.level
  FROM rule_levels rl
  ORDER BY rl.rule_id, rl.level;
END;
$$;