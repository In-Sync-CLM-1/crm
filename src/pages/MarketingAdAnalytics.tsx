import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/common/LoadingState";
import {
  RefreshCw, MousePointerClick, Eye, FileText, BadgeCheck, Trophy, IndianRupee,
} from "lucide-react";

const inr = (n: number | null | undefined) =>
  n == null ? "—" : `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const num = (n: number | null | undefined) =>
  n == null ? "—" : Number(n).toLocaleString("en-IN");

interface Funnel {
  range_days: number;
  funnel: {
    spend: number; impressions: number; clicks: number; ctr: number;
    demo_requests: number; qualified: number; won: number;
  };
  efficiency: {
    cost_per_click: number | null; cost_per_demo_request: number | null;
    cost_per_qualified: number | null; revenue: number | null; roas: number | null;
  };
  keywords: { keyword: string; clicks: number; impressions: number; cost: number }[];
}

export default function MarketingAdAnalytics() {
  const [days, setDays] = useState("30");

  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["mkt-ad-funnel", days],
    queryFn: async (): Promise<Funnel> => {
      const { data, error } = await supabase.functions.invoke("mkt-ad-funnel", {
        body: { days: Number(days) },
      });
      if (error) throw error;
      return data as Funnel;
    },
    staleTime: 5 * 60 * 1000,
  });

  const f = data?.funnel;
  const e = data?.efficiency;

  // The journey, left to right. "Won / revenue" is shown now as a count; the
  // rupee value lights up in Phase 2 once payments link back to the ad click.
  const stages = [
    { label: "Impressions", value: num(f?.impressions), icon: Eye, hint: "Ad seen" },
    { label: "Clicks", value: num(f?.clicks), icon: MousePointerClick, hint: `${f?.ctr ?? 0}% CTR` },
    { label: "Demo Requests", value: num(f?.demo_requests), icon: FileText, hint: "Form filled" },
    { label: "Qualified", value: num(f?.qualified), icon: BadgeCheck, hint: "After Riya's call" },
    { label: "Won", value: num(f?.won), icon: Trophy, hint: "Revenue: Phase 2" },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold">Ad Analytics</h1>
            <p className="text-muted-foreground mt-1">
              Google Ads → demo → qualified, and what each step costs.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {isLoading ? (
          <LoadingState message="Loading ad analytics..." />
        ) : error ? (
          <Card><CardContent className="py-10 text-center text-muted-foreground">
            Couldn't load analytics. {String((error as Error).message || "")}
          </CardContent></Card>
        ) : (
          <>
            {/* Spend headline */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2"><IndianRupee className="h-4 w-4" />Ad Spend</CardTitle></CardHeader>
                <CardContent><div className="text-3xl font-bold">{inr(f?.spend)}</div><p className="text-xs text-muted-foreground mt-1">Last {data?.range_days} days</p></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Cost / Demo Request</CardTitle></CardHeader>
                <CardContent><div className="text-3xl font-bold">{inr(e?.cost_per_demo_request)}</div><p className="text-xs text-muted-foreground mt-1">Spend ÷ demo requests</p></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Cost / Qualified Lead</CardTitle></CardHeader>
                <CardContent><div className="text-3xl font-bold">{inr(e?.cost_per_qualified)}</div><p className="text-xs text-muted-foreground mt-1">The real efficiency number</p></CardContent>
              </Card>
            </div>

            {/* Funnel */}
            <Card>
              <CardHeader><CardTitle>The Funnel</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  {stages.map((s) => (
                    <div key={s.label} className="rounded-xl border p-4 text-center">
                      <s.icon className="h-5 w-5 mx-auto text-primary mb-2" />
                      <div className="text-2xl font-bold">{s.value}</div>
                      <div className="text-sm font-medium mt-1">{s.label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{s.hint}</div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-4">
                  Revenue &amp; return-on-ad-spend turn on in Phase 2, once payments are linked back to the originating ad click.
                </p>
              </CardContent>
            </Card>

            {/* Keywords */}
            <Card>
              <CardHeader><CardTitle>Keywords by traffic</CardTitle></CardHeader>
              <CardContent>
                {data?.keywords?.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Keyword</TableHead>
                        <TableHead className="text-right">Impressions</TableHead>
                        <TableHead className="text-right">Clicks</TableHead>
                        <TableHead className="text-right">Spend</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.keywords.map((k) => (
                        <TableRow key={k.keyword}>
                          <TableCell className="font-medium">{k.keyword}</TableCell>
                          <TableCell className="text-right">{num(k.impressions)}</TableCell>
                          <TableCell className="text-right">{num(k.clicks)}</TableCell>
                          <TableCell className="text-right">{inr(k.cost)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground py-6 text-center">No keyword data in this window yet.</p>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
