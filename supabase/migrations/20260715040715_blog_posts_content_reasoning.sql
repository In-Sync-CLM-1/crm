-- Captures the AI's content strategy for each post so a human reviewer can see
-- WHY it was written that way, not just the final text: which angle it used,
-- a short explanation of the logic/research behind it, and the ICP context it
-- was targeting. Previously computed in the writer prompt and discarded.
ALTER TABLE public.blog_posts ADD COLUMN IF NOT EXISTS content_angle text;
ALTER TABLE public.blog_posts ADD COLUMN IF NOT EXISTS content_strategy_note text;
ALTER TABLE public.blog_posts ADD COLUMN IF NOT EXISTS content_icp_snapshot jsonb;
