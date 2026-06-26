-- Item 7: Accumulated Depreciation contra-asset accounts
-- sub_type = 'accumulated_depreciation', normal_balance = 'credit'
-- These offset the gross fixed asset values on the Balance Sheet.

INSERT INTO public.chart_of_accounts
  (code, name, type, sub_type, normal_balance, is_bank_account, is_system, parent_code)
VALUES
  ('1050', 'Accumulated Depreciation — Computer & IT',    'asset', 'accumulated_depreciation', 'credit', false, true, '1000'),
  ('1051', 'Accumulated Depreciation — Furniture',        'asset', 'accumulated_depreciation', 'credit', false, true, '1000'),
  ('1052', 'Accumulated Depreciation — Office Equipment', 'asset', 'accumulated_depreciation', 'credit', false, true, '1000')
ON CONFLICT DO NOTHING;
