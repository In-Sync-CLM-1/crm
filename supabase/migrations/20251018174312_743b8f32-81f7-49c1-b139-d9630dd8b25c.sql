-- Phase 1: Database Schema Updates

-- 1.1 Extend contact_activities table
ALTER TABLE contact_activities 
ADD COLUMN IF NOT EXISTS meeting_link text,
ADD COLUMN IF NOT EXISTS meeting_platform text DEFAULT 'google_meet',
ADD COLUMN IF NOT EXISTS reminder_sent boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS meeting_duration_minutes integer,
ADD COLUMN IF NOT EXISTS google_calendar_event_id text;

-- Add index for reminder queries
CREATE INDEX IF NOT EXISTS idx_activities_scheduled_reminders 
ON contact_activities(scheduled_at, reminder_sent, activity_type) 
WHERE scheduled_at IS NOT NULL AND reminder_sent = false;

-- 1.2 Create activity_participants table
CREATE TABLE IF NOT EXISTS activity_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid REFERENCES contact_activities(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  email text NOT NULL,
  name text NOT NULL,
  response_status text DEFAULT 'pending' CHECK (response_status IN ('pending', 'accepted', 'declined', 'maybe')),
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- RLS Policies for activity_participants
ALTER TABLE activity_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view participants in their org"
  ON activity_participants FOR SELECT
  TO authenticated
  USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Users can create participants for their activities"
  ON activity_participants FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id = get_user_org_id(auth.uid()) AND
    EXISTS (
      SELECT 1 FROM contact_activities
      WHERE id = activity_participants.activity_id
      AND created_by = auth.uid()
    )
  );

CREATE POLICY "Service role has full access to activity_participants"
  ON activity_participants FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Indexes for activity_participants
CREATE INDEX IF NOT EXISTS idx_activity_participants_activity ON activity_participants(activity_id);
CREATE INDEX IF NOT EXISTS idx_activity_participants_user ON activity_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_participants_contact ON activity_participants(contact_id);

-- 1.3 Create google_oauth_tokens table
CREATE TABLE IF NOT EXISTS google_oauth_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE NOT NULL UNIQUE,
  refresh_token text NOT NULL,
  access_token text,
  token_expires_at timestamp with time zone,
  calendar_id text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- RLS Policies for google_oauth_tokens
ALTER TABLE google_oauth_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage Google tokens"
  ON google_oauth_tokens FOR ALL
  TO authenticated
  USING (
    org_id = get_user_org_id(auth.uid()) AND
    (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
  );

CREATE POLICY "Service role has full access to google_oauth_tokens"
  ON google_oauth_tokens FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);