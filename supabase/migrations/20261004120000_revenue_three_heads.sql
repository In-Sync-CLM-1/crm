-- Receipts in Prosync's accounts fall into three heads only:
--   Platform Fee (licence / subscription / platform fee), Wallet (prepaid
--   recharges and calling credits), Other Sources (everything else).
-- Invoice revenue is split across these heads by line item, instead of
-- landing wholesale in one account. Idempotent.

UPDATE public.chart_of_accounts SET name = 'Revenue - Platform Fee'   WHERE code = '4095';
UPDATE public.chart_of_accounts SET name = 'Revenue - Other Sources'  WHERE code = '4099';
INSERT INTO public.chart_of_accounts
  (code, name, type, sub_type, normal_balance, is_bank_account, is_system, parent_code)
VALUES
  ('4096', 'Revenue - Wallet', 'income', 'operating_revenue', 'credit', false, true, '4000')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.revenue_head_for_item(p_desc text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_desc ~* '(wallet|recharge|recherge|top-?up|ai calling|ai voice)' THEN '4096'
    WHEN p_desc ~* '(licen[cs]e|platform|subscription)' THEN '4095'
    ELSE '4099'
  END
$$;

-- Rewrites an invoice's revenue credit as one line per head, from its items.
CREATE OR REPLACE FUNCTION public.accounting_resplit_revenue(p_doc_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_je uuid; v_org uuid; v_sub numeric; v_items numeric; r record; v_n int := 0;
BEGIN
  SELECT je.id, je.org_id, d.subtotal INTO v_je, v_org, v_sub
    FROM journal_entries je JOIN billing_documents d ON d.id = je.billing_document_id
   WHERE je.billing_document_id = p_doc_id AND je.source = 'invoice' AND d.doc_type = 'invoice';
  IF v_je IS NULL THEN RETURN; END IF;
  SELECT COALESCE(SUM(taxable), 0) INTO v_items FROM billing_document_items WHERE document_id = p_doc_id;
  IF v_items <> v_sub THEN RETURN; END IF;   -- items not fully written yet

  DELETE FROM journal_entry_lines WHERE entry_id = v_je AND account_id IN
    (SELECT id FROM chart_of_accounts WHERE code IN ('4095','4096','4099') AND (org_id = v_org OR org_id IS NULL));
  FOR r IN
    SELECT revenue_head_for_item(description) AS code, SUM(taxable) AS amt
      FROM billing_document_items WHERE document_id = p_doc_id GROUP BY 1 ORDER BY 1
  LOOP
    INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, sort_order)
    SELECT v_je, a.id, 0, r.amt, 1 + v_n
      FROM chart_of_accounts a WHERE a.code = r.code AND (a.org_id = v_org OR a.org_id IS NULL)
     ORDER BY (a.org_id IS NULL) LIMIT 1;
    v_n := v_n + 1;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.trg_resplit_revenue_on_items()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM accounting_resplit_revenue(COALESCE(NEW.document_id, OLD.document_id));
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_resplit_revenue_on_items ON public.billing_document_items;
CREATE TRIGGER trg_resplit_revenue_on_items
  AFTER INSERT OR UPDATE OR DELETE ON public.billing_document_items
  FOR EACH ROW EXECUTE FUNCTION public.trg_resplit_revenue_on_items();

-- Historical: re-split every invoice already in the books
SELECT public.accounting_resplit_revenue(billing_document_id)
  FROM public.journal_entries WHERE source = 'invoice';

-- Non-invoice credits previously parked in CRM/Consulting are Other Sources
UPDATE public.journal_entry_lines l
   SET account_id = (SELECT id FROM public.chart_of_accounts WHERE code = '4099' ORDER BY (org_id IS NULL) LIMIT 1)
 WHERE account_id IN (SELECT id FROM public.chart_of_accounts WHERE code = '4090');
