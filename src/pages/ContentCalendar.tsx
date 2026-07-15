import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, ImageIcon, LayoutGrid, Type, Video } from "lucide-react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isToday,
  addMonths,
  subMonths,
} from "date-fns";
import { useOrgContext } from "@/hooks/useOrgContext";
import { LoadingState } from "@/components/common/LoadingState";
import { PostDetailDialog, CalendarPost } from "@/components/Marketing/PostDetailDialog";

const statusDot: Record<string, string> = {
  pending: "bg-blue-500",
  posted: "bg-green-500",
  failed: "bg-red-500",
  skipped: "bg-gray-400",
  partial: "bg-amber-500",
};

const formatIcon: Record<string, React.ComponentType<{ className?: string }>> = {
  text: Type,
  image: ImageIcon,
  video: Video,
  carousel: LayoutGrid,
};

export default function ContentCalendar() {
  const { effectiveOrgId } = useOrgContext();
  const [month, setMonth] = useState(new Date());
  const [selectedPost, setSelectedPost] = useState<CalendarPost | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const rangeStart = startOfWeek(startOfMonth(month));
  const rangeEnd = endOfWeek(endOfMonth(month));
  const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });

  const { data: posts, isLoading } = useQuery({
    queryKey: ["content-calendar-posts", effectiveOrgId, format(rangeStart, "yyyy-MM-dd"), format(rangeEnd, "yyyy-MM-dd")],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      const { data, error } = await supabase
        .from("blog_posts")
        .select("*")
        .eq("org_id", effectiveOrgId)
        .gte("publish_date", format(rangeStart, "yyyy-MM-dd"))
        .lte("publish_date", format(rangeEnd, "yyyy-MM-dd"))
        .order("publish_date", { ascending: true });
      if (error) throw error;
      return data as CalendarPost[];
    },
    enabled: !!effectiveOrgId,
  });

  const postsByDay = useMemo(() => {
    const map = new Map<string, CalendarPost[]>();
    for (const p of posts || []) {
      const key = p.publish_date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return map;
  }, [posts]);

  const openPost = (p: CalendarPost) => {
    setSelectedPost(p);
    setDetailOpen(true);
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Content Calendar</h1>
            <p className="text-sm text-muted-foreground">
              Everything the marketing engine has written, posted, or has queued — LinkedIn, Facebook, Instagram, YouTube.
              Posts go out automatically at their scheduled time unless you edit or skip them here.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setMonth(subMonths(month, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium w-32 text-center">{format(month, "MMMM yyyy")}</span>
            <Button variant="outline" size="icon" onClick={() => setMonth(addMonths(month, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setMonth(new Date())}>Today</Button>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {Object.entries(statusDot).map(([status, color]) => (
            <span key={status} className="flex items-center gap-1">
              <span className={`h-2 w-2 rounded-full ${color}`} /> {status}
            </span>
          ))}
        </div>

        {isLoading ? (
          <LoadingState message="Loading content calendar..." />
        ) : (
          <Card className="p-2">
            <div className="grid grid-cols-7 text-center text-xs font-semibold text-muted-foreground border-b pb-1 mb-1">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {days.map((day) => {
                const key = format(day, "yyyy-MM-dd");
                const dayPosts = postsByDay.get(key) || [];
                const inMonth = isSameMonth(day, month);
                return (
                  <div
                    key={key}
                    className={`min-h-[90px] rounded border p-1 text-xs ${inMonth ? "bg-background" : "bg-muted/30 text-muted-foreground"} ${isToday(day) ? "border-primary" : "border-border"}`}
                  >
                    <div className={`font-medium mb-1 ${isToday(day) ? "text-primary" : ""}`}>{format(day, "d")}</div>
                    <div className="space-y-0.5">
                      {dayPosts.map((p) => {
                        const Icon = formatIcon[p.post_format] || Type;
                        return (
                          <button
                            key={p.id}
                            onClick={() => openPost(p)}
                            className="w-full flex items-center gap-1 text-left px-1 py-0.5 rounded hover:bg-accent truncate"
                            title={p.blog_title || ""}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${statusDot[p.status] || "bg-gray-300"}`} />
                            <Icon className="h-3 w-3 shrink-0" />
                            <span className="truncate">{p.blog_title || p.post_format}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>

      <PostDetailDialog post={selectedPost} open={detailOpen} onOpenChange={setDetailOpen} />
    </DashboardLayout>
  );
}
