-- Function to trigger email campaign when blog post is created
CREATE OR REPLACE FUNCTION trigger_blog_post_email_campaign()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  template_id UUID;
  campaign_id UUID;
  supabase_url TEXT := 'https://aizgpxaqvtvvqarzjmze.supabase.co';
BEGIN
  -- Only proceed if status is 'posted' and social is posted
  IF NEW.status = 'posted' AND NEW.social_posted = true THEN
    
    -- Get "Blog Announcement" email template
    SELECT id INTO template_id
    FROM email_templates
    WHERE org_id = NEW.org_id
      AND template_name ILIKE '%blog%announcement%'
      AND is_active = true
    LIMIT 1;
    
    -- If no template found, log and skip
    IF template_id IS NULL THEN
      RAISE NOTICE 'No blog announcement template found for org %', NEW.org_id;
      RETURN NEW;
    END IF;
    
    -- Create bulk email campaign
    INSERT INTO email_bulk_campaigns (
      org_id,
      campaign_name,
      template_id,
      status,
      variable_mappings,
      created_at
    )
    VALUES (
      NEW.org_id,
      'Blog: ' || NEW.blog_title,
      template_id,
      'pending',
      jsonb_build_object(
        'blog_title', NEW.blog_title,
        'blog_url', NEW.blog_url,
        'blog_excerpt', COALESCE(NEW.blog_excerpt, ''),
        'featured_image_url', COALESCE(NEW.featured_image_url, '')
      ),
      NOW()
    )
    RETURNING id INTO campaign_id;
    
    -- Update blog post with campaign_id
    UPDATE blog_posts
    SET campaign_id = campaign_id,
        updated_at = NOW()
    WHERE id = NEW.id;
    
    -- Call bulk email sender function
    PERFORM net.http_post(
      url := supabase_url || '/functions/v1/send-bulk-email',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('request.jwt.claims', true)::json->>'sub'
      ),
      body := jsonb_build_object(
        'campaignId', campaign_id,
        'orgId', NEW.org_id
      )
    );
    
    RAISE NOTICE 'Blog campaign created: % for blog post: %', campaign_id, NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS on_blog_post_inserted ON blog_posts;
CREATE TRIGGER on_blog_post_inserted
  AFTER INSERT ON blog_posts
  FOR EACH ROW
  EXECUTE FUNCTION trigger_blog_post_email_campaign();