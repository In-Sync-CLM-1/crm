-- Per-post engagement metrics for Facebook and Instagram, swept daily by
-- mkt-social-engagement-tracker. Unlike LinkedIn (partner-gated, NULL =
-- unknown), Meta metrics are real and cumulative — the sweep re-reads recent
-- posts and the latest value wins.
alter table blog_posts add column if not exists fb_likes integer;
alter table blog_posts add column if not exists fb_comments integer;
alter table blog_posts add column if not exists fb_shares integer;
alter table blog_posts add column if not exists fb_clicks integer;
alter table blog_posts add column if not exists fb_engagement_fetched_at timestamptz;
alter table blog_posts add column if not exists ig_reach integer;
alter table blog_posts add column if not exists ig_likes integer;
alter table blog_posts add column if not exists ig_comments integer;
alter table blog_posts add column if not exists ig_saves integer;
alter table blog_posts add column if not exists ig_shares integer;
alter table blog_posts add column if not exists ig_engagement_fetched_at timestamptz;
