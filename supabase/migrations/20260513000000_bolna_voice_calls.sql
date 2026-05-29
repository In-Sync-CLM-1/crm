-- ============================================================================
-- Bolna voice calls: per-call records + agent caching on scripts
-- ============================================================================

-- 1. Cache the Bolna agent_id on each call script so we don't recreate the
--    agent on every batch. NULL = agent not yet provisioned for this script.
ALTER TABLE public.mkt_call_scripts
  ADD COLUMN IF NOT EXISTS bolna_agent_id text;

-- 2. mkt_voice_calls — one row per AI voice call (queued, in-flight, terminal).
CREATE TABLE IF NOT EXISTS public.mkt_voice_calls (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id            uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  script_id             uuid NOT NULL REFERENCES public.mkt_call_scripts(id) ON DELETE RESTRICT,
  batch_id              uuid NOT NULL,
  -- Groups all calls launched from one bulk-trigger; webhook uses this to
  -- find the next queued call when the current one terminates.
  queue_position        integer NOT NULL,
  status                text NOT NULL DEFAULT 'queued',
  -- queued | in-flight | completed | failed | no-answer | busy | error | canceled
  bolna_execution_id    text,
  bolna_agent_id        text,
  from_phone_number     text,
  to_phone_number       text NOT NULL,
  initiated_at          timestamptz,
  ended_at              timestamptz,
  duration_sec          numeric(10,2),
  hangup_reason         text,
  total_cost            numeric(10,3),
  metadata              jsonb DEFAULT '{}'::jsonb,
  -- Holds Groq-extracted insights: {summary, key_facts[], objections[],
  -- interests[], next_steps[], sentiment}. Raw transcript and recording
  -- URL are intentionally NOT persisted (privacy-first).
  error_message         text,
  triggered_by          uuid REFERENCES auth.users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mkt_voice_calls_org           ON public.mkt_voice_calls(org_id);
CREATE INDEX IF NOT EXISTS idx_mkt_voice_calls_contact       ON public.mkt_voice_calls(contact_id);
CREATE INDEX IF NOT EXISTS idx_mkt_voice_calls_batch_status  ON public.mkt_voice_calls(batch_id, status);
CREATE INDEX IF NOT EXISTS idx_mkt_voice_calls_execution_id  ON public.mkt_voice_calls(bolna_execution_id);
CREATE INDEX IF NOT EXISTS idx_mkt_voice_calls_status        ON public.mkt_voice_calls(status) WHERE status IN ('queued', 'in-flight');

ALTER TABLE public.mkt_voice_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view mkt_voice_calls in their org"
  ON public.mkt_voice_calls
  FOR SELECT
  USING (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Users can insert mkt_voice_calls in their org"
  ON public.mkt_voice_calls
  FOR INSERT
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()));

-- updated_at trigger (matches pattern from existing migrations)
CREATE OR REPLACE FUNCTION public.set_mkt_voice_calls_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mkt_voice_calls_updated_at ON public.mkt_voice_calls;
CREATE TRIGGER trg_mkt_voice_calls_updated_at
  BEFORE UPDATE ON public.mkt_voice_calls
  FOR EACH ROW EXECUTE FUNCTION public.set_mkt_voice_calls_updated_at();
