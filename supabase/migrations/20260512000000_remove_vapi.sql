-- Remove all VAPI artefacts. Voice calling is being rebuilt on Bolna AI.
-- VAPI was never functional in production; mkt_vapi_calls had 0 rows at removal time.

-- Drop the call-history table.
DROP TABLE IF EXISTS public.mkt_vapi_calls CASCADE;

-- Remove the 'vapi' channel registry rows (one per org).
DELETE FROM public.mkt_channels WHERE channel_key = 'vapi';

-- Remove orphan onboarding step rows for the deleted vapi_assistants step.
DELETE FROM public.mkt_onboarding_steps WHERE step_name = 'vapi_assistants';

-- Rename provider-named metric columns to provider-neutral names; the metric
-- concept (answer rate, positive rate) is the same for any voice provider.
ALTER TABLE public.mkt_engine_metrics
  RENAME COLUMN vapi_answer_rate TO call_answer_rate;
ALTER TABLE public.mkt_engine_metrics
  RENAME COLUMN vapi_positive_rate TO call_positive_rate;
