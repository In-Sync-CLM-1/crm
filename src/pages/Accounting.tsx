import { useState } from "react";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Upload, ClipboardList, BookOpen, Scale, TrendingUp, BarChart3 } from "lucide-react";
import { AccountingImport } from "@/components/Accounting/AccountingImport";
import { AccountingReviewQueue } from "@/components/Accounting/AccountingReviewQueue";
import { AccountingLedger } from "@/components/Accounting/AccountingLedger";
import { AccountingTrialBalance } from "@/components/Accounting/AccountingTrialBalance";
import { AccountingPnL } from "@/components/Accounting/AccountingPnL";
import { AccountingBalanceSheet } from "@/components/Accounting/AccountingBalanceSheet";
import { useAccountingData } from "@/hooks/useAccountingData";
import { Badge } from "@/components/ui/badge";
import { format, startOfYear, endOfYear } from "date-fns";

function DateRangeBar({
  fromDate, toDate, asOf,
  onFromDate, onToDate, onAsOf,
  show,
}: {
  fromDate: string; toDate: string; asOf: string;
  onFromDate: (d: string) => void; onToDate: (d: string) => void; onAsOf: (d: string) => void;
  show: "range" | "asof";
}) {
  return (
    <div className="flex flex-wrap gap-3 items-end mb-4">
      {show === "range" ? (
        <>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">From</label>
            <input type="date" value={fromDate} onChange={e => onFromDate(e.target.value)}
              className="h-9 px-3 border border-input rounded-md text-sm bg-background" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">To</label>
            <input type="date" value={toDate} onChange={e => onToDate(e.target.value)}
              className="h-9 px-3 border border-input rounded-md text-sm bg-background" />
          </div>
        </>
      ) : (
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">As at</label>
          <input type="date" value={asOf} onChange={e => onAsOf(e.target.value)}
            className="h-9 px-3 border border-input rounded-md text-sm bg-background" />
        </div>
      )}
    </div>
  );
}

export default function Accounting() {
  const { pendingTransactions } = useAccountingData();
  const [tab, setTab] = useState("import");

  const [fromDate, setFromDate] = useState(format(startOfYear(new Date()), "yyyy-MM-dd"));
  const [toDate,   setToDate]   = useState(format(endOfYear(new Date()),   "yyyy-MM-dd"));
  const [asOf,     setAsOf]     = useState(format(new Date(), "yyyy-MM-dd"));

  const pendingCount = pendingTransactions.length;

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Accounting</h1>
          <p className="text-sm text-muted-foreground mt-1">Prosync AI Solutions — Double-entry bookkeeping</p>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="import" className="flex items-center gap-1.5 text-xs">
              <Upload className="h-3.5 w-3.5" />Import
            </TabsTrigger>
            <TabsTrigger value="review" className="flex items-center gap-1.5 text-xs">
              <ClipboardList className="h-3.5 w-3.5" />
              Review
              {pendingCount > 0 && (
                <Badge className="ml-1 h-4 min-w-4 px-1 text-[10px] bg-amber-500 hover:bg-amber-500">
                  {pendingCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="ledger" className="flex items-center gap-1.5 text-xs">
              <BookOpen className="h-3.5 w-3.5" />Ledger
            </TabsTrigger>
            <TabsTrigger value="trial" className="flex items-center gap-1.5 text-xs">
              <Scale className="h-3.5 w-3.5" />Trial Balance
            </TabsTrigger>
            <TabsTrigger value="pnl" className="flex items-center gap-1.5 text-xs">
              <TrendingUp className="h-3.5 w-3.5" />P&amp;L
            </TabsTrigger>
            <TabsTrigger value="bs" className="flex items-center gap-1.5 text-xs">
              <BarChart3 className="h-3.5 w-3.5" />Balance Sheet
            </TabsTrigger>
          </TabsList>

          <div className="mt-4">
            <TabsContent value="import">
              <AccountingImport />
            </TabsContent>

            <TabsContent value="review">
              <AccountingReviewQueue />
            </TabsContent>

            <TabsContent value="ledger">
              <AccountingLedger />
            </TabsContent>

            <TabsContent value="trial">
              <DateRangeBar
                fromDate={fromDate} toDate={toDate} asOf={asOf}
                onFromDate={setFromDate} onToDate={setToDate} onAsOf={setAsOf}
                show="asof"
              />
              <AccountingTrialBalance asOf={asOf} />
            </TabsContent>

            <TabsContent value="pnl">
              <DateRangeBar
                fromDate={fromDate} toDate={toDate} asOf={asOf}
                onFromDate={setFromDate} onToDate={setToDate} onAsOf={setAsOf}
                show="range"
              />
              <AccountingPnL fromDate={fromDate} toDate={toDate} />
            </TabsContent>

            <TabsContent value="bs">
              <DateRangeBar
                fromDate={fromDate} toDate={toDate} asOf={asOf}
                onFromDate={setFromDate} onToDate={setToDate} onAsOf={setAsOf}
                show="asof"
              />
              <AccountingBalanceSheet asOf={asOf} />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
