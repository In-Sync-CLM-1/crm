import { useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { MetricType } from "./InvoiceListDialog";
import { formatCompactNumber } from "@/utils/currency";

interface MonthlyActuals {
  invoiced: number;
  received: number;
}

interface MonthlyGoalTrackerProps {
  monthlyActuals: Record<string, MonthlyActuals>;
  onCellClick?: (month: string, metricType: MetricType) => void;
}

// Hardcoded monthly revenue targets
const monthlyTargets: Record<string, number> = {
  JAN: 200000,
  FEB: 400000,
  MAR: 800000,
  APR: 700000,
  MAY: 900000,
  JUN: 1000000,
  JUL: 900000,
  AUG: 1100000,
  SEP: 900000,
  OCT: 1100000,
  NOV: 1100000,
  DEC: 1200000,
};

const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export function MonthlyGoalTracker({ monthlyActuals, onCellClick }: MonthlyGoalTrackerProps) {
  const annualTotals = useMemo(() => ({
    target: months.reduce((sum, m) => sum + monthlyTargets[m], 0),
    invoiced: months.reduce((sum, m) => sum + (monthlyActuals[m]?.invoiced || 0), 0),
    received: months.reduce((sum, m) => sum + (monthlyActuals[m]?.received || 0), 0),
  }), [monthlyActuals]);

  const getCellClass = (actual: number, target: number): string => {
    if (target === 0) return "";
    return actual >= target
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      : "bg-rose-500/10 text-rose-700 dark:text-rose-400";
  };

  const clickableClass = onCellClick
    ? "cursor-pointer hover:underline hover:bg-muted/50 transition-colors"
    : "";

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="border-b-2 h-10">
            <TableHead rowSpan={2} className="w-[60px] text-center text-sm font-semibold bg-muted/50 py-2">Mo</TableHead>
            <TableHead colSpan={3} className="text-center text-sm font-semibold border-l bg-emerald-500/10 py-2">Revenue</TableHead>
          </TableRow>
          <TableRow className="h-8">
            <TableHead className="text-center text-xs border-l bg-emerald-500/5 py-1">Tgt</TableHead>
            <TableHead className="text-center text-xs bg-emerald-500/5 py-1">Inv</TableHead>
            <TableHead className="text-center text-xs bg-emerald-500/5 py-1">Rec</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {months.map((month) => {
            const target = monthlyTargets[month];
            const actual = monthlyActuals[month] || { invoiced: 0, received: 0 };

            return (
              <TableRow key={month} className="h-10">
                <TableCell className="text-center font-semibold text-sm py-2">{month}</TableCell>
                <TableCell className="text-center text-sm border-l py-2">{formatCompactNumber(target)}</TableCell>
                <TableCell
                  className={cn("text-center text-sm font-medium py-2", getCellClass(actual.invoiced, target), clickableClass)}
                  onClick={() => onCellClick?.(month, "invoiced")}
                >
                  {formatCompactNumber(actual.invoiced)}
                </TableCell>
                <TableCell
                  className={cn("text-center text-sm font-medium py-2", getCellClass(actual.received, target), clickableClass)}
                  onClick={() => onCellClick?.(month, "received")}
                >
                  {formatCompactNumber(actual.received)}
                </TableCell>
              </TableRow>
            );
          })}
          {/* Annual total row */}
          <TableRow className="bg-primary/10 font-semibold h-10 border-t-2">
            <TableCell className="text-center text-sm py-2">YR</TableCell>
            <TableCell className="text-center text-sm border-l py-2">{formatCompactNumber(annualTotals.target)}</TableCell>
            <TableCell className={cn("text-center text-sm font-bold py-2", getCellClass(annualTotals.invoiced, annualTotals.target))}>
              {formatCompactNumber(annualTotals.invoiced)}
            </TableCell>
            <TableCell className={cn("text-center text-sm font-bold py-2", getCellClass(annualTotals.received, annualTotals.target))}>
              {formatCompactNumber(annualTotals.received)}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
