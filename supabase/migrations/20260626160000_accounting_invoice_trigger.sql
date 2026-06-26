-- Item 1: Auto-create journal entries when invoice / credit note is issued
-- Item 1 also expands the source enum to include 'invoice' and 'credit_note'

-- 1. Extend source enum
ALTER TABLE public.journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_source_check;

ALTER TABLE public.journal_entries
  ADD CONSTRAINT journal_entries_source_check
    CHECK (source IN (
      'bank_import','manual','system_interest',
      'director_settlement','director_salary',
      'invoice','credit_note'
    ));

-- 2. Trigger function
CREATE OR REPLACE FUNCTION public.accounting_on_document_issued()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
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
  -- Only invoice and credit_note
  IF NEW.doc_type NOT IN ('invoice', 'credit_note') THEN RETURN NEW; END IF;
  -- Only on transition TO 'issued'
  IF NEW.status != 'issued'  THEN RETURN NEW; END IF;
  IF OLD.status = 'issued'   THEN RETURN NEW; END IF;
  -- Idempotency guard
  IF EXISTS (
    SELECT 1 FROM public.journal_entries
    WHERE billing_document_id = NEW.id
      AND source IN ('invoice', 'credit_note')
  ) THEN RETURN NEW; END IF;

  -- Resolve accounts (org-specific overrides system)
  SELECT id INTO v_tr_id FROM public.chart_of_accounts
    WHERE code = '1120' AND (org_id = NEW.org_id OR org_id IS NULL)
    ORDER BY (org_id = NEW.org_id) DESC NULLS LAST LIMIT 1;
  SELECT id INTO v_rev_id FROM public.chart_of_accounts
    WHERE code = '4099' AND (org_id = NEW.org_id OR org_id IS NULL)
    ORDER BY (org_id = NEW.org_id) DESC NULLS LAST LIMIT 1;
  SELECT id INTO v_cgst_id FROM public.chart_of_accounts
    WHERE code = '2220' AND (org_id = NEW.org_id OR org_id IS NULL)
    ORDER BY (org_id = NEW.org_id) DESC NULLS LAST LIMIT 1;
  SELECT id INTO v_sgst_id FROM public.chart_of_accounts
    WHERE code = '2221' AND (org_id = NEW.org_id OR org_id IS NULL)
    ORDER BY (org_id = NEW.org_id) DESC NULLS LAST LIMIT 1;
  SELECT id INTO v_igst_id FROM public.chart_of_accounts
    WHERE code = '2222' AND (org_id = NEW.org_id OR org_id IS NULL)
    ORDER BY (org_id = NEW.org_id) DESC NULLS LAST LIMIT 1;

  IF v_tr_id IS NULL OR v_rev_id IS NULL THEN RETURN NEW; END IF;

  -- GST totals from line items
  SELECT COALESCE(SUM(cgst),0), COALESCE(SUM(sgst),0), COALESCE(SUM(igst),0)
  INTO v_cgst_total, v_sgst_total, v_igst_total
  FROM public.billing_document_items
  WHERE document_id = NEW.id;

  -- Create journal entry header
  INSERT INTO public.journal_entries (org_id, entry_date, reference, narration, source, billing_document_id)
  VALUES (
    NEW.org_id,
    NEW.doc_date,
    NEW.doc_number,
    CASE NEW.doc_type
      WHEN 'invoice'     THEN 'Invoice raised — '     || NEW.doc_number || ' — ' || NEW.client_name
      WHEN 'credit_note' THEN 'Credit Note issued — ' || NEW.doc_number || ' — ' || NEW.client_name
    END,
    NEW.doc_type,
    NEW.id
  ) RETURNING id INTO v_je_id;

  IF NEW.doc_type = 'invoice' THEN
    -- Dr Trade Receivables (full invoice amount incl GST)
    INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, sort_order)
      VALUES (v_je_id, v_tr_id, NEW.total_amount, 0, 0);
    -- Cr Revenue (subtotal / pre-GST)
    INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, sort_order)
      VALUES (v_je_id, v_rev_id, 0, NEW.subtotal, 1);
    -- Cr GST Output
    IF COALESCE(NEW.supply_type, '') = 'inter_state' THEN
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
    -- Cr Trade Receivables (reduces AR)
    INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, sort_order)
      VALUES (v_je_id, v_tr_id, 0, NEW.total_amount, 0);
    -- Dr Revenue (reverses revenue recognition)
    INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, sort_order)
      VALUES (v_je_id, v_rev_id, NEW.subtotal, 0, 1);
    -- Dr GST Output (reverses GST liability)
    IF COALESCE(NEW.supply_type, '') = 'inter_state' THEN
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

  RETURN NEW;
END;
$$;

-- 3. Attach trigger
DROP TRIGGER IF EXISTS trg_billing_document_issued ON public.billing_documents;
CREATE TRIGGER trg_billing_document_issued
  AFTER UPDATE OF status ON public.billing_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.accounting_on_document_issued();
