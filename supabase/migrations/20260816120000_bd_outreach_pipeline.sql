-- BD outreach pipeline — the core logic layer.
--
-- Amit's personal business-development campaign (Prosync AI Solutions):
-- cold outreach to US software boutiques offering contract delivery capacity.
-- This project holds sourcing, grading, research, drafting and the review
-- queue. Sending, threading and mailbox rotation stay in globalcrm's In-Sync
-- Demo org, which already does that work — see bd-schedule / bd-track.
--
-- The spreadsheet (us-boutique-target-list.xlsx) seeds these tables once and
-- then stops being the source of truth: it had already drifted into two files
-- with different contacts, and opt-outs were tracked by cell highlighting.

-- ── Firms ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bd_firms (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL,
  firm_name         text NOT NULL,
  -- lowercase, Inc/LLC/Ltd/Corp and punctuation stripped. Clutch re-serves
  -- sponsored listings across pages, so dedupe on this, never on firm_name.
  name_key          text NOT NULL,
  city              text,
  state             text,
  time_zone         text,              -- informational only, never a grade input
  headcount_band    text,
  bill_rate_band    text,
  min_project       text,
  fit_score         numeric,           -- % of revenue in matching service lines
  ai_services_pct   numeric,
  has_crm_erp_line  boolean NOT NULL DEFAULT false,
  has_staff_aug     boolean NOT NULL DEFAULT false,
  has_domain_anchor boolean NOT NULL DEFAULT false,
  other_services    text,
  website           text,             -- their own site; research fetches from here
  grade             text CHECK (grade IN ('A','B','C','X','?')),
  -- Set by hand, never by the grader. PARKED carries a revisit condition;
  -- SENT is in an active sequence and excluded from drafting.
  state_flag        text CHECK (state_flag IN ('PARKED','SENT','CLOSED','EXCLUDED')),
  state_reason      text,
  research_facts    jsonb,             -- verbatim extract: clients/cases/verticals/stack/team
  researched_at     timestamptz,
  disqualifier_flags jsonb,            -- {pattern: [matched text]} — flags only, never auto-drop
  source            text NOT NULL DEFAULT 'clutch',
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS bd_firms_name_key_unique ON public.bd_firms (org_id, name_key);
CREATE INDEX IF NOT EXISTS bd_firms_grade ON public.bd_firms (org_id, grade, state_flag);

-- ── Permanent exclusions ─────────────────────────────────────────────────────
-- Rejected firms live HERE rather than being deleted: a deleted firm reappears
-- on the next scrape of the same category and gets researched, contacted and
-- drafted all over again.
CREATE TABLE IF NOT EXISTS public.bd_exclusions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL,
  firm_name    text NOT NULL,
  name_key     text NOT NULL,
  reason       text NOT NULL,
  is_permanent boolean NOT NULL DEFAULT true,   -- false = REVISIT
  revisit_when text,
  excluded_on  date NOT NULL DEFAULT CURRENT_DATE,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS bd_exclusions_name_key_unique ON public.bd_exclusions (org_id, name_key);

-- ── Contacts ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bd_contacts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL,
  firm_id      uuid NOT NULL REFERENCES public.bd_firms(id) ON DELETE CASCADE,
  is_primary   boolean NOT NULL DEFAULT true,
  first_name   text,
  last_name    text,
  title        text,
  email        text,
  linkedin_url text,
  -- 'site' beats 'apollo': emails published on the firm's own /team or /about
  -- page are verified by definition, enrichment guesses are not.
  source       text NOT NULL DEFAULT 'site',
  -- which selection rule picked this person, shown in the review queue
  why_chosen   text,
  opted_out    boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bd_contacts_firm ON public.bd_contacts (firm_id, is_primary);
-- One primary and one fallback per firm — enrichment upserts on this.
CREATE UNIQUE INDEX IF NOT EXISTS bd_contacts_firm_primary_unique ON public.bd_contacts (firm_id, is_primary);

-- ── Drafts ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bd_drafts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL,
  firm_id       uuid NOT NULL REFERENCES public.bd_firms(id) ON DELETE CASCADE,
  contact_id    uuid REFERENCES public.bd_contacts(id) ON DELETE SET NULL,
  angle_version smallint CHECK (angle_version BETWEEN 1 AND 4),
  proof_key     text,                  -- ats | redefine | capital_india | los | excel | routing
  subject       text,
  first_line    text,                  -- the only generative part of the body
  body          text,
  -- Everything the review queue needs to show its working.
  reasoning     jsonb,                 -- {why_firm, why_contact, why_angle, why_proof}
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','approved','rejected','deferred','scheduled','sent')),
  reviewed_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bd_drafts_status ON public.bd_drafts (org_id, status, created_at);
-- One live draft per firm; a rejected or sent one doesn't block a new attempt.
CREATE UNIQUE INDEX IF NOT EXISTS bd_drafts_one_open_per_firm
  ON public.bd_drafts (firm_id) WHERE status IN ('pending','approved','scheduled');

-- ── Sequence state ───────────────────────────────────────────────────────────
-- Day 0 email → +4 in-thread nudge → +11 breakup → +12 LinkedIn → +18 InMail.
-- LinkedIn steps are surfaced as reminders and done by hand: the account is the
-- credibility check for the whole campaign and automation risks a ban.
CREATE TABLE IF NOT EXISTS public.bd_sequences (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL,
  firm_id          uuid NOT NULL REFERENCES public.bd_firms(id) ON DELETE CASCADE,
  contact_id       uuid REFERENCES public.bd_contacts(id) ON DELETE SET NULL,
  draft_id         uuid REFERENCES public.bd_drafts(id) ON DELETE SET NULL,
  batch_no         smallint,
  step             text NOT NULL DEFAULT 'email_1'
                   CHECK (step IN ('email_1','followup_1','followup_2','linkedin_connect','inmail','done')),
  next_due_at      timestamptz,
  -- globalcrm's email_conversations id for the parent message, plus the real
  -- RFC Message-ID: follow-ups must reply IN THREAD, and a new thread reads
  -- as automated.
  thread_message_id text,
  mailbox          text,               -- one firm stays on one mailbox for the whole sequence
  stopped_at       timestamptz,
  stop_reason      text CHECK (stop_reason IN ('replied','bounced','opted_out','connected','completed','manual')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS bd_sequences_one_live_per_firm
  ON public.bd_sequences (firm_id) WHERE stopped_at IS NULL;
CREATE INDEX IF NOT EXISTS bd_sequences_due ON public.bd_sequences (org_id, next_due_at) WHERE stopped_at IS NULL;

-- ── Events ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bd_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL,
  firm_id     uuid NOT NULL REFERENCES public.bd_firms(id) ON DELETE CASCADE,
  sequence_id uuid REFERENCES public.bd_sequences(id) ON DELETE SET NULL,
  step        text,
  event_type  text NOT NULL
              CHECK (event_type IN ('queued','sent','delivered','opened','bounced','replied','opted_out','complained')),
  angle_version smallint,              -- carried on the event so the gate can
  proof_key     text,                  -- report reply rate by angle and by proof
  detail      jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bd_events_firm ON public.bd_events (firm_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS bd_events_type ON public.bd_events (org_id, event_type, occurred_at DESC);

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Same rule across all six: members of the owning org. Writes come from the
-- bd-* edge functions, which run as service role and bypass RLS.
ALTER TABLE public.bd_firms      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bd_exclusions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bd_contacts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bd_drafts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bd_sequences  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bd_events     ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['bd_firms','bd_exclusions','bd_contacts','bd_drafts','bd_sequences','bd_events']
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
