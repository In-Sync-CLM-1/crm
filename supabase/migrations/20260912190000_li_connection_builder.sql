-- LinkedIn connection builder — mirrors the bd_* outreach pipeline's shape,
-- for a different channel (new 1st-degree connections instead of cold email).
-- Same org (BD_ORG_ID, Amit's own outreach identity), same review-before-send
-- discipline. Sending stays local browser automation (synthetic-monitor/
-- linkedin-connect/*.mjs, service-role writes) — this table is the review
-- queue and audit trail, not the execution engine.

-- ── Known connections (exclusion list) ───────────────────────────────────────
-- Seeded once from Downloads\InSync_Lead_Recommendations_Enriched.xlsx (851
-- rows, Amit's existing 1st-degree connections) so discovery never proposes
-- someone already connected. Refreshed opportunistically when search.mjs
-- notices "already connected" on a profile it visits.
CREATE TABLE IF NOT EXISTS public.li_known_connections (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL,
  linkedin_url text NOT NULL,
  full_name    text,
  source       text NOT NULL DEFAULT 'excel_seed', -- excel_seed | search_observed
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS li_known_connections_url_unique
  ON public.li_known_connections (org_id, linkedin_url);

-- ── Prospects (the review queue) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.li_prospects (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL,
  full_name        text NOT NULL,
  headline         text,
  current_company  text,
  linkedin_url     text NOT NULL,
  matched_product  text,              -- which In-Sync product this person fits
  reason           text,              -- deterministic, auditable — shown in the review UI
  research_facts   jsonb,             -- {matched_keywords: [...], domain_anchor: ...}
  status           text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','approved','rejected','invited','accepted','declined')),
  reviewed_at      timestamptz,
  invited_at       timestamptz,
  accepted_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS li_prospects_url_unique ON public.li_prospects (org_id, linkedin_url);
CREATE INDEX IF NOT EXISTS li_prospects_status ON public.li_prospects (org_id, status, created_at);

-- ── RLS — same pattern as the bd_* tables: org members read/write, service
-- role (the local scripts + any future edge function) bypasses RLS entirely.
ALTER TABLE public.li_known_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.li_prospects         ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['li_known_connections','li_prospects']
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
