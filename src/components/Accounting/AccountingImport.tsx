import { useState, useRef } from "react";
import { Upload, FileText, CheckCircle, AlertCircle, X, Building2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAccountingData } from "@/hooks/useAccountingData";
import { useToast } from "@/hooks/use-toast";
import type { ParsedBankRow } from "@/types/accounting";
import { format } from "date-fns";

function parseAmount(raw: string): number {
  if (!raw || raw.trim() === "" || raw.trim() === "-") return 0;
  return parseFloat(raw.replace(/,/g, "").trim()) || 0;
}

function parseDate(raw: string): string {
  if (!raw) return "";
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) return `${slash[3]}-${slash[2].padStart(2,"0")}-${slash[1].padStart(2,"0")}`;
  const dash = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dash) return `${dash[3]}-${dash[2].padStart(2,"0")}-${dash[1].padStart(2,"0")}`;
  const months: Record<string,string> = {
    jan:"01",feb:"02",mar:"03",apr:"04",may:"05",jun:"06",
    jul:"07",aug:"08",sep:"09",oct:"10",nov:"11",dec:"12",
  };
  const mmm = raw.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (mmm) {
    const m = months[mmm[2].toLowerCase()];
    return m ? `${mmm[3]}-${m}-${mmm[1].padStart(2,"0")}` : "";
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return "";
}

function parseBankCsv(text: string): ParsedBankRow[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  let headerIdx = -1;
  let headers: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const cols = lines[i].split(",").map(c => c.replace(/^"|"$/g, "").toLowerCase().trim());
    if (cols.some(c => c.includes("date")) && cols.some(c => c.includes("debit") || c.includes("credit") || c.includes("amount") || c.includes("withdrawal") || c.includes("deposit"))) {
      headerIdx = i;
      headers = cols;
      break;
    }
  }
  if (headerIdx === -1) throw new Error("Could not find transaction header row. Make sure the file has Date and Amount/Debit/Credit columns.");

  const idx = (keywords: string[]) => {
    const i = headers.findIndex(h => keywords.some(k => h.includes(k)));
    return i === -1 ? null : i;
  };

  const dateCol    = idx(["txn date","transaction date","date","value date"]);
  const vdateCol   = idx(["value date"]);
  const descCol    = idx(["description","narration","remarks","particulars","details","transaction remarks"]);
  const refCol     = idx(["ref no","cheque","reference","chq"]);
  // Handle both separate debit/credit columns and combined withdrawal/deposit or amount columns
  const debitCol   = idx(["debit","withdrawal","dr"]);
  const creditCol  = idx(["credit","deposit","cr"]);
  const amountCol  = idx(["amount"]);
  const balCol     = idx(["balance"]);

  if (dateCol === null) throw new Error("CSV is missing a Date column.");
  if (debitCol === null && creditCol === null && amountCol === null) {
    throw new Error("CSV is missing Amount/Debit/Credit columns.");
  }

  const rows: ParsedBankRow[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = lines[i].match(/(".*?"|[^,]+|(?<=,)(?=,)|(?<=,)$|^(?=,))/g)?.map(
      c => c.replace(/^"|"$/g, "").trim()
    ) ?? lines[i].split(",").map(c => c.trim());

    const dateStr = cols[dateCol] || "";
    if (!dateStr || dateStr.toLowerCase().includes("total") || dateStr.toLowerCase().includes("opening")) continue;

    const txnDate = parseDate(dateStr);
    if (!txnDate) continue;

    let debit = 0, credit = 0;
    if (debitCol !== null && creditCol !== null) {
      debit  = parseAmount(cols[debitCol]  ?? "");
      credit = parseAmount(cols[creditCol] ?? "");
    } else if (amountCol !== null) {
      // Single amount column — negative = debit, positive = credit (or vice versa — handle both)
      const raw = (cols[amountCol] ?? "").trim();
      const isNeg = raw.startsWith("-") || raw.startsWith("(");
      const amt = parseAmount(raw.replace(/^\(|\)$/g, ""));
      if (isNeg) debit = amt; else credit = amt;
    }

    if (debit === 0 && credit === 0) continue;

    rows.push({
      transaction_date: txnDate,
      value_date: vdateCol !== null ? (parseDate(cols[vdateCol] || "") || txnDate) : txnDate,
      narration: descCol !== null ? (cols[descCol] || "").replace(/\s+/g, " ") : "",
      reference: refCol !== null ? (cols[refCol] || "") : "",
      debit,
      credit,
      balance: balCol !== null ? parseAmount(cols[balCol] || "") : null,
    });
  }
  return rows;
}

type StatementType = "company" | "director_personal";

export function AccountingImport() {
  const { importStatement, statements, statementsLoading } = useAccountingData();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [stmtType, setStmtType] = useState<StatementType>("company");
  const [parsed, setParsed] = useState<ParsedBankRow[] | null>(null);
  const [filename, setFilename] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);

  function handleFile(file: File) {
    setParseError(null);
    setParsed(null);
    setResult(null);
    setFilename(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const rows = parseBankCsv(text);
        if (rows.length === 0) throw new Error("No transactions found in the file.");
        setParsed(rows);
      } catch (err: unknown) {
        setParseError(err instanceof Error ? err.message : "Could not parse the file.");
      }
    };
    reader.readAsText(file);
  }

  function handleTypeChange(t: StatementType) {
    setStmtType(t);
    setParsed(null);
    setFilename("");
    setParseError(null);
    setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleImport() {
    if (!parsed || parsed.length === 0) return;
    setImporting(true);
    try {
      const relevantRows = stmtType === "director_personal" ? parsed.filter(r => r.debit > 0) : parsed;
      const dates = relevantRows.map(r => r.transaction_date).sort();
      const res = await importStatement.mutateAsync({
        rows: parsed,
        filename,
        fromDate: dates[0],
        toDate: dates[dates.length - 1],
        statementType: stmtType,
      });
      setResult({ imported: res.imported, skipped: res.skipped });
      setParsed(null);
      toast({
        title: "Import complete",
        description: `${res.imported} transactions imported${res.skipped > 0 ? `, ${res.skipped} duplicates skipped` : ""}.`,
      });
    } catch (err: unknown) {
      toast({ title: "Import failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setImporting(false);
    }
  }

  const isPersonal = stmtType === "director_personal";

  // Preview: for personal statement, only show debit rows
  const previewRows = isPersonal ? (parsed?.filter(r => r.debit > 0) ?? []) : (parsed ?? []);
  const autoCount = isPersonal
    ? 0
    : (parsed?.filter(r => r.narration.toUpperCase().includes("AMIT SENGUPTA")).length ?? 0);

  return (
    <div className="space-y-6">
      {/* Statement type selector */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Which account is this statement from?</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => handleTypeChange("company")}
              className={`flex items-start gap-3 rounded-lg border-2 p-4 text-left transition-colors ${
                stmtType === "company"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-muted-foreground"
              }`}
            >
              <Building2 className="h-5 w-5 mt-0.5 shrink-0 text-primary" />
              <div>
                <p className="font-medium text-sm">Prosync Company Bank</p>
                <p className="text-xs text-muted-foreground mt-0.5">IDFC FIRST Bank — company account</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => handleTypeChange("director_personal")}
              className={`flex items-start gap-3 rounded-lg border-2 p-4 text-left transition-colors ${
                stmtType === "director_personal"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-muted-foreground"
              }`}
            >
              <User className="h-5 w-5 mt-0.5 shrink-0 text-primary" />
              <div>
                <p className="font-medium text-sm">Amit Sengupta — Personal Account</p>
                <p className="text-xs text-muted-foreground mt-0.5">Business expenses paid personally</p>
              </div>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Upload card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {isPersonal ? "Upload Amit's Personal Bank Statement" : "Upload Company Bank Statement"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isPersonal && (
            <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-sm text-blue-800">
              Only <strong>debit transactions</strong> (money out) will be imported as business expenses. Credits are ignored.
              Each imported transaction will go to the review queue for expense categorization.
            </div>
          )}

          <div
            className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
            onClick={() => fileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) handleFile(f);
            }}
          >
            <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              Drag & drop your bank statement CSV here, or click to browse
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {isPersonal
                ? "Export statement from your bank's internet banking as CSV"
                : "Download from Internet Banking → Accounts → Statement → Export as CSV"}
            </p>
          </div>
          <input ref={fileRef} type="file" accept=".csv" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
          />

          {parseError && (
            <div className="flex items-start gap-2 text-destructive text-sm bg-destructive/10 p-3 rounded-md">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{parseError}</span>
            </div>
          )}

          {parsed && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{filename}</span>
                  <Badge variant="secondary">{previewRows.length} rows{isPersonal && parsed.length !== previewRows.length ? ` (${parsed.length - previewRows.length} credits skipped)` : ""}</Badge>
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setParsed(null); setFilename(""); }}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-md border p-3">
                  <p className="text-muted-foreground text-xs">Date range</p>
                  <p className="font-medium mt-1">
                    {previewRows.length > 0 && (
                      <>
                        {format(new Date(previewRows.map(r=>r.transaction_date).sort()[0]), "dd MMM yyyy")} –{" "}
                        {format(new Date(previewRows.map(r=>r.transaction_date).sort().at(-1)!), "dd MMM yyyy")}
                      </>
                    )}
                  </p>
                </div>
                {isPersonal ? (
                  <div className="rounded-md border p-3">
                    <p className="text-muted-foreground text-xs">Total outflows</p>
                    <p className="font-medium mt-1">
                      ₹{previewRows.reduce((s,r) => s + r.debit, 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-md border p-3">
                    <p className="text-muted-foreground text-xs">Auto-categorized</p>
                    <p className="font-medium mt-1">{autoCount} rows</p>
                    <p className="text-xs text-muted-foreground">(Amit Sengupta)</p>
                  </div>
                )}
                <div className="rounded-md border p-3">
                  <p className="text-muted-foreground text-xs">{isPersonal ? "Go to review" : "Need review"}</p>
                  <p className="font-medium mt-1">{isPersonal ? previewRows.length : previewRows.length - autoCount} rows</p>
                </div>
              </div>

              {/* Preview table */}
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-3 py-2 text-left">Date</th>
                      <th className="px-3 py-2 text-left">Narration</th>
                      <th className="px-3 py-2 text-right">Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {previewRows.slice(0, 8).map((row, i) => (
                      <tr key={i}>
                        <td className="px-3 py-1.5 whitespace-nowrap">{format(new Date(row.transaction_date), "dd MMM yyyy")}</td>
                        <td className="px-3 py-1.5 max-w-xs truncate">{row.narration}</td>
                        <td className="px-3 py-1.5 text-right text-red-600">
                          ₹{(isPersonal ? row.debit : Math.max(row.debit, row.credit)).toLocaleString("en-IN")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {previewRows.length > 8 && (
                  <p className="text-xs text-muted-foreground px-3 py-2">
                    …and {previewRows.length - 8} more rows
                  </p>
                )}
              </div>

              <Button onClick={handleImport} disabled={importing || previewRows.length === 0} className="w-full">
                {importing
                  ? "Importing…"
                  : `Import ${previewRows.length} transaction${previewRows.length !== 1 ? "s" : ""}`}
              </Button>
            </div>
          )}

          {result && (
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 p-3 rounded-md">
              <CheckCircle className="h-4 w-4 shrink-0" />
              <span>
                {result.imported} transactions imported.{" "}
                {result.skipped > 0 && `${result.skipped} duplicates skipped.`}
                {isPersonal && " Head to the Review tab to categorize each expense."}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Past statements */}
      {!statementsLoading && statements.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Past Imports</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {statements.map(s => (
                <div key={s.id} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
                  <div className="flex items-center gap-2">
                    {(s as { statement_type?: string }).statement_type === "director_personal"
                      ? <User className="h-4 w-4 text-muted-foreground shrink-0" />
                      : <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />}
                    <div>
                      <p className="font-medium">{s.filename || "Statement"}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.from_date && s.to_date
                          ? `${format(new Date(s.from_date), "dd MMM yyyy")} – ${format(new Date(s.to_date), "dd MMM yyyy")}`
                          : ""}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant="secondary">{s.row_count} rows</Badge>
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(new Date(s.uploaded_at), "dd MMM yyyy")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
