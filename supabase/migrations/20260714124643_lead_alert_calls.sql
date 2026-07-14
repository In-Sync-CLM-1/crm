-- Tracks the new-lead owner-alert call retry state machine: at most one call
-- attempt in flight per lead at a time, up to 3 attempts, stops the instant one
-- is answered. See lead-alert-notify / lead-alert-call-webhook.
CREATE TABLE IF NOT EXISTS public.lead_alert_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead jsonb NOT NULL,
  attempt_number int NOT NULL DEFAULT 1,
  bolna_execution_id text,
  status text NOT NULL DEFAULT 'placed', -- placed | attended | exhausted
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_alert_calls_execution ON public.lead_alert_calls (bolna_execution_id);
