-- X (Twitter) as 5th channel: post ids + nightly engagement, mirroring the
-- fb_*/ig_*/yt_* column pattern.
alter table public.blog_posts add column if not exists x_post_id text;
alter table public.blog_posts add column if not exists x_posted_at timestamptz;
alter table public.blog_posts add column if not exists x_impressions integer;
alter table public.blog_posts add column if not exists x_likes integer;
alter table public.blog_posts add column if not exists x_replies integer;
alter table public.blog_posts add column if not exists x_reposts integer;
alter table public.blog_posts add column if not exists x_engagement_fetched_at timestamptz;
