-- Create campaign_analytics table for daily aggregated metrics
CREATE TABLE campaign_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL,
  campaign_type TEXT NOT NULL CHECK (campaign_type IN ('email', 'whatsapp')),
  date DATE NOT NULL,
  spend NUMERIC DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  revenue NUMERIC DEFAULT 0,
  cpa NUMERIC DEFAULT 0,
  roas NUMERIC DEFAULT 0,
  click_count INTEGER DEFAULT 0,
  open_count INTEGER DEFAULT 0,
  bounce_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(campaign_id, campaign_type, date)
);

-- Create campaign_insights table for AI recommendations
CREATE TABLE campaign_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id UUID,
  priority TEXT NOT NULL CHECK (priority IN ('high', 'medium', 'low')),
  insight_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  impact TEXT,
  supporting_data JSONB DEFAULT '{}',
  analysis TEXT,
  suggested_action TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'ignored', 'applied', 'dismissed')),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE campaign_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_insights ENABLE ROW LEVEL SECURITY;

-- RLS policies for campaign_analytics
CREATE POLICY "Users can view analytics in their org"
  ON campaign_analytics FOR SELECT
  USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Service role can manage all analytics"
  ON campaign_analytics FOR ALL
  USING (true)
  WITH CHECK (true);

-- RLS policies for campaign_insights
CREATE POLICY "Users can view insights in their org"
  ON campaign_insights FOR SELECT
  USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Users can update insights status"
  ON campaign_insights FOR UPDATE
  USING (org_id = get_user_org_id(auth.uid()))
  WITH CHECK (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Service role can manage all insights"
  ON campaign_insights FOR ALL
  USING (true)
  WITH CHECK (true);

-- Indexes for performance
CREATE INDEX idx_campaign_analytics_org_date ON campaign_analytics(org_id, date DESC);
CREATE INDEX idx_campaign_analytics_campaign ON campaign_analytics(campaign_id, campaign_type);
CREATE INDEX idx_campaign_insights_org_priority ON campaign_insights(org_id, priority, status);
CREATE INDEX idx_campaign_insights_expires ON campaign_insights(expires_at) WHERE status = 'active';

-- Add realtime for insights
ALTER PUBLICATION supabase_realtime ADD TABLE campaign_insights;