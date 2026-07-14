-- The outreach/sequence executors and daily-digest/reporter functions were doing
-- full scans of mkt_sequence_actions (1.5M rows) and mkt_engine_logs (1.8M rows)
-- on every 5-minute poll — the single largest compute consumer in the database
-- (one query pattern alone: ~1.37M calls / ~155 cumulative hours since May 7).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mkt_seq_actions_enrollment_step_status
  ON public.mkt_sequence_actions (enrollment_id, step_number, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mkt_seq_actions_step_created
  ON public.mkt_sequence_actions (step_id, created_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mkt_engine_logs_org_created
  ON public.mkt_engine_logs (org_id, created_at);
