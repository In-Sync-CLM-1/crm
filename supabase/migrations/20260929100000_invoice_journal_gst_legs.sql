-- Invoice journal entries were posted without GST legs (items not yet inserted at trigger time).

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

  -- The document row is inserted before its line items, so the item sums are
  -- still zero when the trigger fires. Fall back to the header totals so the
  -- GST legs are never dropped (that left the entry out of balance).
  IF v_cgst_total + v_sgst_total + v_igst_total = 0 AND d.total_amount - d.subtotal > 0 THEN
    IF COALESCE(d.supply_type, '') = 'inter_state' THEN
      v_igst_total := d.total_amount - d.subtotal;
    ELSE
      v_cgst_total := ROUND((d.total_amount - d.subtotal) / 2, 2);
      v_sgst_total := (d.total_amount - d.subtotal) - v_cgst_total;
    END IF;
  END IF;

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

-- Repair invoice entries already posted without their GST legs.
DO $$
DECLARE
  r        RECORD;
  v_igst   UUID; v_cgst UUID; v_sgst UUID;
  v_gst    NUMERIC; v_half NUMERIC;
BEGIN
  FOR r IN
    SELECT je.id AS entry_id, d.supply_type, d.org_id,
           SUM(l.debit) - SUM(l.credit) AS gap
    FROM public.journal_entries je
    JOIN public.journal_entry_lines l ON l.entry_id = je.id
    JOIN public.billing_documents d ON d.id = je.billing_document_id
    WHERE je.source = 'invoice'
    GROUP BY je.id, d.supply_type, d.org_id
    HAVING SUM(l.debit) - SUM(l.credit) > 0
  LOOP
    v_gst := r.gap;
    SELECT id INTO v_igst FROM public.chart_of_accounts WHERE code='2222' AND (org_id=r.org_id OR org_id IS NULL) ORDER BY (org_id=r.org_id) DESC NULLS LAST LIMIT 1;
    SELECT id INTO v_cgst FROM public.chart_of_accounts WHERE code='2220' AND (org_id=r.org_id OR org_id IS NULL) ORDER BY (org_id=r.org_id) DESC NULLS LAST LIMIT 1;
    SELECT id INTO v_sgst FROM public.chart_of_accounts WHERE code='2221' AND (org_id=r.org_id OR org_id IS NULL) ORDER BY (org_id=r.org_id) DESC NULLS LAST LIMIT 1;
    IF COALESCE(r.supply_type,'') = 'inter_state' THEN
      INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, sort_order) VALUES (r.entry_id, v_igst, 0, v_gst, 2);
    ELSE
      v_half := ROUND(v_gst / 2, 2);
      INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, sort_order) VALUES (r.entry_id, v_cgst, 0, v_half, 2);
      INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, sort_order) VALUES (r.entry_id, v_sgst, 0, v_gst - v_half, 3);
    END IF;
  END LOOP;
END;
$$;
