import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import { ArrowUpDown } from "lucide-react";

interface ChannelPerformanceTableProps {
  data: Array<{
    campaign_type: string;
    spend: number;
    conversions: number;
    revenue: number;
    roas: number;
    cpa: number;
  }>;
  isLoading?: boolean;
}

type SortKey = "spend" | "conversions" | "revenue" | "roas" | "cpa";

export default function ChannelPerformanceTable({ data, isLoading }: ChannelPerformanceTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("spend");
  const [sortDesc, setSortDesc] = useState(true);

  if (isLoading) {
    return <Skeleton className="h-[200px] w-full" />;
  }

  if (!data || data.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        No channel data available
      </div>
    );
  }

  // Aggregate by channel
  const channelData = Object.values(
    data.reduce((acc, curr) => {
      const channel = curr.campaign_type;
      if (!acc[channel]) {
        acc[channel] = {
          channel,
          spend: 0,
          conversions: 0,
          revenue: 0,
        };
      }
      acc[channel].spend += curr.spend || 0;
      acc[channel].conversions += curr.conversions || 0;
      acc[channel].revenue += curr.revenue || 0;
      return acc;
    }, {} as Record<string, any>)
  ).map((item) => ({
    ...item,
    roas: item.spend > 0 ? item.revenue / item.spend : 0,
    cpa: item.conversions > 0 ? item.spend / item.conversions : 0,
  }));

  // Sort data
  const sortedData = [...channelData].sort((a, b) => {
    const aVal = a[sortKey];
    const bVal = b[sortKey];
    return sortDesc ? bVal - aVal : aVal - bVal;
  });

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDesc(!sortDesc);
    } else {
      setSortKey(key);
      setSortDesc(true);
    }
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Channel</TableHead>
          <TableHead className="cursor-pointer" onClick={() => handleSort("spend")}>
            <div className="flex items-center gap-1">
              Spend <ArrowUpDown className="h-3 w-3" />
            </div>
          </TableHead>
          <TableHead className="cursor-pointer" onClick={() => handleSort("conversions")}>
            <div className="flex items-center gap-1">
              Conversions <ArrowUpDown className="h-3 w-3" />
            </div>
          </TableHead>
          <TableHead className="cursor-pointer" onClick={() => handleSort("roas")}>
            <div className="flex items-center gap-1">
              ROAS <ArrowUpDown className="h-3 w-3" />
            </div>
          </TableHead>
          <TableHead className="cursor-pointer" onClick={() => handleSort("cpa")}>
            <div className="flex items-center gap-1">
              CPA <ArrowUpDown className="h-3 w-3" />
            </div>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortedData.map((row) => (
          <TableRow key={row.channel}>
            <TableCell className="font-medium capitalize">{row.channel}</TableCell>
            <TableCell>${row.spend.toFixed(2)}</TableCell>
            <TableCell>{row.conversions}</TableCell>
            <TableCell>{row.roas.toFixed(2)}</TableCell>
            <TableCell>${row.cpa.toFixed(2)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}