-- Wire Billing into the double-entry books.
--
-- Two gaps found:
-- 1. accounting_on_document_issued() (added 2026-06-26) only fires on a
--    status transition TO 'issued' — a status this app never actually sets
--    (invoices go draft -> sent -> partially_paid/paid). It has never fired.
--    Fixed to fire on INSERT instead, and scoped to Prosync-issued documents
--    only (ECR-issued rows carry a frozen seller_snapshot and must stay out
--    of Prosync's books).
-- 2. Recording a payment in Billing never touched the ledger at all. It now
--    posts Dr Undeposited Funds (clearing account, since the money isn't
--    confirmed in the bank yet) [+ Dr TDS Receivable] / Cr Trade Receivables.
--    When the matching bank-statement line later shows up, the app clears
--    Undeposited Funds against Bank — never Trade Receivables again.

-- ── 1. New clearing account ──────────────────────────────────────
INSERT INTO public.chart_of_accounts
  (code, name, type, sub_type, normal_balance, is_bank_account, is_system, parent_code)
VALUES
  ('1121', 'Undeposited Funds - Customer Payments', 'asset', 'current_asset', 'debit', false, true, '1100')
ON CONFLICT DO NOTHING;

-- ── 2. Extend source enum for the new payment-side postings ──────
ALTER TABLE public.journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_source_check;
ALTER TABLE public.journal_entries
  ADD CONSTRAINT journal_entries_source_check
    CHECK (source IN (
      'bank_import','manual','system_interest',
      'director_settlement','director_salary',
      'invoice','credit_note',
      'billing_payment','billing_payment_clearing'
    ));

-- ── 2b. journal_entries.billing_document_id had no ON DELETE action, which
-- would block deleting any invoice/credit-note once it has a posted entry.
-- Deleting the document should take its GL entry with it.
ALTER TABLE public.journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_billing_document_id_fkey;
ALTER TABLE public.journal_entries
  ADD CONSTRAINT journal_entries_billing_document_id_fkey
    FOREIGN KEY (billing_document_id) REFERENCES public.billing_documents(id) ON DELETE CASCADE;

-- bank_transactions.journal_entry_id had no ON DELETE action either, which
-- would now block the cascade above whenever a categorized bank row still
-- points at the entry being removed. Unlink it (never delete the actual
-- bank statement history) rather than block the invoice delete.
ALTER TABLE public.bank_transactions
  DROP CONSTRAINT IF EXISTS fk_bt_journal_entry;
ALTER TABLE public.bank_transactions
  ADD CONSTRAINT fk_bt_journal_entry
    FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE SET NULL;

-- ── 3. Tracking columns ───────────────────────────────────────────
ALTER TABLE public.billing_payments
  ADD COLUMN IF NOT EXISTS journal_entry_id UUID REFERENCES public.journal_entries(id) ON DELETE SET NULL;
ALTER TABLE public.billing_payments
  ADD COLUMN IF NOT EXISTS cleared_journal_entry_id UUID REFERENCES public.journal_entries(id) ON DELETE SET NULL;
ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS suggested_billing_payment_id UUID REFERENCES public.billing_payments(id) ON DELETE SET NULL;

-- ── 4. Invoice / credit-note posting (idempotent, callable directly) ──
CREATE OR REPLACE FUNCTION public.accounting_post_document_journal(p_doc_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d            public.billing_documents%ROWTYPE;
  v_je_id      UUID;
  v_tr_id      UUID;
  v_rev_id     UUID;
  v_cgst_id    UUID;
  v_sgst_id    UUID;
  v_igst_id    UUID;
  v_cgst_total NUMERIC := 0;
  v_sgst_total NUMERIC := 0;
  v_igst_total NUMERIC := 0;
BEGIN
  SELECT * INTO d FROM public.billing_documents WHERE id = p_doc_id;
  IF d.id IS NULL THEN RETURN; END IF;
  IF d.doc_type NOT IN ('invoice', 'credit_note') THEN RETURN; END IF;

  -- Accounting represents Prosync AI Solutions' own books only.
  IF NOT (COALESCE(d.seller_snapshot->>'company_name', '') ILIKE '%PROSYNC%') THEN RETURN; END IF;

  IF EXISTS (
    SELECT 1 FROM public.journal_entries
    WHERE billing_document_id = d.id AND source IN ('invoice', 'credit_note')
  ) THEN RETURN; END IF;

  SELECT id INTO v_tr_id FROM public.chart_of_accounts
    WHERE code = '1120' AND (org_id = d.org_id OR org_id IS NULL)
    ORDER BY (org_id = d.org_id) DESC NULLS LAST LIMIT 1;
  SELECT id INTO v_rev_id FROM public.chart_of_accounts
    WHERE code = '4099' AND (org_id = d.org_id OR org_id IS NULL)
    ORDER BY (org_id = d.org_id) DESC NULLS LAST LIMIT 1;
  SELECT id INTO v_cgst_id FROM public.chart_of_accounts
    WHERE code = '2220' AND (org_id = d.org_id OR org_id IS NULL)
    ORDER BY (org_id = d.org_id) DESC NULLS LAST LIMIT 1;
  SELECT id INTO v_sgst_id FROM public.chart_of_accounts
    WHERE code = '2221' AND (org_id = d.org_id OR org_id IS NULL)
    ORDER BY (org_id = d.org_id) DESC NULLS LAST LIMIT 1;
  SELECT id INTO v_igst_id FROM public.chart_of_accounts
    WHERE code = '2222' AND (org_id = d.org_id OR org_id IS NULL)
    ORDER BY (org_id = d.org_id) DESC NULLS LAST LIMIT 1;

  IF v_tr_id IS NULL OR v_rev_id IS NULL THEN RETURN; END IF;

  SELECT COALESCE(SUM(cgst), 0), COALESCE(SUM(sgst), 0), COALESCE(SUM(igst), 0)
  INTO v_cgst_total, v_sgst_total, v_igst_total
  FROM public.billing_document_items
  WHERE document_id = d.id;

  INSERT INTO public.journal_entries (org_id, entry_date, reference, narration, source, billing_document_id)
  VALUES (
    d.org_id,
    d.doc_date,
    d.doc_number,
    CASE d.doc_type
      WHEN 'invoice'     THEN 'Invoice raised — '     || d.doc_number || ' — ' || d.client_name
      WHEN 'credit_note' THEN 'Credit Note issued — ' || d.doc_number || ' — ' || d.client_name
    END,
    d.doc_type,
    d.id
  ) RETURNING id INTO v_je_id;

  IF d.doc_type = 'invoice' THEN
    INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, sort_order)
      VALUES (v_je_id, v_tr_id, d.total_amount, 0, 0);
    INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, sort_order)
      VALUES (v_je_id, v_rev_id, 0, d.subtotal, 1);
    IF COALESCE(d.supply_type, '') = 'inter_state' THEN
      IF v_igst_id IS NOT NULL AND v_igst_total > 0 THEN
        INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, sort_order)
          VALUES (v_je_id, v_igst_id, 0, v_igst_total, 2);
      END IF;
    ELSE
      IF v_cgst_id IS NOT NULL AND v_cgst_total > 0 THEN
        INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, sort_order)
          VALUES (v_je_id, v_cgst_id, 0, v_cgst_total, 2);
      END IF;
      IF v_sgst_id IS NOT NULL AND v_sgst_total > 0 THEN
        INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, sort_order)
          VALUES (v_je_id, v_sgst_id, 0, v_sgst_total, 3);
      END IF;
    END IF;
  ELSE -- credit_note: reverse entry
    INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, sort_order)
      VALUES (v_je_id, v_tr_id, 0, d.total_amount, 0);
    INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, sort_order)
      VALUES (v_je_id, v_rev_id, d.subtotal, 0, 1);
    IF COALESCE(d.supply_type, '') = 'inter_state' THEN
      IF v_igst_id IS NOT NULL AND v_igst_total > 0 THEN
        INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, sort_order)
          VALUES (v_je_id, v_igst_id, v_igst_total, 0, 2);
      END IF;
    ELSE
      IF v_cgst_id IS NOT NULL AND v_cgst_total > 0 THEN
        INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, sort_order)
          VALUES (v_je_id, v_cgst_id, v_cgst_total, 0, 2);
      END IF;
      IF v_sgst_id IS NOT NULL AND v_sgst_total > 0 THEN
        INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, sort_order)
          VALUES (v_je_id, v_sgst_id, v_sgst_total, 0, 3);
      END IF;
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.accounting_on_document_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.accounting_post_document_journal(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_billing_document_issued ON public.billing_documents;
DROP TRIGGER IF EXISTS trg_billing_document_created ON public.billing_documents;
CREATE TRIGGER trg_billing_document_created
  AFTER INSERT ON public.billing_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.accounting_on_document_created();

-- ── 5. Payment posting (idempotent, callable directly) ────────────
CREATE OR REPLACE FUNCTION public.accounting_post_payment_journal(p_payment_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p          public.billing_payments%ROWTYPE;
  d          public.billing_documents%ROWTYPE;
  v_je_id    UUID;
  v_undep_id UUID;
  v_tr_id    UUID;
  v_tds_id   UUID;
BEGIN
  SELECT * INTO p FROM public.billing_payments WHERE id = p_payment_id;
  IF p.id IS NULL OR p.journal_entry_id IS NOT NULL THEN RETURN; END IF;

  SELECT * INTO d FROM public.billing_documents WHERE id = p.document_id;
  IF d.id IS NULL THEN RETURN; END IF;
  IF NOT (COALESCE(d.seller_snapshot->>'company_name', '') ILIKE '%PROSYNC%') THEN RETURN; END IF;

  SELECT id INTO v_undep_id FROM public.chart_of_accounts
    WHERE code = '1121' AND (org_id = p.org_id OR org_id IS NULL)
    ORDER BY (org_id = p.org_id) DESC NULLS LAST LIMIT 1;
  SELECT id INTO v_tr_id FROM public.chart_of_accounts
    WHERE code = '1120' AND (org_id = p.org_id OR org_id IS NULL)
    ORDER BY (org_id = p.org_id) DESC NULLS LAST LIMIT 1;
  SELECT id INTO v_tds_id FROM public.chart_of_accounts
    WHERE code = '1150' AND (org_id = p.org_id OR org_id IS NULL)
    ORDER BY (org_id = p.org_id) DESC NULLS LAST LIMIT 1;

  IF v_undep_id IS NULL OR v_tr_id IS NULL THEN RETURN; END IF;

  INSERT INTO public.journal_entries (org_id, entry_date, reference, narration, source, billing_document_id)
  VALUES (
    p.org_id, p.payment_date, d.doc_number,
    'Payment recorded — ' || d.doc_number || ' — ' || d.client_name,
    'billing_payment', d.id
  ) RETURNING id INTO v_je_id;

  INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, sort_order)
    VALUES (v_je_id, v_undep_id, p.amount, 0, 0);

  IF COALESCE(p.tds_amount, 0) > 0 AND v_tds_id IS NOT NULL THEN
    INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, sort_order)
      VALUES (v_je_id, v_tds_id, p.tds_amount, 0, 1);
  END IF;

  INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, sort_order)
    VALUES (v_je_id, v_tr_id, 0, p.amount + COALESCE(p.tds_amount, 0), 2);

  UPDATE public.billing_payments SET journal_entry_id = v_je_id WHERE id = p.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.accounting_on_payment_recorded()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.accounting_post_payment_journal(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_billing_payment_recorded ON public.billing_payments;
CREATE TRIGGER trg_billing_payment_recorded
  AFTER INSERT ON public.billing_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.accounting_on_payment_recorded();

-- ── 6. Backfill existing Prosync documents/payments that pre-date this fix ──
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT id FROM public.billing_documents
    WHERE doc_type IN ('invoice', 'credit_note')
      AND seller_snapshot->>'company_name' ILIKE '%PROSYNC%'
  LOOP
    PERFORM public.accounting_post_document_journal(r.id);
  END LOOP;

  FOR r IN
    SELECT p.id FROM public.billing_payments p
    JOIN public.billing_documents d ON d.id = p.document_id
    WHERE d.seller_snapshot->>'company_name' ILIKE '%PROSYNC%'
      AND p.journal_entry_id IS NULL
  LOOP
    PERFORM public.accounting_post_payment_journal(r.id);
  END LOOP;
END $$;
