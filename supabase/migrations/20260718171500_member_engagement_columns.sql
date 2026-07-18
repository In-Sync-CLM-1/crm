-- Founder↔company mechanic: tracks when the member profile reshared or
-- commented on a company post so a post is only ever engaged once.
alter table public.blog_posts add column if not exists member_engaged_at timestamptz;
alter table public.blog_posts add column if not exists member_engagement_type text;
