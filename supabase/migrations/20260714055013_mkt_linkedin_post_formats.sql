-- LinkedIn post format diversification (text/image/carousel/video rotation)
-- instead of every night's post being a single long text block.

ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS post_format             TEXT DEFAULT 'text'
    CHECK (post_format IN ('text', 'image', 'carousel', 'video')),
  ADD COLUMN IF NOT EXISTS carousel_slide_texts     JSONB,
  ADD COLUMN IF NOT EXISTS carousel_slide_urls      JSONB,
  ADD COLUMN IF NOT EXISTS linkedin_short_caption    TEXT;
