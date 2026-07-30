import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, ImageIcon, LayoutGrid, Type, Video, Vote } from "lucide-react";
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
import { ScheduledPreviewDialog } from "@/components/Marketing/ScheduledPreviewDialog";
import { getScheduledPlans, ScheduledPlan, themeLabel } from "@/lib/contentSchedule";
import { Clock } from "lucide-react";

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
  poll: Vote,
};

// Visual style rotation — a colored dot per style so the pattern (which
// style sits on which post) is visible across the whole month at a glance.
const styleColor: Record<string, string> = {
  photo: "bg-sky-500",
  illustration: "bg-violet-500",
  "3d": "bg-amber-500",
  abstract: "bg-rose-500",
};

export default function ContentCalendar() {
  const { effectiveOrgId } = useOrgContext();
  const [month, setMonth] = useState(new Date());
  const [selectedPost, setSelectedPost] = useState<CalendarPost | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [scheduledPreview, setScheduledPreview] = useState<{ date: Date; plan: ScheduledPlan } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

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

  // Future schedule preview — the rotation is deterministic, so we can show what
  // WILL be written on a future day even before blog_posts has a row for it
  // (the writer only ever creates tomorrow's row, the night before).
  const { data: schedule } = useQuery({
    queryKey: ["content-calendar-schedule", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return null;
      const [{ data: config }, { data: products }] = await Promise.all([
        supabase.from("mkt_linkedin_config").select("start_date, experiment_slots").eq("org_id", effectiveOrgId).eq("active", true).maybeSingle(),
        supabase.from("mkt_products").select("product_key, product_name").eq("org_id", effectiveOrgId).eq("active", true).order("product_key"),
      ]);
      if (!config?.start_date || !products?.length) return null;
      return {
        startDate: config.start_date as string,
        products,
        slots: (config.experiment_slots as string[]) || [],
      };
    },
    enabled: !!effectiveOrgId,
  });

  const slotTime = (idx: number | null) => {
    const slots = schedule?.slots || [];
    if (idx == null || !slots.length) return null;
    return slots[idx % slots.length];
  };

  const postsByDay = useMemo(() => {
    const map = new Map<string, CalendarPost[]>();
    for (const p of posts || []) {
      const key = p.publish_date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    // Order each day's posts by their posting time so the cell reads like a timeline.
    const slots = schedule?.slots || [];
    if (slots.length) {
      for (const list of map.values()) {
        list.sort((a, b) => {
          const ta = a.linkedin_slot_index != null ? slots[a.linkedin_slot_index % slots.length] : "99:99";
          const tb = b.linkedin_slot_index != null ? slots[b.linkedin_slot_index % slots.length] : "99:99";
          return ta.localeCompare(tb);
        });
      }
    }
    return map;
  }, [posts, schedule]);

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
              Content is prewritten a week ahead: 1 company post a day, plus a first-person post from Amit's own profile on weekdays —
              each at its own time, so you can review and intervene before anything goes live.
              Posts go out automatically at their scheduled time unless you edit or skip them here.
              Dashed entries are planned slots the AI hasn't written yet.
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
          <span className="w-px h-3 bg-border mx-1" />
          <span className="text-muted-foreground/70">image style:</span>
          {Object.entries(styleColor).map(([style, color]) => (
            <span key={style} className="flex items-center gap-1">
              <span className={`h-2 w-2 rounded-full ${color}`} /> {style}
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
                const isFuture = day > new Date() && !isToday(day);
                // Future slots not yet written by the AI show as dashed planned entries.
                // Each day can have up to 2 real slots (company + Amit's weekday post),
                // so gate per day_seq rather than a single day-wide count.
                const plans = isFuture && schedule
                  ? getScheduledPlans(schedule.startDate, key, schedule.products, schedule.slots)
                      .filter((pl) => !dayPosts.some((p) => p.day_seq === pl.day_seq))
                  : [];
                return (
                  <div
                    key={key}
                    className={`min-h-[90px] rounded border p-1 text-xs ${inMonth ? "bg-background" : "bg-muted/30 text-muted-foreground"} ${isToday(day) ? "border-primary" : "border-border"}`}
                  >
                    <div className={`font-medium mb-1 ${isToday(day) ? "text-primary" : ""}`}>{format(day, "d")}</div>
                    <div className="space-y-0.5">
                      {dayPosts.map((p) => {
                        const Icon = formatIcon[p.post_format] || Type;
                        const time = slotTime(p.linkedin_slot_index);
                        return (
                          <button
                            key={p.id}
                            onClick={() => openPost(p)}
                            className="w-full flex items-center gap-1 text-left px-1 py-0.5 rounded hover:bg-accent truncate"
                            title={`${time ? time + " IST — " : ""}${p.blog_title || ""}${p.image_style ? ` · style: ${p.image_style}` : ""}`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${statusDot[p.status] || "bg-gray-300"}`} />
                            {p.image_style && (
                              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${styleColor[p.image_style] || "bg-gray-300"}`} />
                            )}
                            <Icon className="h-3 w-3 shrink-0" />
                            {time && <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground">{time}</span>}
                            <span className="truncate">{p.blog_title || p.post_format}</span>
                          </button>
                        );
                      })}
                      {plans.map((plan) => (
                        <button
                          key={`plan-${plan.day_seq}`}
                          onClick={() => { setScheduledPreview({ date: day, plan }); setPreviewOpen(true); }}
                          className="w-full flex items-center gap-1 text-left px-1 py-0.5 rounded hover:bg-accent truncate text-muted-foreground border border-dashed"
                          title="Scheduled — not written yet"
                        >
                          <Clock className="h-3 w-3 shrink-0" />
                          <span className="shrink-0 tabular-nums text-[10px]">{plan.slot_time}</span>
                          <span className="truncate">{themeLabel(plan.theme)} · {plan.format}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>

      <PostDetailDialog post={selectedPost} open={detailOpen} onOpenChange={setDetailOpen} />
      <ScheduledPreviewDialog
        date={scheduledPreview?.date ?? null}
        plan={scheduledPreview?.plan ?? null}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
      />
    </DashboardLayout>
  );
}
