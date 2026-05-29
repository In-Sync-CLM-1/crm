-- Phase 1: Create operation_queue table
CREATE TABLE operation_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,

  operation_type TEXT NOT NULL CHECK (operation_type IN (
    'bulk_whatsapp',
    'template_sync',
    'contact_import',
    'webhook_lead',
    'bulk_email'
  )),

  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued',
    'processing',
    'completed',
    'failed'
  )),

  priority INTEGER DEFAULT 50 NOT NULL,

  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB,
  error_message TEXT,

  scheduled_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for operation_queue
CREATE INDEX idx_operation_queue_org ON operation_queue(org_id);
CREATE INDEX idx_operation_queue_user ON operation_queue(user_id);
CREATE INDEX idx_operation_queue_status ON operation_queue(status);
CREATE INDEX idx_operation_queue_scheduled ON operation_queue(scheduled_at) 
  WHERE status = 'queued';
CREATE INDEX idx_operation_queue_type_status ON operation_queue(operation_type, status);

-- Enable RLS on operation_queue
ALTER TABLE operation_queue ENABLE ROW LEVEL SECURITY;

-- RLS Policies for operation_queue
CREATE POLICY "Users can view their own queue items"
  ON operation_queue FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can create queue items in their org"
  ON operation_queue FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id = get_user_org_id(auth.uid()) AND
    user_id = auth.uid()
  );

CREATE POLICY "Users can update their own queue items"
  ON operation_queue FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Service role has full access to operation_queue"
  ON operation_queue FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Add trigger for updated_at on operation_queue
CREATE TRIGGER update_operation_queue_updated_at
  BEFORE UPDATE ON operation_queue
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Phase 2: Add email column to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS email TEXT;

-- Create unique index on email
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_email 
ON profiles(email) WHERE email IS NOT NULL;

-- Function to sync email from auth.users to profiles
CREATE OR REPLACE FUNCTION sync_user_email()
RETURNS TRIGGER AS $$
BEGIN
  -- Get email from auth.users and update profiles
  UPDATE profiles
  SET email = (
    SELECT email FROM auth.users WHERE id = NEW.id
  )
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on profiles INSERT
CREATE TRIGGER sync_email_on_profile_insert
AFTER INSERT ON profiles
FOR EACH ROW
EXECUTE FUNCTION sync_user_email();

-- Backfill existing profiles with emails from auth.users
UPDATE profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id AND p.email IS NULL;