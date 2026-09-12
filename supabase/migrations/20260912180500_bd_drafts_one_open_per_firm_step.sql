-- bd_drafts_one_open_per_firm (2026-08-16) predates per-step drafts: it blocked
-- a firm to exactly ONE live row, which is now wrong on purpose — a firm has
-- up to three live rows (email_1, followup_1, followup_2). Rescope the
-- uniqueness to (firm_id, step): still exactly one live draft per STEP, still
-- lets a rejected/sent one not block a fresh attempt at that same step.
DROP INDEX IF EXISTS public.bd_drafts_one_open_per_firm;

CREATE UNIQUE INDEX IF NOT EXISTS bd_drafts_one_open_per_firm_step
  ON public.bd_drafts (firm_id, step) WHERE status IN ('pending', 'approved', 'scheduled');
