-- 4 posts per day, prewritten a week ahead: each blog_posts row now carries its
-- position within the day (day_seq 0-3). The writer keys product/format/angle
-- rotation and the posting slot off the global sequence (day_index*4 + day_seq),
-- and the poster matches rows to slot times individually instead of assuming
-- one post per day.
ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS day_seq INTEGER;

-- One row per (org, date, seq) — lets the buffer top-up be idempotent even if
-- two writer runs race.
DROP INDEX IF EXISTS idx_blog_posts_day_seq_unique;
CREATE UNIQUE INDEX idx_blog_posts_day_seq_unique
  ON public.blog_posts(org_id, publish_date, day_seq)
  WHERE day_seq IS NOT NULL;
