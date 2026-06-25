-- Accounting Module: double-entry bookkeeping for Prosync AI Solutions
-- Tables: chart_of_accounts, bank_statements, bank_transactions,
--         journal_entries, journal_entry_lines

-- ─────────────────────────────────────────────
-- 1. CHART OF ACCOUNTS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chart_of_accounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT NOT NULL,
  name          TEXT NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('asset','liability','equity','income','expense')),
  sub_type      TEXT NOT NULL,
  normal_balance TEXT NOT NULL CHECK (normal_balance IN ('debit','credit')),
  is_bank_account BOOLEAN NOT NULL DEFAULT false,
  is_system     BOOLEAN NOT NULL DEFAULT false,
  parent_code   TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  org_id        UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (code, org_id)
);

CREATE INDEX IF NOT EXISTS idx_coa_type    ON public.chart_of_accounts(type);
CREATE INDEX IF NOT EXISTS idx_coa_org     ON public.chart_of_accounts(org_id);
CREATE INDEX IF NOT EXISTS idx_coa_code    ON public.chart_of_accounts(code);
-- Partial unique index: system accounts (org_id IS NULL) must have unique codes
CREATE UNIQUE INDEX IF NOT EXISTS idx_coa_code_system
  ON public.chart_of_accounts(code) WHERE org_id IS NULL;

ALTER TABLE public.chart_of_accounts ENABLE ROW LEVEL SECURITY;

-- System accounts visible to everyone; org accounts visible to own org
CREATE POLICY "coa_select" ON public.chart_of_accounts FOR SELECT
  USING (org_id IS NULL OR org_id IN (
    SELECT org_id FROM public.profiles WHERE id = auth.uid()
  ) OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_platform_admin = true));

CREATE POLICY "coa_insert" ON public.chart_of_accounts FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "coa_update" ON public.chart_of_accounts FOR UPDATE
  USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()) AND NOT is_system);

CREATE POLICY "coa_platform_admin" ON public.chart_of_accounts FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_platform_admin = true));


-- ─────────────────────────────────────────────
-- 2. BANK STATEMENTS (one row per CSV upload)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bank_statements (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  bank_name      TEXT NOT NULL DEFAULT 'IDFC FIRST Bank',
  account_number TEXT,
  from_date      DATE,
  to_date        DATE,
  filename       TEXT,
  row_count      INTEGER NOT NULL DEFAULT 0,
  uploaded_by    UUID REFERENCES public.profiles(id),
  uploaded_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bank_statements_org ON public.bank_statements(org_id);

ALTER TABLE public.bank_statements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bs_org_select" ON public.bank_statements FOR SELECT
  USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "bs_org_insert" ON public.bank_statements FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "bs_org_delete" ON public.bank_statements FOR DELETE
  USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "bs_platform_admin" ON public.bank_statements FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_platform_admin = true));


-- ─────────────────────────────────────────────
-- 3. BANK TRANSACTIONS (raw rows from CSV)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bank_transactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  statement_id     UUID NOT NULL REFERENCES public.bank_statements(id) ON DELETE CASCADE,
  transaction_date DATE NOT NULL,
  value_date       DATE,
  narration        TEXT NOT NULL DEFAULT '',
  reference        TEXT,
  debit            NUMERIC NOT NULL DEFAULT 0,
  credit           NUMERIC NOT NULL DEFAULT 0,
  balance          NUMERIC,
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','suggested','categorized')),
  journal_entry_id UUID,  -- set once categorized (FK added below after journal_entries)
  auto_rule        TEXT,  -- which rule matched (e.g. 'amit_salary', 'amit_loan')
  suggested_invoice_id UUID REFERENCES public.billing_documents(id),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bank_txn_org       ON public.bank_transactions(org_id);
CREATE INDEX IF NOT EXISTS idx_bank_txn_statement  ON public.bank_transactions(statement_id);
CREATE INDEX IF NOT EXISTS idx_bank_txn_status     ON public.bank_transactions(status);
CREATE INDEX IF NOT EXISTS idx_bank_txn_date       ON public.bank_transactions(transaction_date);

ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bt_org_select" ON public.bank_transactions FOR SELECT
  USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "bt_org_insert" ON public.bank_transactions FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "bt_org_update" ON public.bank_transactions FOR UPDATE
  USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "bt_org_delete" ON public.bank_transactions FOR DELETE
  USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "bt_platform_admin" ON public.bank_transactions FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_platform_admin = true));


-- ─────────────────────────────────────────────
-- 4. JOURNAL ENTRIES (double-entry header)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.journal_entries (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entry_date          DATE NOT NULL,
  reference           TEXT,
  narration           TEXT NOT NULL DEFAULT '',
  source              TEXT NOT NULL DEFAULT 'manual'
                        CHECK (source IN ('bank_import','manual','system_interest')),
  bank_transaction_id UUID REFERENCES public.bank_transactions(id),
  billing_document_id UUID REFERENCES public.billing_documents(id),
  created_by          UUID REFERENCES public.profiles(id),
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_je_org     ON public.journal_entries(org_id);
CREATE INDEX IF NOT EXISTS idx_je_date    ON public.journal_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_je_source  ON public.journal_entries(source);

ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "je_org_select" ON public.journal_entries FOR SELECT
  USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "je_org_insert" ON public.journal_entries FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "je_org_update" ON public.journal_entries FOR UPDATE
  USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "je_org_delete" ON public.journal_entries FOR DELETE
  USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "je_platform_admin" ON public.journal_entries FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_platform_admin = true));


-- ─────────────────────────────────────────────
-- 5. JOURNAL ENTRY LINES (debit / credit legs)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.journal_entry_lines (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id   UUID NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.chart_of_accounts(id),
  debit      NUMERIC NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit     NUMERIC NOT NULL DEFAULT 0 CHECK (credit >= 0),
  narration  TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jel_entry   ON public.journal_entry_lines(entry_id);
CREATE INDEX IF NOT EXISTS idx_jel_account ON public.journal_entry_lines(account_id);

ALTER TABLE public.journal_entry_lines ENABLE ROW LEVEL SECURITY;

-- Lines inherit access from their parent entry via join
CREATE POLICY "jel_select" ON public.journal_entry_lines FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.journal_entries je
    JOIN public.profiles p ON p.org_id = je.org_id
    WHERE je.id = entry_id AND p.id = auth.uid()
  ));
CREATE POLICY "jel_insert" ON public.journal_entry_lines FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.journal_entries je
    JOIN public.profiles p ON p.org_id = je.org_id
    WHERE je.id = entry_id AND p.id = auth.uid()
  ));
CREATE POLICY "jel_delete" ON public.journal_entry_lines FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.journal_entries je
    JOIN public.profiles p ON p.org_id = je.org_id
    WHERE je.id = entry_id AND p.id = auth.uid()
  ));
CREATE POLICY "jel_platform_admin" ON public.journal_entry_lines FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_platform_admin = true));


-- ─────────────────────────────────────────────
-- 6. FK: bank_transactions.journal_entry_id
-- ─────────────────────────────────────────────
ALTER TABLE public.bank_transactions
  ADD CONSTRAINT fk_bt_journal_entry
  FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id);


-- ─────────────────────────────────────────────
-- 7. SEED: CHART OF ACCOUNTS (Indian Schedule III)
--    is_system = true, org_id = NULL → visible to all orgs
-- ─────────────────────────────────────────────
INSERT INTO public.chart_of_accounts
  (code, name, type, sub_type, normal_balance, is_bank_account, is_system, parent_code)
VALUES
  -- ── ASSETS ──────────────────────────────────────────────────
  ('1000', 'Fixed Assets',                       'asset', 'fixed_asset',    'debit',  false, true, NULL),
  ('1010', 'Computer & IT Equipment',             'asset', 'fixed_asset',    'debit',  false, true, '1000'),
  ('1020', 'Furniture & Fixtures',                'asset', 'fixed_asset',    'debit',  false, true, '1000'),
  ('1030', 'Office Equipment',                    'asset', 'fixed_asset',    'debit',  false, true, '1000'),

  ('1100', 'Current Assets',                      'asset', 'current_asset',  'debit',  false, true, NULL),
  ('1110', 'Cash in Hand',                        'asset', 'current_asset',  'debit',  false, true, '1100'),
  ('1111', 'Bank - IDFC FIRST (A/C 10288101744)', 'asset', 'bank',           'debit',  true,  true, '1100'),
  ('1120', 'Trade Receivables',                   'asset', 'current_asset',  'debit',  false, true, '1100'),
  ('1130', 'GST Input Credit - CGST',             'asset', 'current_asset',  'debit',  false, true, '1100'),
  ('1131', 'GST Input Credit - SGST',             'asset', 'current_asset',  'debit',  false, true, '1100'),
  ('1132', 'GST Input Credit - IGST',             'asset', 'current_asset',  'debit',  false, true, '1100'),
  ('1140', 'Advance & Prepaid Expenses',          'asset', 'current_asset',  'debit',  false, true, '1100'),
  ('1150', 'TDS Receivable',                      'asset', 'current_asset',  'debit',  false, true, '1100'),
  ('1160', 'Other Current Assets',               'asset', 'current_asset',  'debit',  false, true, '1100'),

  -- ── EQUITY ──────────────────────────────────────────────────
  ('2000', 'Shareholders'' Funds',                'equity', 'equity',        'credit', false, true, NULL),
  ('2010', 'Share Capital',                       'equity', 'equity',        'credit', false, true, '2000'),
  ('2020', 'Retained Earnings',                   'equity', 'equity',        'credit', false, true, '2000'),

  -- ── LIABILITIES ─────────────────────────────────────────────
  ('2100', 'Long-term Borrowings',                'liability', 'non_current_liability', 'credit', false, true, NULL),
  ('2110', 'Loan from Director - Amit Sengupta',  'liability', 'non_current_liability', 'credit', false, true, '2100'),
  ('2111', 'Accrued Interest - Director''s Loan', 'liability', 'non_current_liability', 'credit', false, true, '2100'),

  ('2200', 'Current Liabilities',                 'liability', 'current_liability', 'credit', false, true, NULL),
  ('2210', 'Trade Payables',                      'liability', 'current_liability', 'credit', false, true, '2200'),
  ('2220', 'GST Output - CGST',                   'liability', 'current_liability', 'credit', false, true, '2200'),
  ('2221', 'GST Output - SGST',                   'liability', 'current_liability', 'credit', false, true, '2200'),
  ('2222', 'GST Output - IGST',                   'liability', 'current_liability', 'credit', false, true, '2200'),
  ('2230', 'TDS Payable',                         'liability', 'current_liability', 'credit', false, true, '2200'),
  ('2240', 'Salary Payable',                      'liability', 'current_liability', 'credit', false, true, '2200'),
  ('2250', 'Other Current Liabilities',           'liability', 'current_liability', 'credit', false, true, '2200'),

  -- ── INCOME ──────────────────────────────────────────────────
  ('4000', 'Revenue from Operations',             'income', 'operating_revenue', 'credit', false, true, NULL),
  ('4010', 'Revenue - WorkSync',                  'income', 'operating_revenue', 'credit', false, true, '4000'),
  ('4020', 'Revenue - Field-Sync',                'income', 'operating_revenue', 'credit', false, true, '4000'),
  ('4030', 'Revenue - SMB Connect',               'income', 'operating_revenue', 'credit', false, true, '4000'),
  ('4040', 'Revenue - ATS',                       'income', 'operating_revenue', 'credit', false, true, '4000'),
  ('4050', 'Revenue - Email Platform',            'income', 'operating_revenue', 'credit', false, true, '4000'),
  ('4060', 'Revenue - WA Platform',               'income', 'operating_revenue', 'credit', false, true, '4000'),
  ('4070', 'Revenue - Event-Sync',                'income', 'operating_revenue', 'credit', false, true, '4000'),
  ('4080', 'Revenue - Vendor Verification',       'income', 'operating_revenue', 'credit', false, true, '4000'),
  ('4090', 'Revenue - CRM / Consulting',          'income', 'operating_revenue', 'credit', false, true, '4000'),
  ('4099', 'Revenue - Other Services',            'income', 'operating_revenue', 'credit', false, true, '4000'),

  ('4100', 'Other Income',                        'income', 'other_income',      'credit', false, true, NULL),
  ('4110', 'Interest Income',                     'income', 'other_income',      'credit', false, true, '4100'),
  ('4120', 'Miscellaneous Income',                'income', 'other_income',      'credit', false, true, '4100'),

  -- ── EXPENSES ────────────────────────────────────────────────
  ('5000', 'Expenses',                            'expense', 'expense', 'debit', false, true, NULL),
  ('5010', 'Salaries & Wages',                    'expense', 'expense', 'debit', false, true, '5000'),
  ('5020', 'Rent',                                'expense', 'expense', 'debit', false, true, '5000'),
  ('5030', 'Software & Subscriptions',            'expense', 'expense', 'debit', false, true, '5000'),
  ('5040', 'Professional Charges',                'expense', 'expense', 'debit', false, true, '5000'),
  ('5050', 'Bank Charges',                        'expense', 'expense', 'debit', false, true, '5000'),
  ('5060', 'Travel & Conveyance',                 'expense', 'expense', 'debit', false, true, '5000'),
  ('5070', 'Office Expenses',                     'expense', 'expense', 'debit', false, true, '5000'),
  ('5080', 'Interest on Director''s Loan',        'expense', 'expense', 'debit', false, true, '5000'),
  ('5090', 'Depreciation',                        'expense', 'expense', 'debit', false, true, '5000'),
  ('5100', 'Advertising & Marketing',             'expense', 'expense', 'debit', false, true, '5000'),
  ('5110', 'Communication Expenses',              'expense', 'expense', 'debit', false, true, '5000'),
  ('5120', 'Miscellaneous Expenses',              'expense', 'expense', 'debit', false, true, '5000')
ON CONFLICT DO NOTHING;
