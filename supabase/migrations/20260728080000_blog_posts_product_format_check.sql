-- Adds 'product' (real product-showcase screenshots) to the allowed
-- post_format values. DROP IF EXISTS/re-add so this is safe to re-run if
-- pre-applied, per the pattern in 20260724113000_blog_posts_poll_format_check.sql.
ALTER TABLE public.blog_posts DROP CONSTRAINT IF EXISTS blog_posts_post_format_check;
ALTER TABLE public.blog_posts ADD CONSTRAINT blog_posts_post_format_check
  CHECK (post_format = ANY (ARRAY['text'::text, 'image'::text, 'carousel'::text, 'video'::text, 'poll'::text, 'product'::text]));
