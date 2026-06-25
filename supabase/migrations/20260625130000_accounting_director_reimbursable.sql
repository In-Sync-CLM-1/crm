-- Add "Due to Director - Amit Sengupta" as a current liability account.
-- Used for business expenses Amit pays on his personal card on behalf of Prosync.
-- No interest accrues (unlike Loan from Director 2110); settled via bank transfer.

INSERT INTO public.chart_of_accounts
  (code, name, type, sub_type, normal_balance, is_bank_account, is_system, parent_code)
VALUES
  ('2241', 'Due to Director - Amit Sengupta', 'liability', 'current_liability', 'credit', false, true, '2200')
ON CONFLICT DO NOTHING;
