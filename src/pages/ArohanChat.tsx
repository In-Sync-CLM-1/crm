import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useArohanChat, ChatMessage } from "@/hooks/useArohanChat";
import { useOrgContext } from "@/hooks/useOrgContext";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays } from "date-fns";
import {
  Send,
  RefreshCw,
  RotateCcw,
  Radio,
  Users,
  TrendingUp,
  PanelRight,
  CalendarDays,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Message bubble
// ---------------------------------------------------------------------------

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isAmit = msg.role === "amit";

  return (
    <div className={cn("flex gap-2", isAmit ? "justify-end" : "justify-start")}>
      {!isAmit && (
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-[10px] font-bold mt-1">
          A
        </div>
      )}

      <div
        className={cn(
          "max-w-[80%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed",
          isAmit
            ? "bg-primary text-primary-foreground rounded-br-sm"
            : "bg-muted text-foreground rounded-bl-sm"
        )}
      >
        {msg.isLoading ? (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            Analysing…
          </span>
        ) : (
          <p className="whitespace-pre-wrap">{msg.content}</p>
        )}
      </div>

      {isAmit && (
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold mt-1">
          M
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Context panel — live social snapshot
// ---------------------------------------------------------------------------

interface SnapshotPost {
  publish_date: string;
  status: string;
  post_format: string | null;
  linkedin_likes: number | null;
  linkedin_comments: number | null;
  linkedin_reposts: number | null;
  fb_likes: number | null;
  fb_comments: number | null;
  fb_shares: number | null;
  ig_likes: number | null;
  ig_comments: number | null;
  ig_saves: number | null;
  ig_shares: number | null;
}

function useSocialSnapshot() {
  const { effectiveOrgId } = useOrgContext();
  return useQuery({
    queryKey: ["arohan-social-snapshot", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return null;
      const since = format(subDays(new Date(), 7), "yyyy-MM-dd");
      const today = format(new Date(), "yyyy-MM-dd");
      const [postsRes, followersRes, todayRes] = await Promise.all([
        supabase
          .from("blog_posts")
          .select("publish_date, status, post_format, linkedin_likes, linkedin_comments, linkedin_reposts, fb_likes, fb_comments, fb_shares, ig_likes, ig_comments, ig_saves, ig_shares")
          .eq("org_id", effectiveOrgId)
          .eq("status", "posted")
          .gte("publish_date", since),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("mkt_channel_stats_daily")
          .select("stat_date, channel, followers")
          .eq("org_id", effectiveOrgId)
          .order("stat_date", { ascending: false })
          .limit(12),
        supabase
          .from("blog_posts")
          .select("status")
          .eq("org_id", effectiveOrgId)
          .eq("publish_date", today),
      ]);
      const posts = (postsRes.data || []) as SnapshotPost[];
      const nz = (v: number | null) => v ?? 0;
      const li = posts.reduce((s, p) => s + nz(p.linkedin_likes) + nz(p.linkedin_comments) + nz(p.linkedin_reposts), 0);
      const fb = posts.reduce((s, p) => s + nz(p.fb_likes) + nz(p.fb_comments) + nz(p.fb_shares), 0);
      const ig = posts.reduce((s, p) => s + nz(p.ig_likes) + nz(p.ig_comments) + nz(p.ig_saves) + nz(p.ig_shares), 0);

      const followers: Record<string, number> = {};
      for (const row of (followersRes.data || []) as { channel: string; followers: number | null }[]) {
        if (!(row.channel in followers) && row.followers != null) followers[row.channel] = row.followers;
      }

      const todayStatuses = (todayRes.data || []).map((r) => r.status);
      return {
        weekPosts: posts.length,
        interactions: { LinkedIn: li, Facebook: fb, Instagram: ig },
        followers,
        today: {
          posted: todayStatuses.filter((s) => s === "posted").length,
          pending: todayStatuses.filter((s) => s === "pending").length,
        },
      };
    },
    enabled: !!effectiveOrgId,
  });
}

function ContextPanel({ onRefresh }: { onRefresh: () => void }) {
  const { data: snap, isLoading } = useSocialSnapshot();

  return (
    <div className="flex flex-col gap-3 h-full overflow-y-auto pr-0.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Live Context</span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onRefresh}>
          <RefreshCw className={cn("h-3 w-3", isLoading && "animate-spin")} />
        </Button>
      </div>

      <Card className="border shadow-none">
        <CardHeader className="p-2 pb-1">
          <CardTitle className="text-[11px] flex items-center gap-1.5">
            <Radio className="h-3 w-3 text-green-500" />
            Today's posting
          </CardTitle>
        </CardHeader>
        <CardContent className="p-2 pt-0 text-xs text-muted-foreground">
          {isLoading || !snap ? "Loading…" : `${snap.today.posted} posted · ${snap.today.pending} still scheduled`}
        </CardContent>
      </Card>

      <Card className="border shadow-none">
        <CardHeader className="p-2 pb-1">
          <CardTitle className="text-[11px] flex items-center gap-1.5">
            <TrendingUp className="h-3 w-3 text-blue-500" />
            Interactions, last 7 days
          </CardTitle>
        </CardHeader>
        <CardContent className="p-2 pt-0 space-y-1">
          {isLoading || !snap ? (
            <div className="text-xs text-muted-foreground">Loading…</div>
          ) : (
            Object.entries(snap.interactions).map(([ch, v]) => (
              <div key={ch} className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">{ch}</span>
                <span className="font-medium">{v}</span>
              </div>
            ))
          )}
          {snap && <p className="text-[10px] text-muted-foreground pt-1">{snap.weekPosts} posts published this week</p>}
        </CardContent>
      </Card>

      <Card className="border shadow-none">
        <CardHeader className="p-2 pb-1">
          <CardTitle className="text-[11px] flex items-center gap-1.5">
            <Users className="h-3 w-3 text-violet-500" />
            Followers
          </CardTitle>
        </CardHeader>
        <CardContent className="p-2 pt-0 space-y-1">
          {isLoading || !snap ? (
            <div className="text-xs text-muted-foreground">Loading…</div>
          ) : Object.keys(snap.followers).length ? (
            Object.entries(snap.followers).map(([ch, v]) => (
              <div key={ch} className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground capitalize">{ch}</span>
                <span className="font-medium">{v}</span>
              </div>
            ))
          ) : (
            <div className="text-xs text-muted-foreground">First snapshot lands tonight.</div>
          )}
        </CardContent>
      </Card>

      <Card className="border shadow-none">
        <CardHeader className="p-2 pb-1">
          <CardTitle className="text-[11px] flex items-center gap-1.5">
            <CalendarDays className="h-3 w-3 text-amber-500" />
            Where to act
          </CardTitle>
        </CardHeader>
        <CardContent className="p-2 pt-0 text-[11px] text-muted-foreground leading-relaxed">
          Edit or skip any upcoming post in the Content Calendar. Charts live on the Performance page.
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Welcome state
// ---------------------------------------------------------------------------

const STARTER_QUESTIONS = [
  "Which format is earning the most engagement, and why?",
  "How did this week compare to last week across channels?",
  "Which story pillars are landing with the audience?",
  "What should we change in next week's content mix?",
];

function WelcomeScreen({ onStarter }: { onStarter: (q: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-12 px-4 text-center">
      <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xl font-bold mb-4">
        A
      </div>
      <h2 className="text-lg font-semibold mb-1">Arohan — Marketing Intelligence</h2>
      <p className="text-sm text-muted-foreground max-w-md mb-8">
        Deep-dive into your social performance: what's working across LinkedIn,
        Facebook, and Instagram, and what to change next.
      </p>
      <div className="grid gap-2 w-full max-w-sm">
        {STARTER_QUESTIONS.map((q) => (
          <button
            key={q}
            onClick={() => onStarter(q)}
            className="text-left px-3 py-2.5 rounded-lg border text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ArohanChat() {
  const { messages, isSending, error, sendMessage, clearThread } = useArohanChat();
  const location = useLocation();
  const snapshot = useSocialSnapshot();
  const [input, setInput] = useState("");
  const [contextOpen, setContextOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prefillConsumed = useRef(false);

  // Question handed over from the Performance page ("Ask Arohan" box)
  useEffect(() => {
    const prefill = (location.state as { prefill?: string } | null)?.prefill;
    if (prefill && !prefillConsumed.current) {
      prefillConsumed.current = true;
      sendMessage(prefill);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isSending) return;
    setInput("");
    sendMessage(text);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleStarter = (q: string) => {
    setInput(q);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  return (
    <DashboardLayout>
      <div className="flex h-[calc(100vh-80px)] gap-0 md:gap-4">
        {/* ── Chat column ── */}
        <div className="flex flex-col flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 pb-3 border-b">
            <div className="min-w-0">
              <h1 className="text-lg font-bold flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                  A
                </span>
                Arohan
              </h1>
              <p className="text-xs text-muted-foreground truncate">
                Marketing intelligence · Ask anything about your social data
              </p>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {messages.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearThread}
                  className="gap-1.5 text-xs text-muted-foreground h-7"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span className="hidden sm:inline">New thread</span>
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setContextOpen(true)}
                className="md:hidden gap-1.5 text-xs h-7"
                aria-label="Open live context"
              >
                <PanelRight className="h-3.5 w-3.5" />
                Context
              </Button>
            </div>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 py-4">
            {messages.length === 0 ? (
              <WelcomeScreen onStarter={handleStarter} />
            ) : (
              <div className="space-y-4 px-1">
                {messages.map((msg) => (
                  <MessageBubble key={msg.id} msg={msg} />
                ))}
                {error && (
                  <p className="text-xs text-destructive text-center py-2">{error}</p>
                )}
                <div ref={bottomRef} />
              </div>
            )}
          </ScrollArea>

          {/* Input */}
          <div className="pt-3 border-t">
            <div className="flex gap-2 items-end">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about formats, themes, channels, trends… (Enter to send)"
                className="min-h-[60px] max-h-[160px] resize-none text-sm"
                disabled={isSending}
              />
              <Button
                onClick={handleSend}
                disabled={!input.trim() || isSending}
                size="sm"
                className="h-10 w-10 p-0 shrink-0"
              >
                {isSending ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5">
              Arohan analyses and recommends — changes to the content plan happen in the Content Calendar.
            </p>
          </div>
        </div>

        {/* ── Context panel (desktop) ── */}
        <div className="hidden md:block w-72 flex-shrink-0 border-l pl-4 py-1">
          <ContextPanel onRefresh={() => snapshot.refetch()} />
        </div>

        {/* ── Context panel (mobile sheet) ── */}
        <Sheet open={contextOpen} onOpenChange={setContextOpen}>
          <SheetContent side="right" className="w-[88vw] sm:max-w-sm p-4 overflow-y-auto">
            <ContextPanel onRefresh={() => snapshot.refetch()} />
          </SheetContent>
        </Sheet>
      </div>
    </DashboardLayout>
  );
}
