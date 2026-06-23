// Revenue/GST roll-ups read both proformas and the tax invoices they were
// converted into. A converted proforma is the same money as its invoice, so
// summing both double-counts it. Given a set of billing_documents rows, drop
// any proforma that an invoice in the same set was converted from
// (converted_from_id). Whether the converted invoice "counts" is decided by the
// query that produced the set (e.g. status filter), so we only need to look at
// the invoices actually present here.
export function dropSupersededProformas<
  T extends { id: string; doc_type: string; converted_from_id?: string | null }
>(docs: T[]): T[] {
  const supersededProformaIds = new Set(
    docs
      .filter((d) => d.doc_type === "invoice" && d.converted_from_id)
      .map((d) => d.converted_from_id as string)
  );
  return docs.filter(
    (d) => !(d.doc_type === "proforma" && supersededProformaIds.has(d.id))
  );
}
