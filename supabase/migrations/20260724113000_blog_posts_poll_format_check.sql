-- blog_posts_post_format_check didn't allow 'poll' (added in
-- 20260724110000_poll_post_format.sql) — the live force-write smoke test
-- caught this immediately. DROP IF EXISTS/re-add so this is safe to
-- re-run if pre-applied.
ALTER TABLE public.blog_posts DROP CONSTRAINT IF EXISTS blog_posts_post_format_check;
ALTER TABLE public.blog_posts ADD CONSTRAINT blog_posts_post_format_check
  CHECK (post_format = ANY (ARRAY['text'::text, 'image'::text, 'carousel'::text, 'video'::text, 'poll'::text]));
