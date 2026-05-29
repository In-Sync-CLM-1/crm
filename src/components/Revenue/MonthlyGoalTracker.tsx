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
import type { MetricType } from "./ContactsListDialog";

interface MonthlyActuals {
  qualified: number;
  proposals: number;
  deals: number;
  invoiced: number;
  received: number;
}

interface MonthlyGoalTrackerProps {
  monthlyActuals: Record<string, MonthlyActuals>;
  currency?: string;
  onCellClick?: (month: string, metricType: MetricType) => void;
}

// Hardcoded monthly targets
const monthlyTargets: Record<string, { qualified: number; proposals: number; deals: number; revenue: number }> = {
  JAN: { qualified: 2, proposals: 1, deals: 0, revenue: 200000 },
  FEB: { qualified: 3, proposals: 2, deals: 1, revenue: 400000 },
  MAR: { qualified: 4, proposals: 2, deals: 2, revenue: 800000 },
  APR: { qualified: 4, proposals: 2, deals: 2, revenue: 700000 },
  MAY: { qualified: 5, proposals: 2, deals: 2, revenue: 900000 },
  JUN: { qualified: 5, proposals: 3, deals: 2, revenue: 1000000 },
  JUL: { qualified: 6, proposals: 3, deals: 2, revenue: 900000 },
  AUG: { qualified: 6, proposals: 3, deals: 2, revenue: 1100000 },
  SEP: { qualified: 6, proposals: 3, deals: 2, revenue: 900000 },
  OCT: { qualified: 7, proposals: 3, deals: 2, revenue: 1100000 },
  NOV: { qualified: 7, proposals: 3, deals: 2, revenue: 1100000 },
  DEC: { qualified: 7, proposals: 3, deals: 3, revenue: 1200000 },
};

const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

const formatCompact = (value: number): string => {
  if (value >= 10000000) return `${(value / 10000000).toFixed(1)}Cr`;
  if (value >= 100000) return `${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
  return value.toString();
};

export function MonthlyGoalTracker({ monthlyActuals, onCellClick }: MonthlyGoalTrackerProps) {
  const annualTotals = useMemo(() => {
    const targetQualified = months.reduce((sum, m) => sum + monthlyTargets[m].qualified, 0);
    const targetProposals = months.reduce((sum, m) => sum + monthlyTargets[m].proposals, 0);
    const targetDeals = months.reduce((sum, m) => sum + monthlyTargets[m].deals, 0);
    const targetRevenue = months.reduce((sum, m) => sum + monthlyTargets[m].revenue, 0);
    
    const actualQualified = months.reduce((sum, m) => sum + (monthlyActuals[m]?.qualified || 0), 0);
    const actualProposals = months.reduce((sum, m) => sum + (monthlyActuals[m]?.proposals || 0), 0);
    const actualDeals = months.reduce((sum, m) => sum + (monthlyActuals[m]?.deals || 0), 0);
    const actualInvoiced = months.reduce((sum, m) => sum + (monthlyActuals[m]?.invoiced || 0), 0);
    const actualReceived = months.reduce((sum, m) => sum + (monthlyActuals[m]?.received || 0), 0);
    
    return {
      target: { qualified: targetQualified, proposals: targetProposals, deals: targetDeals, revenue: targetRevenue },
      actual: { qualified: actualQualified, proposals: actualProposals, deals: actualDeals, invoiced: actualInvoiced, received: actualReceived },
    };
  }, [monthlyActuals]);

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
            <TableHead colSpan={2} className="text-center text-sm font-semibold border-l bg-blue-500/10 py-2">Qualified</TableHead>
            <TableHead colSpan={2} className="text-center text-sm font-semibold border-l bg-violet-500/10 py-2">Proposals</TableHead>
            <TableHead colSpan={2} className="text-center text-sm font-semibold border-l bg-amber-500/10 py-2">Deals</TableHead>
            <TableHead colSpan={3} className="text-center text-sm font-semibold border-l bg-emerald-500/10 py-2">Revenue</TableHead>
          </TableRow>
          <TableRow className="h-8">
            <TableHead className="text-center text-xs border-l bg-blue-500/5 py-1">Tgt</TableHead>
            <TableHead className="text-center text-xs bg-blue-500/5 py-1">Act</TableHead>
            <TableHead className="text-center text-xs border-l bg-violet-500/5 py-1">Tgt</TableHead>
            <TableHead className="text-center text-xs bg-violet-500/5 py-1">Act</TableHead>
            <TableHead className="text-center text-xs border-l bg-amber-500/5 py-1">Tgt</TableHead>
            <TableHead className="text-center text-xs bg-amber-500/5 py-1">Act</TableHead>
            <TableHead className="text-center text-xs border-l bg-emerald-500/5 py-1">Tgt</TableHead>
            <TableHead className="text-center text-xs bg-emerald-500/5 py-1">Inv</TableHead>
            <TableHead className="text-center text-xs bg-emerald-500/5 py-1">Rec</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {months.map((month) => {
            const target = monthlyTargets[month];
            const actual = monthlyActuals[month] || { qualified: 0, proposals: 0, deals: 0, invoiced: 0, received: 0 };
            
            return (
              <TableRow key={month} className="h-10">
                <TableCell className="text-center font-semibold text-sm py-2">{month}</TableCell>
                <TableCell className="text-center text-sm border-l py-2">{target.qualified}</TableCell>
                <TableCell 
                  className={cn("text-center text-sm font-medium py-2", getCellClass(actual.qualified, target.qualified), clickableClass)}
                  onClick={() => onCellClick?.(month, "qualified")}
                >
                  {actual.qualified}
                </TableCell>
                <TableCell className="text-center text-sm border-l py-2">{target.proposals}</TableCell>
                <TableCell 
                  className={cn("text-center text-sm font-medium py-2", getCellClass(actual.proposals, target.proposals), clickableClass)}
                  onClick={() => onCellClick?.(month, "proposals")}
                >
                  {actual.proposals}
                </TableCell>
                <TableCell className="text-center text-sm border-l py-2">{target.deals}</TableCell>
                <TableCell 
                  className={cn("text-center text-sm font-medium py-2", getCellClass(actual.deals, target.deals), clickableClass)}
                  onClick={() => onCellClick?.(month, "deals")}
                >
                  {actual.deals}
                </TableCell>
                <TableCell className="text-center text-sm border-l py-2">{formatCompact(target.revenue)}</TableCell>
                <TableCell 
                  className={cn("text-center text-sm font-medium py-2", getCellClass(actual.invoiced, target.revenue), clickableClass)}
                  onClick={() => onCellClick?.(month, "invoiced")}
                >
                  {formatCompact(actual.invoiced)}
                </TableCell>
                <TableCell 
                  className={cn("text-center text-sm font-medium py-2", getCellClass(actual.received, target.revenue), clickableClass)}
                  onClick={() => onCellClick?.(month, "received")}
                >
                  {formatCompact(actual.received)}
                </TableCell>
              </TableRow>
            );
          })}
          {/* Annual total row */}
          <TableRow className="bg-primary/10 font-semibold h-10 border-t-2">
            <TableCell className="text-center text-sm py-2">YR</TableCell>
            <TableCell className="text-center text-sm border-l py-2">{annualTotals.target.qualified}</TableCell>
            <TableCell className={cn("text-center text-sm font-bold py-2", getCellClass(annualTotals.actual.qualified, annualTotals.target.qualified))}>
              {annualTotals.actual.qualified}
            </TableCell>
            <TableCell className="text-center text-sm border-l py-2">{annualTotals.target.proposals}</TableCell>
            <TableCell className={cn("text-center text-sm font-bold py-2", getCellClass(annualTotals.actual.proposals, annualTotals.target.proposals))}>
              {annualTotals.actual.proposals}
            </TableCell>
            <TableCell className="text-center text-sm border-l py-2">{annualTotals.target.deals}</TableCell>
            <TableCell className={cn("text-center text-sm font-bold py-2", getCellClass(annualTotals.actual.deals, annualTotals.target.deals))}>
              {annualTotals.actual.deals}
            </TableCell>
            <TableCell className="text-center text-sm border-l py-2">{formatCompact(annualTotals.target.revenue)}</TableCell>
            <TableCell className={cn("text-center text-sm font-bold py-2", getCellClass(annualTotals.actual.invoiced, annualTotals.target.revenue))}>
              {formatCompact(annualTotals.actual.invoiced)}
            </TableCell>
            <TableCell className={cn("text-center text-sm font-bold py-2", getCellClass(annualTotals.actual.received, annualTotals.target.revenue))}>
              {formatCompact(annualTotals.actual.received)}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
