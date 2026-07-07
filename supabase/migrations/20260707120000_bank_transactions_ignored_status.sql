-- Let a bank transaction be dismissed as "not a business expense" instead of
-- forcing every debit into an expense account before it clears the review queue.

ALTER TABLE public.bank_transactions DROP CONSTRAINT IF EXISTS bank_transactions_status_check;
ALTER TABLE public.bank_transactions ADD CONSTRAINT bank_transactions_status_check
  CHECK (status IN ('pending','suggested','categorized','ignored'));
