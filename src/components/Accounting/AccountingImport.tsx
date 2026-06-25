import { useState, useRef } from "react";
import { Upload, FileText, CheckCircle, AlertCircle, X } from "lucide-react";
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
  // DD/MM/YYYY
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) return `${slash[3]}-${slash[2].padStart(2,"0")}-${slash[1].padStart(2,"0")}`;
  // DD-MM-YYYY
  const dash = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dash) return `${dash[3]}-${dash[2].padStart(2,"0")}-${dash[1].padStart(2,"0")}`;
  // DD MMM YYYY (01 Apr 2026)
  const months: Record<string,string> = {
    jan:"01",feb:"02",mar:"03",apr:"04",may:"05",jun:"06",
    jul:"07",aug:"08",sep:"09",oct:"10",nov:"11",dec:"12",
  };
  const mmm = raw.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (mmm) {
    const m = months[mmm[2].toLowerCase()];
    return m ? `${mmm[3]}-${m}-${mmm[1].padStart(2,"0")}` : "";
  }
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return "";
}

function parseIdfcCsv(text: string): ParsedBankRow[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  // Find the header row — must contain 'date' and ('debit' or 'credit')
  let headerIdx = -1;
  let headers: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const cols = lines[i].split(",").map(c => c.replace(/^"|"$/g, "").toLowerCase().trim());
    if (cols.some(c => c.includes("date")) && cols.some(c => c.includes("debit") || c.includes("credit"))) {
      headerIdx = i;
      headers = cols;
      break;
    }
  }
  if (headerIdx === -1) throw new Error("Could not find transaction header row. Please upload a valid IDFC FIRST Bank statement CSV.");

  const idx = (keywords: string[]) => {
    const i = headers.findIndex(h => keywords.some(k => h.includes(k)));
    return i === -1 ? null : i;
  };

  const dateCol   = idx(["txn date","transaction date","date"]);
  const vdateCol  = idx(["value date"]);
  const descCol   = idx(["description","narration","remarks","particulars"]);
  const refCol    = idx(["ref no","cheque","reference"]);
  const debitCol  = idx(["debit"]);
  const creditCol = idx(["credit"]);
  const balCol    = idx(["balance"]);

  if (dateCol === null || debitCol === null || creditCol === null) {
    throw new Error("CSV is missing required columns (Date / Debit / Credit).");
  }

  const rows: ParsedBankRow[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    // Split respecting quoted fields
    const cols = lines[i].match(/(".*?"|[^,]+|(?<=,)(?=,)|(?<=,)$|^(?=,))/g)?.map(
      c => c.replace(/^"|"$/g, "").trim()
    ) ?? lines[i].split(",").map(c => c.trim());

    const dateStr = cols[dateCol] || "";
    if (!dateStr || dateStr.toLowerCase().includes("total") || dateStr.toLowerCase().includes("opening")) continue;

    const txnDate = parseDate(dateStr);
    if (!txnDate) continue;

    const debit  = parseAmount(cols[debitCol]  ?? "");
    const credit = parseAmount(cols[creditCol] ?? "");
    if (debit === 0 && credit === 0) continue;

    rows.push({
      transaction_date: txnDate,
      value_date: vdateCol !== null ? parseDate(cols[vdateCol] || "") : txnDate,
      narration: descCol !== null ? (cols[descCol] || "").replace(/\s+/g, " ") : "",
      reference: refCol !== null ? (cols[refCol] || "") : "",
      debit,
      credit,
      balance: balCol !== null ? parseAmount(cols[balCol] || "") : null,
    });
  }
  return rows;
}

export function AccountingImport() {
  const { importStatement, statements, statementsLoading } = useAccountingData();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

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
        const rows = parseIdfcCsv(text);
        if (rows.length === 0) throw new Error("No transactions found in the file.");
        setParsed(rows);
      } catch (err: unknown) {
        setParseError(err instanceof Error ? err.message : "Could not parse the file.");
      }
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    if (!parsed || parsed.length === 0) return;
    setImporting(true);
    try {
      const dates = parsed.map(r => r.transaction_date).sort();
      const res = await importStatement.mutateAsync({
        rows: parsed,
        filename,
        fromDate: dates[0],
        toDate: dates[dates.length - 1],
      });
      setResult({ imported: res.imported, skipped: res.skipped });
      setParsed(null);
      toast({ title: "Import complete", description: `${res.imported} transactions imported, ${res.skipped} duplicates skipped.` });
    } catch (err: unknown) {
      toast({ title: "Import failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setImporting(false);
    }
  }

  const autoCount  = parsed?.filter(r => {
    const u = r.narration.toUpperCase();
    return u.includes("AMIT SENGUPTA") || false;
  }).length ?? 0;

  return (
    <div className="space-y-6">
      {/* Upload card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upload Bank Statement</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
              Drag & drop your IDFC FIRST Bank CSV here, or click to browse
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Download the statement from Internet Banking → Accounts → Statement → Export as CSV
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
                  <Badge variant="secondary">{parsed.length} rows</Badge>
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setParsed(null); setFilename(""); }}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-md border p-3">
                  <p className="text-muted-foreground text-xs">Date range</p>
                  <p className="font-medium mt-1">
                    {format(new Date(parsed.map(r=>r.transaction_date).sort()[0]), "dd MMM yyyy")} –{" "}
                    {format(new Date(parsed.map(r=>r.transaction_date).sort().at(-1)!), "dd MMM yyyy")}
                  </p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-muted-foreground text-xs">Auto-categorized</p>
                  <p className="font-medium mt-1">{autoCount} rows</p>
                  <p className="text-xs text-muted-foreground">(Amit Sengupta)</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-muted-foreground text-xs">Need review</p>
                  <p className="font-medium mt-1">{parsed.length - autoCount} rows</p>
                </div>
              </div>

              {/* Preview table */}
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-3 py-2 text-left">Date</th>
                      <th className="px-3 py-2 text-left">Narration</th>
                      <th className="px-3 py-2 text-right">Debit</th>
                      <th className="px-3 py-2 text-right">Credit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {parsed.slice(0, 8).map((row, i) => {
                      const u = row.narration.toUpperCase();
                      const isAmit = u.includes("AMIT SENGUPTA");
                      return (
                        <tr key={i} className={isAmit ? "bg-blue-50" : ""}>
                          <td className="px-3 py-1.5 whitespace-nowrap">{format(new Date(row.transaction_date), "dd MMM yyyy")}</td>
                          <td className="px-3 py-1.5 max-w-xs truncate">{row.narration}</td>
                          <td className="px-3 py-1.5 text-right text-red-600">{row.debit > 0 ? `₹${row.debit.toLocaleString("en-IN")}` : ""}</td>
                          <td className="px-3 py-1.5 text-right text-green-600">{row.credit > 0 ? `₹${row.credit.toLocaleString("en-IN")}` : ""}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {parsed.length > 8 && (
                  <p className="text-xs text-muted-foreground px-3 py-2">
                    …and {parsed.length - 8} more rows
                  </p>
                )}
              </div>

              <Button onClick={handleImport} disabled={importing} className="w-full">
                {importing ? "Importing…" : `Import ${parsed.length} transactions`}
              </Button>
            </div>
          )}

          {result && (
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 p-3 rounded-md">
              <CheckCircle className="h-4 w-4 shrink-0" />
              <span>
                {result.imported} transactions imported.{" "}
                {result.skipped > 0 && `${result.skipped} duplicates skipped.`}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Past statements */}
      {statements.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Past Imports</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {statements.map(s => (
                <div key={s.id} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
                  <div>
                    <p className="font-medium">{s.filename || "Statement"}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.from_date && s.to_date
                        ? `${format(new Date(s.from_date), "dd MMM yyyy")} – ${format(new Date(s.to_date), "dd MMM yyyy")}`
                        : ""}
                    </p>
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
