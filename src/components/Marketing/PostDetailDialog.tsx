import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useNotification } from "@/hooks/useNotification";
import { CopyButton } from "@/components/common/CopyButton";
import { ExternalLink, Eye, ThumbsUp, MessageCircle, Repeat2 } from "lucide-react";

export interface CalendarPost {
  id: string;
  publish_date: string;
  status: string;
  post_format: string;
  blog_title: string | null;
  product_key: string | null;
  linkedin_draft_text: string | null;
  linkedin_short_caption: string | null;
  image_url: string | null;
  video_url: string | null;
  carousel_slide_texts: string[] | null;
  carousel_slide_urls: string[] | null;
  linkedin_url: string | null;
  fb_post_id: string | null;
  ig_post_id: string | null;
  yt_video_id: string | null;
  linkedin_impressions: number | null;
  linkedin_likes: number | null;
  linkedin_comments: number | null;
  linkedin_reposts: number | null;
  fb_likes: number | null;
  fb_comments: number | null;
  fb_shares: number | null;
  fb_clicks: number | null;
  ig_reach: number | null;
  ig_likes: number | null;
  ig_comments: number | null;
  ig_saves: number | null;
  ig_shares: number | null;
  yt_views: number | null;
  yt_likes: number | null;
  yt_comments: number | null;
  x_post_id: string | null;
  x_impressions: number | null;
  x_likes: number | null;
  x_replies: number | null;
  x_reposts: number | null;
  error_message: string | null;
  linkedin_slot_index: number | null;
  day_seq: number | null;
  content_theme: string | null;
  content_angle: string | null;
  image_style: string | null;
  content_strategy_note: string | null;
  content_icp_snapshot: { industries?: string[]; designations?: string[]; pain_points?: string[]; aha_event?: string } | null;
}

const statusColor: Record<string, string> = {
  pending: "bg-blue-100 text-blue-700 border-blue-300",
  posted: "bg-green-100 text-green-700 border-green-300",
  failed: "bg-red-100 text-red-700 border-red-300",
  skipped: "bg-gray-100 text-gray-600 border-gray-300",
  partial: "bg-amber-100 text-amber-700 border-amber-300",
};

export function PostDetailDialog({
  post,
  open,
  onOpenChange,
}: {
  post: CalendarPost | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const notify = useNotification();
  const queryClient = useQueryClient();

  const [draftText, setDraftText] = useState("");
  const [caption, setCaption] = useState("");
  const [slideTexts, setSlideTexts] = useState<string[]>([]);

  useEffect(() => {
    if (post) {
      setDraftText(post.linkedin_draft_text || "");
      setCaption(post.linkedin_short_caption || "");
      setSlideTexts(post.carousel_slide_texts || []);
    }
  }, [post]);

  const isEditable = post?.status === "pending";

  const save = useMutation({
    mutationFn: async () => {
      if (!post) return;
      const update: Record<string, unknown> = {};
      if (post.post_format === "text") update.linkedin_draft_text = draftText;
      if (post.post_format === "image" || post.post_format === "video") update.linkedin_short_caption = caption;
      if (post.post_format === "carousel") {
        update.linkedin_short_caption = caption;
        update.carousel_slide_texts = slideTexts;
      }
      const { error } = await supabase.from("blog_posts").update(update).eq("id", post.id);
      if (error) throw error;
    },
    onSuccess: () => {
      notify.success("Saved", "Post updated — it'll go out with these changes at its scheduled time.");
      queryClient.invalidateQueries({ queryKey: ["content-calendar-posts"] });
      onOpenChange(false);
    },
    onError: (e: Error) => notify.error("Error", e.message),
  });

  const skip = useMutation({
    mutationFn: async () => {
      if (!post) return;
      const { error } = await supabase.from("blog_posts").update({ status: "skipped" }).eq("id", post.id);
      if (error) throw error;
    },
    onSuccess: () => {
      notify.success("Skipped", "This post will not go out.");
      queryClient.invalidateQueries({ queryKey: ["content-calendar-posts"] });
      onOpenChange(false);
    },
    onError: (e: Error) => notify.error("Error", e.message),
  });

  const unskip = useMutation({
    mutationFn: async () => {
      if (!post) return;
      const { error } = await supabase.from("blog_posts").update({ status: "pending" }).eq("id", post.id);
      if (error) throw error;
    },
    onSuccess: () => {
      notify.success("Restored", "This post is queued to go out again at its scheduled time.");
      queryClient.invalidateQueries({ queryKey: ["content-calendar-posts"] });
      onOpenChange(false);
    },
    onError: (e: Error) => notify.error("Error", e.message),
  });

  if (!post) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 flex-wrap">
            <DialogTitle className="text-base">{post.blog_title || "Untitled post"}</DialogTitle>
            <Badge variant="outline" className={statusColor[post.status] || ""}>{post.status}</Badge>
            <Badge variant="secondary">{post.post_format}</Badge>
            {post.product_key && <Badge variant="outline">{post.product_key}</Badge>}
            {post.image_style && <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">style: {post.image_style}</Badge>}
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {(post.content_angle || post.content_strategy_note || post.content_icp_snapshot) && (
            <div className="bg-violet-50 border border-violet-200 rounded p-3 space-y-1.5 text-sm">
              <div className="font-medium text-violet-900">Why this post was built this way</div>
              {post.content_theme && (
                <div className="text-violet-800"><span className="font-medium">Brand theme:</span> {post.content_theme}</div>
              )}
              {post.content_angle && (
                <div className="text-violet-800"><span className="font-medium">Angle:</span> {post.content_angle}</div>
              )}
              {post.content_strategy_note && (
                <div className="text-violet-800">{post.content_strategy_note}</div>
              )}
              {post.content_icp_snapshot && (
                <div className="text-violet-700 text-xs pt-1 border-t border-violet-200">
                  {post.content_icp_snapshot.designations?.length ? <>Targeting <b>{post.content_icp_snapshot.designations.join(", ")}</b> </> : null}
                  {post.content_icp_snapshot.industries?.length ? <>in <b>{post.content_icp_snapshot.industries.join(", ")}</b> </> : null}
                  {post.content_icp_snapshot.pain_points?.length ? <>· Pain points: {post.content_icp_snapshot.pain_points.join("; ")}</> : null}
                </div>
              )}
            </div>
          )}

          {post.status === "failed" && post.error_message && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
              {post.error_message}
            </div>
          )}

          {post.post_format === "text" && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label>Post text</Label>
                <CopyButton text={draftText} />
              </div>
              <Textarea
                rows={10}
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                disabled={!isEditable}
              />
            </div>
          )}

          {(post.post_format === "image" || post.post_format === "video") && (
            <>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label>Caption</Label>
                  <CopyButton text={caption} />
                </div>
                <Textarea
                  rows={5}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  disabled={!isEditable}
                />
              </div>
              {post.post_format === "image" && post.image_url && (
                <img src={post.image_url} alt="" className="rounded border max-h-80 object-contain" />
              )}
              {post.post_format === "video" && post.video_url && (
                <video src={post.video_url} controls className="rounded border max-h-80 w-full" />
              )}
            </>
          )}

          {post.post_format === "carousel" && (
            <>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label>Caption</Label>
                  <CopyButton text={caption} />
                </div>
                <Textarea
                  rows={3}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  disabled={!isEditable}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Slides ({slideTexts.length})</Label>
                  <CopyButton text={slideTexts.join("\n\n")} label="Copy all slides" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {slideTexts.map((text, i) => (
                    <div key={i} className="space-y-1">
                      {post.carousel_slide_urls?.[i] && (
                        <img src={post.carousel_slide_urls[i]} alt="" className="rounded border w-full aspect-square object-cover" />
                      )}
                      <div className="flex items-start gap-1">
                        <Textarea
                          rows={2}
                          value={text}
                          onChange={(e) => {
                            const next = [...slideTexts];
                            next[i] = e.target.value;
                            setSlideTexts(next);
                          }}
                          disabled={!isEditable}
                          className="text-xs"
                        />
                        <CopyButton text={text} size="icon" label="Copy slide" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {post.status === "posted" && (
            <div className="space-y-1.5 text-sm text-muted-foreground border-t pt-3">
              <div className="flex items-center gap-4">
                <span className="w-20 text-xs font-medium">LinkedIn</span>
                <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" /> {post.linkedin_impressions ?? "—"}</span>
                <span className="flex items-center gap-1"><ThumbsUp className="h-3.5 w-3.5" /> {post.linkedin_likes ?? "—"}</span>
                <span className="flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" /> {post.linkedin_comments ?? "—"}</span>
                <span className="flex items-center gap-1"><Repeat2 className="h-3.5 w-3.5" /> {post.linkedin_reposts ?? "—"}</span>
                {post.linkedin_url && (
                  <a href={post.linkedin_url} target="_blank" rel="noreferrer" className="ml-auto flex items-center gap-1 text-primary hover:underline">
                    View on LinkedIn <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
              {post.fb_post_id && (
                <div className="flex items-center gap-4">
                  <span className="w-20 text-xs font-medium">Facebook</span>
                  <span className="flex items-center gap-1"><ThumbsUp className="h-3.5 w-3.5" /> {post.fb_likes ?? "—"}</span>
                  <span className="flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" /> {post.fb_comments ?? "—"}</span>
                  <span className="flex items-center gap-1"><Repeat2 className="h-3.5 w-3.5" /> {post.fb_shares ?? "—"}</span>
                  <span className="text-xs">clicks {post.fb_clicks ?? "—"}</span>
                </div>
              )}
              {post.ig_post_id && (
                <div className="flex items-center gap-4">
                  <span className="w-20 text-xs font-medium">Instagram</span>
                  <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" /> {post.ig_reach ?? "—"}</span>
                  <span className="flex items-center gap-1"><ThumbsUp className="h-3.5 w-3.5" /> {post.ig_likes ?? "—"}</span>
                  <span className="flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" /> {post.ig_comments ?? "—"}</span>
                  <span className="text-xs">saves {post.ig_saves ?? "—"} · shares {post.ig_shares ?? "—"}</span>
                </div>
              )}
              {post.yt_video_id && (
                <div className="flex items-center gap-4">
                  <span className="w-20 text-xs font-medium">YouTube</span>
                  <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" /> {post.yt_views ?? "—"}</span>
                  <span className="flex items-center gap-1"><ThumbsUp className="h-3.5 w-3.5" /> {post.yt_likes ?? "—"}</span>
                  <span className="flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" /> {post.yt_comments ?? "—"}</span>
                </div>
              )}
              {post.x_post_id && (
                <div className="flex items-center gap-4">
                  <span className="w-20 text-xs font-medium">X</span>
                  <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" /> {post.x_impressions ?? "—"}</span>
                  <span className="flex items-center gap-1"><ThumbsUp className="h-3.5 w-3.5" /> {post.x_likes ?? "—"}</span>
                  <span className="flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" /> {post.x_replies ?? "—"}</span>
                  <span className="flex items-center gap-1"><Repeat2 className="h-3.5 w-3.5" /> {post.x_reposts ?? "—"}</span>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 text-xs text-muted-foreground border-t pt-2">
            {post.fb_post_id && <Badge variant="outline">Facebook posted</Badge>}
            {post.ig_post_id && <Badge variant="outline">Instagram posted</Badge>}
            {post.yt_video_id && <Badge variant="outline">YouTube posted</Badge>}
            {post.x_post_id && <Badge variant="outline">X posted</Badge>}
          </div>
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between">
          <div>
            {post.status === "pending" && (
              <Button variant="outline" className="text-destructive" onClick={() => skip.mutate()} disabled={skip.isPending}>
                Skip this post
              </Button>
            )}
            {post.status === "skipped" && (
              <Button variant="outline" onClick={() => unskip.mutate()} disabled={unskip.isPending}>
                Restore (queue it again)
              </Button>
            )}
          </div>
          {isEditable && (
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Saving..." : "Save Changes"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
