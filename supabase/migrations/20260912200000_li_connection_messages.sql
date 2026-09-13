-- LinkedIn connection MESSAGING — phase 2 of the LinkedIn work. Different
-- audience from li_prospects (new people to connect with): this is Amit's
-- EXISTING 851 1st-degree connections, messaged with the pre-written copy
-- already sitting in Downloads\InSync_Lead_Recommendations_Enriched.xlsx
-- (PersonalizedMessage / FollowUp1_CaseStudy / FollowUp2_ProductWalkthrough).
-- No LLM drafting step — the copy already exists; this table is the review
-- queue + audit trail, same discipline as bd_drafts: nothing sends unless a
-- row is approved here first.

-- ── Message drafts (the review queue) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.li_connection_messages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL,
  full_name     text NOT NULL,
  linkedin_url  text NOT NULL,
  company       text,
  matched_product text,
  step          text NOT NULL CHECK (step IN ('initial','followup_1','followup_2')),
  message_text  text NOT NULL,
  attach_file   text,               -- filename referenced by the enrichment file, e.g. InSync_CaseStudy_CRM.pdf
  attach_url    text,               -- R2 URL once actually hosted — NULL means not yet uploaded
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','approved','rejected','sent')),
  reviewed_at   timestamptz,
  sent_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS li_connection_messages_person_step_unique
  ON public.li_connection_messages (org_id, linkedin_url, step);
CREATE INDEX IF NOT EXISTS li_connection_messages_status
  ON public.li_connection_messages (org_id, status, created_at);

-- ── Sequence state — one row per person, tracks which step is next due ──────
-- Pacing mirrors the email BD pipeline's own follow-up gaps: +4 days to
-- follow-up 1, +7 more to follow-up 2 (see send-message.mjs).
CREATE TABLE IF NOT EXISTS public.li_connection_sequences (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL,
  linkedin_url text NOT NULL,
  step         text NOT NULL DEFAULT 'initial' CHECK (step IN ('initial','followup_1','followup_2','done')),
  next_due_at  timestamptz NOT NULL DEFAULT now(),
  stopped_at   timestamptz,
  stop_reason  text CHECK (stop_reason IN ('replied','declined','completed','manual')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS li_connection_sequences_one_live_per_person
  ON public.li_connection_sequences (org_id, linkedin_url) WHERE stopped_at IS NULL;
CREATE INDEX IF NOT EXISTS li_connection_sequences_due
  ON public.li_connection_sequences (org_id, next_due_at) WHERE stopped_at IS NULL;

-- ── RLS — same pattern as every other bd_*/li_* table ────────────────────────
ALTER TABLE public.li_connection_messages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.li_connection_sequences ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['li_connection_messages','li_connection_sequences']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "org members read %1$s" ON public.%1$s', t);
    EXECUTE format($p$
      CREATE POLICY "org members read %1$s" ON public.%1$s
        FOR SELECT USING (org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid()))
    $p$, t);
    EXECUTE format('DROP POLICY IF EXISTS "org members write %1$s" ON public.%1$s', t);
    EXECUTE format($p$
      CREATE POLICY "org members write %1$s" ON public.%1$s
        FOR UPDATE USING (org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid()))
    $p$, t);
  END LOOP;
END $$;
