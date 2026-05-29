-- ============================================================================
-- Call Intelligence: transcript + AI analysis on every call
-- (covers both click-to-call `call_logs` and Bolna `mkt_voice_calls`)
-- ============================================================================

-- Shared columns added to BOTH call tables.
ALTER TABLE public.call_logs
  ADD COLUMN IF NOT EXISTS transcript          text,
  ADD COLUMN IF NOT EXISTS transcript_provider text,
  ADD COLUMN IF NOT EXISTS transcribed_at      timestamptz,
  ADD COLUMN IF NOT EXISTS ai_summary          text,
  ADD COLUMN IF NOT EXISTS ai_analysis         jsonb,
  ADD COLUMN IF NOT EXISTS quality_score       integer CHECK (quality_score BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS sentiment           text CHECK (sentiment IN ('positive','neutral','negative','mixed')),
  ADD COLUMN IF NOT EXISTS analyzed_at         timestamptz,
  ADD COLUMN IF NOT EXISTS analysis_provider   text,
  ADD COLUMN IF NOT EXISTS analysis_error      text;

ALTER TABLE public.mkt_voice_calls
  ADD COLUMN IF NOT EXISTS recording_url       text,
  ADD COLUMN IF NOT EXISTS transcript          text,
  ADD COLUMN IF NOT EXISTS transcript_provider text,
  ADD COLUMN IF NOT EXISTS transcribed_at      timestamptz,
  ADD COLUMN IF NOT EXISTS ai_summary          text,
  ADD COLUMN IF NOT EXISTS ai_analysis         jsonb,
  ADD COLUMN IF NOT EXISTS quality_score       integer CHECK (quality_score BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS sentiment           text CHECK (sentiment IN ('positive','neutral','negative','mixed')),
  ADD COLUMN IF NOT EXISTS analyzed_at         timestamptz,
  ADD COLUMN IF NOT EXISTS analysis_provider   text,
  ADD COLUMN IF NOT EXISTS analysis_error      text;

-- Partial indexes — only un-analyzed rows that have a recording (the worklist).
CREATE INDEX IF NOT EXISTS idx_call_logs_pending_analysis
  ON public.call_logs(created_at DESC)
  WHERE recording_url IS NOT NULL AND analyzed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_mkt_voice_calls_pending_analysis
  ON public.mkt_voice_calls(created_at DESC)
  WHERE recording_url IS NOT NULL AND analyzed_at IS NULL;

-- Unified view: one row per call across both tables, for the Call Intelligence UI.
CREATE OR REPLACE VIEW public.v_call_intelligence AS
SELECT
  'human'::text                AS call_kind,
  cl.id                        AS id,
  cl.org_id                    AS org_id,
  cl.contact_id                AS contact_id,
  cl.agent_id::text            AS agent_ref,
  cl.from_number               AS from_number,
  cl.to_number                 AS to_number,
  cl.direction                 AS direction,
  cl.status                    AS status,
  cl.conversation_duration     AS duration_sec,
  COALESCE(cl.started_at, cl.created_at) AS occurred_at,
  cl.recording_url             AS recording_url,
  cl.transcript                AS transcript,
  cl.transcript_provider       AS transcript_provider,
  cl.transcribed_at            AS transcribed_at,
  cl.ai_summary                AS ai_summary,
  cl.ai_analysis               AS ai_analysis,
  cl.quality_score             AS quality_score,
  cl.sentiment                 AS sentiment,
  cl.analyzed_at               AS analyzed_at,
  cl.analysis_provider         AS analysis_provider,
  cl.analysis_error            AS analysis_error,
  cl.exotel_call_sid           AS provider_call_id,
  NULL::text                   AS bolna_execution_id
FROM public.call_logs cl
UNION ALL
SELECT
  'agentic'::text              AS call_kind,
  vc.id                        AS id,
  vc.org_id                    AS org_id,
  vc.contact_id                AS contact_id,
  vc.triggered_by::text        AS agent_ref,
  vc.from_phone_number         AS from_number,
  vc.to_phone_number           AS to_number,
  'outbound'::text             AS direction,
  vc.status                    AS status,
  vc.duration_sec::integer     AS duration_sec,
  COALESCE(vc.initiated_at, vc.created_at) AS occurred_at,
  vc.recording_url             AS recording_url,
  vc.transcript                AS transcript,
  vc.transcript_provider       AS transcript_provider,
  vc.transcribed_at            AS transcribed_at,
  vc.ai_summary                AS ai_summary,
  vc.ai_analysis               AS ai_analysis,
  vc.quality_score             AS quality_score,
  vc.sentiment                 AS sentiment,
  vc.analyzed_at               AS analyzed_at,
  vc.analysis_provider         AS analysis_provider,
  vc.analysis_error            AS analysis_error,
  NULL::text                   AS provider_call_id,
  vc.bolna_execution_id        AS bolna_execution_id
FROM public.mkt_voice_calls vc;

GRANT SELECT ON public.v_call_intelligence TO authenticated;
