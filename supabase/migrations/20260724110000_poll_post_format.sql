-- Native LinkedIn Poll as a new post format (2026-07-24, engagement-quality
-- feedback: "conduct a poll sometimes"). Verified against LinkedIn's Poll
-- API — question/options/duration, no media, LinkedIn-only (no FB/IG/X
-- equivalent object, so this format does not fan out).
ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS poll_question text,
  ADD COLUMN IF NOT EXISTS poll_options jsonb,
  ADD COLUMN IF NOT EXISTS poll_duration text;
