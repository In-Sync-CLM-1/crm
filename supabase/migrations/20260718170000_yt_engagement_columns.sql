-- YouTube per-video engagement (views/likes/comments) recorded by
-- mkt-social-engagement-tracker, mirroring the fb_*/ig_* column pattern.
alter table public.blog_posts add column if not exists yt_views integer;
alter table public.blog_posts add column if not exists yt_likes integer;
alter table public.blog_posts add column if not exists yt_comments integer;
alter table public.blog_posts add column if not exists yt_engagement_fetched_at timestamptz;
