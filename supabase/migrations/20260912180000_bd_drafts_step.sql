-- bd_drafts now holds one row per SEQUENCE STEP (email_1 / followup_1 /
-- followup_2), not just the initial email. Follow-ups used to be fixed
-- boilerplate assembled by bd-schedule at send time with no review; they are
-- now generated and reviewed the same way the initial email is, so
-- bd-schedule can require an approved draft before it sends any step.
ALTER TABLE public.bd_drafts
  ADD COLUMN IF NOT EXISTS step text NOT NULL DEFAULT 'email_1'
    CHECK (step IN ('email_1', 'followup_1', 'followup_2'));

CREATE INDEX IF NOT EXISTS bd_drafts_firm_step ON public.bd_drafts (firm_id, step, status);
