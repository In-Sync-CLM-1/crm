-- Create blog_posts table for tracking blog distribution across social media and email
CREATE TABLE public.blog_posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  blog_url TEXT NOT NULL,
  blog_title TEXT NOT NULL,
  blog_excerpt TEXT,
  publish_date DATE NOT NULL,
  social_posted BOOLEAN NOT NULL DEFAULT false,
  email_campaign_sent BOOLEAN NOT NULL DEFAULT false,
  twitter_url TEXT,
  linkedin_url TEXT,
  facebook_url TEXT,
  campaign_id UUID,
  email_recipients_count INTEGER,
  posted_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  featured_image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Ensure status has valid values
  CONSTRAINT valid_status CHECK (status IN ('posted', 'failed', 'pending', 'partial', 'skipped')),
  
  -- Prevent duplicate blog entries per organization
  CONSTRAINT unique_org_blog UNIQUE (org_id, blog_url)
);

-- Create indexes for performance
CREATE INDEX idx_blog_posts_org_id ON public.blog_posts(org_id);
CREATE INDEX idx_blog_posts_status ON public.blog_posts(status);
CREATE INDEX idx_blog_posts_posted_timestamp ON public.blog_posts(posted_timestamp DESC);
CREATE INDEX idx_blog_posts_social_posted ON public.blog_posts(social_posted);
CREATE INDEX idx_blog_posts_email_sent ON public.blog_posts(email_campaign_sent);

-- Enable RLS
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view blog posts in their organization
CREATE POLICY "Users can view blog posts in their org"
ON public.blog_posts
FOR SELECT
USING (org_id = get_user_org_id(auth.uid()));

-- RLS Policy: Admins can insert blog posts in their organization
CREATE POLICY "Admins can create blog posts"
ON public.blog_posts
FOR INSERT
WITH CHECK (
  org_id = get_user_org_id(auth.uid()) 
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
);

-- RLS Policy: Admins can update blog posts in their organization
CREATE POLICY "Admins can update blog posts"
ON public.blog_posts
FOR UPDATE
USING (
  org_id = get_user_org_id(auth.uid()) 
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
);

-- RLS Policy: Admins can delete blog posts in their organization
CREATE POLICY "Admins can delete blog posts"
ON public.blog_posts
FOR DELETE
USING (
  org_id = get_user_org_id(auth.uid()) 
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
);

-- RLS Policy: Service role has full access (for API integrations)
CREATE POLICY "Service role has full access to blog posts"
ON public.blog_posts
FOR ALL
USING (true)
WITH CHECK (true);

-- Trigger for automatic updated_at timestamp
CREATE TRIGGER update_blog_posts_updated_at
BEFORE UPDATE ON public.blog_posts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add comment to table
COMMENT ON TABLE public.blog_posts IS 'Tracks blog posts distributed across social media and email campaigns';