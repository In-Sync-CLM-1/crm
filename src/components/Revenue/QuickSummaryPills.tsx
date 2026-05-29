import { Badge } from "@/components/ui/badge";
import { MiniSparkline } from "./MiniSparkline";
import { TrendingUp, Target, FileCheck, IndianRupee } from "lucide-react";

interface QuickSummaryPillsProps {
  ytdDeals: number;
  ytdDealsTarget: number;
  ytdProposals: number;
  ytdProposalsTarget: number;
  ytdRevenue: number;
  ytdRevenueTarget: number;
  monthlyRevenueTrend?: number[];
}

const formatCompact = (value: number): string => {
  if (value >= 10000000) return `${(value / 10000000).toFixed(1)}Cr`;
  if (value >= 100000) return `${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
  return value.toString();
};

export function QuickSummaryPills({
  ytdDeals,
  ytdDealsTarget,
  ytdProposals,
  ytdProposalsTarget,
  ytdRevenue,
  ytdRevenueTarget,
  monthlyRevenueTrend = [],
}: QuickSummaryPillsProps) {
  const dealsPercent = ytdDealsTarget > 0 ? Math.round((ytdDeals / ytdDealsTarget) * 100) : 0;
  const proposalsPercent = ytdProposalsTarget > 0 ? Math.round((ytdProposals / ytdProposalsTarget) * 100) : 0;
  const revenuePercent = ytdRevenueTarget > 0 ? Math.round((ytdRevenue / ytdRevenueTarget) * 100) : 0;

  return (
    <div className="flex flex-wrap gap-3 justify-center py-3">
      {/* Revenue Pill */}
      <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20">
        <IndianRupee className="h-4 w-4 text-emerald-600" />
        <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
          Revenue: {formatCompact(ytdRevenue)} / {formatCompact(ytdRevenueTarget)}
        </span>
        <Badge 
          variant={revenuePercent >= 100 ? "default" : "secondary"} 
          className={revenuePercent >= 100 ? "bg-emerald-600" : ""}
        >
          {revenuePercent}%
        </Badge>
        {monthlyRevenueTrend.length > 1 && (
          <MiniSparkline data={monthlyRevenueTrend} width={60} height={20} />
        )}
      </div>

      {/* Deals Pill */}
      <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/20">
        <Target className="h-4 w-4 text-amber-600" />
        <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
          Deals: {ytdDeals} / {ytdDealsTarget}
        </span>
        <Badge 
          variant={dealsPercent >= 100 ? "default" : "secondary"}
          className={dealsPercent >= 100 ? "bg-amber-600" : ""}
        >
          {dealsPercent}%
        </Badge>
      </div>

      {/* Proposals Pill */}
      <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-violet-500/10 border border-violet-500/20">
        <FileCheck className="h-4 w-4 text-violet-600" />
        <span className="text-sm font-medium text-violet-700 dark:text-violet-400">
          Proposals: {ytdProposals} / {ytdProposalsTarget}
        </span>
        <Badge 
          variant={proposalsPercent >= 100 ? "default" : "secondary"}
          className={proposalsPercent >= 100 ? "bg-violet-600" : ""}
        >
          {proposalsPercent}%
        </Badge>
      </div>
    </div>
  );
}
