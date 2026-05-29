
-- Add contact fields and SLA deadline to support_tickets
ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS contact_name text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS due_at timestamptz;

-- Update default status from 'open' to 'new'
ALTER TABLE support_tickets
  ALTER COLUMN status SET DEFAULT 'new';

-- Audit history table
CREATE TABLE IF NOT EXISTS support_ticket_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  org_id uuid NOT NULL,
  user_id uuid REFERENCES profiles(id),
  action text NOT NULL,
  old_value text,
  new_value text,
  created_at timestamptz DEFAULT now()
);

-- RLS on history table
ALTER TABLE support_ticket_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view history in their org"
  ON support_ticket_history FOR SELECT
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert history in their org"
  ON support_ticket_history FOR INSERT
  WITH CHECK (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- Trigger to auto-set due_at based on priority
CREATE OR REPLACE FUNCTION set_ticket_deadline()
RETURNS TRIGGER AS $$
BEGIN
  NEW.due_at := CASE NEW.priority
    WHEN 'critical' THEN now() + interval '4 hours'
    WHEN 'high' THEN now() + interval '24 hours'
    WHEN 'medium' THEN now() + interval '48 hours'
    ELSE now() + interval '72 hours'
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_ticket_deadline
  BEFORE INSERT ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION set_ticket_deadline();
