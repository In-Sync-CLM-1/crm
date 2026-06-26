-- Add Director Drawings Suspense account and extend journal source types

-- 1. New account: Director Drawings - Suspense (current asset, debit-normal)
INSERT INTO public.chart_of_accounts
  (code, name, type, sub_type, normal_balance, is_bank_account, is_system, parent_code)
VALUES
  ('1170', 'Director Drawings - Suspense', 'asset', 'current_asset', 'debit', false, true, '1100')
ON CONFLICT DO NOTHING;

-- 2. Extend the source CHECK on journal_entries to include settlement + salary close types
ALTER TABLE public.journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_source_check;

ALTER TABLE public.journal_entries
  ADD CONSTRAINT journal_entries_source_check
    CHECK (source IN ('bank_import','manual','system_interest','director_settlement','director_salary'));
