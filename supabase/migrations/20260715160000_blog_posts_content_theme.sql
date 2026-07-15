-- Brand-led content strategy (2026-07-15): posts now promote the In-Sync
-- platform story rather than positioning each product as a separate offering.
-- Each post is built around one of five rotating brand themes; the theme is
-- stored so reviewers can see which story pillar a post serves.
ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS content_theme TEXT;
