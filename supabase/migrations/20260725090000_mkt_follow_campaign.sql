-- Founder-to-person "please follow our LinkedIn page" campaign.
--
-- One email per person, from Amit as founder, asking only for a page follow —
-- nothing is sold. Audience is sourced from the RMPL master contact database
-- and split into two tiers (decision-maker vs practitioner) that get different
-- copy. Pace is deliberately low: 100 NEW people per tier per day, and at most
-- ONE reminder each, ever.
--
-- Why a dedicated table rather than reusing mkt_leads / email_campaign_recipients:
-- this campaign's state machine is its own thing (per-tier daily pacing, a
-- single lifetime reminder, click-as-success) and the audience is external
-- cold contacts that must never leak into the CRM's real lead pipeline or get
-- picked up by any sequence executor.

CREATE TABLE IF NOT EXISTS public.mkt_follow_campaign (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL,

  -- Identity
  email           text NOT NULL,
  first_name      text,
  full_name       text,
  designation     text,
  company_name    text,
  city            text,
  state           text,
  -- 'leader'    = C-suite / founder / owner / partner / MD / director
  -- 'individual' = junior through manager level
  segment         text NOT NULL CHECK (segment IN ('leader', 'individual')),

  -- Provenance, so any row can be traced back to the source record
  source          text NOT NULL DEFAULT 'rmpl_master',
  source_row_id   uuid,

  -- Opaque token used in the follow + unsubscribe links (no email in the URL)
  token           text NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),

  -- Lifecycle. 'queued' rows are eligible to send; the sender walks them
  -- oldest-first. Terminal-ish states are bounced / unsubscribed / complained.
  status          text NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued', 'sent', 'reminded', 'clicked',
                                    'bounced', 'unsubscribed', 'complained', 'failed')),

  -- Pre-send validation (syntax + MX + role/disposable screen)
  verified_at     timestamptz,
  verify_ok       boolean,
  verify_reason   text,

  -- Send trail
  sent_at             timestamptz,
  resend_message_id   text,
  reminder_sent_at    timestamptz,
  reminder_message_id text,
  send_error          text,

  -- Outcomes
  delivered_at    timestamptz,
  opened_at       timestamptz,
  clicked_at      timestamptz,
  click_count     integer NOT NULL DEFAULT 0,
  bounced_at      timestamptz,
  bounce_reason   text,
  unsubscribed_at timestamptz,
  complained_at   timestamptz,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- One row per person per org — the top-up job relies on this to skip anyone
-- already queued or contacted. A plain (not expression) unique constraint, so
-- PostgREST upserts can name it as the conflict target; the top-up function
-- lowercases every address before it is ever inserted.
ALTER TABLE public.mkt_follow_campaign
  DROP CONSTRAINT IF EXISTS mkt_follow_campaign_org_email_key;
ALTER TABLE public.mkt_follow_campaign
  ADD CONSTRAINT mkt_follow_campaign_org_email_key UNIQUE (org_id, email);

CREATE UNIQUE INDEX IF NOT EXISTS mkt_follow_campaign_token_key
  ON public.mkt_follow_campaign (token);

-- The sender's hot path: next N queued rows for one segment.
CREATE INDEX IF NOT EXISTS mkt_follow_campaign_send_queue_idx
  ON public.mkt_follow_campaign (org_id, segment, status, created_at)
  WHERE status = 'queued';

-- The reminder pass: sent-but-not-yet-reminded, oldest first.
CREATE INDEX IF NOT EXISTS mkt_follow_campaign_reminder_idx
  ON public.mkt_follow_campaign (org_id, sent_at)
  WHERE status = 'sent' AND reminder_sent_at IS NULL;

-- Webhook lookups by Resend message id (either the first send or the reminder).
CREATE INDEX IF NOT EXISTS mkt_follow_campaign_msgid_idx
  ON public.mkt_follow_campaign (resend_message_id);
CREATE INDEX IF NOT EXISTS mkt_follow_campaign_reminder_msgid_idx
  ON public.mkt_follow_campaign (reminder_message_id);

COMMENT ON TABLE public.mkt_follow_campaign IS
  'Founder-sent one-to-one LinkedIn page follow requests. 100 new/tier/day, max one reminder each. Cold contacts — never treat as CRM leads.';

ALTER TABLE public.mkt_follow_campaign ENABLE ROW LEVEL SECURITY;

-- Single-user app: any authenticated user of the org can read; only the
-- service role (edge functions) writes.
DROP POLICY IF EXISTS "org members read follow campaign" ON public.mkt_follow_campaign;
CREATE POLICY "org members read follow campaign"
  ON public.mkt_follow_campaign FOR SELECT TO authenticated
  USING (true);

DROP TRIGGER IF EXISTS set_updated_at_mkt_follow_campaign ON public.mkt_follow_campaign;
CREATE TRIGGER set_updated_at_mkt_follow_campaign
  BEFORE UPDATE ON public.mkt_follow_campaign
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
