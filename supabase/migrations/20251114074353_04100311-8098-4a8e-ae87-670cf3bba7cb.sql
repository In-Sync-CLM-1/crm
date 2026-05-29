-- Create notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  user_id UUID NOT NULL,
  
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  
  entity_type TEXT,
  entity_id UUID,
  
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  
  action_url TEXT,
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_notifications_org_id ON public.notifications(org_id);
CREATE INDEX idx_notifications_is_read ON public.notifications(is_read);
CREATE INDEX idx_notifications_expires_at ON public.notifications(expires_at);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications"
  ON public.notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can update their own notifications"
  ON public.notifications FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Service role can manage all notifications"
  ON public.notifications FOR ALL
  USING (true)
  WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Add next action fields to contact_activities
ALTER TABLE public.contact_activities 
  ADD COLUMN IF NOT EXISTS next_action_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_action_notes TEXT,
  ADD COLUMN IF NOT EXISTS morning_reminder_sent BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pre_action_reminder_sent BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_contact_activities_next_action 
  ON public.contact_activities(next_action_date, morning_reminder_sent, pre_action_reminder_sent) 
  WHERE next_action_date IS NOT NULL;