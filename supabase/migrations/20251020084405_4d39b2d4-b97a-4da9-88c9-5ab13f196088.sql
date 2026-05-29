-- 1. Create platform_email_sending_list table
CREATE TABLE platform_email_sending_list (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_type TEXT NOT NULL,
  is_unsubscribed BOOLEAN NOT NULL DEFAULT false,
  bounce_count INTEGER NOT NULL DEFAULT 0,
  last_bounce_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_platform_email_sending_list_email ON platform_email_sending_list(email);
CREATE INDEX idx_platform_email_sending_list_status ON platform_email_sending_list(is_unsubscribed, bounce_count);

-- Enable RLS (service role only)
ALTER TABLE platform_email_sending_list ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to platform email list"
ON platform_email_sending_list
FOR ALL
USING (true)
WITH CHECK (true);

-- 2. Create sync function
CREATE OR REPLACE FUNCTION sync_platform_email_list()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Merge data from contacts.email and contact_emails
  INSERT INTO platform_email_sending_list (email, name, source_type, is_unsubscribed, first_seen_at, last_synced_at)
  SELECT DISTINCT ON (LOWER(email))
    LOWER(email) as email,
    COALESCE(name, 'Subscriber') as name,
    source_type,
    COALESCE((SELECT true FROM email_unsubscribes WHERE LOWER(email_unsubscribes.email) = LOWER(source.email) LIMIT 1), false) as is_unsubscribed,
    NOW() as first_seen_at,
    NOW() as last_synced_at
  FROM (
    -- From contacts.email
    SELECT 
      c.email,
      TRIM(c.first_name || ' ' || COALESCE(c.last_name, '')) as name,
      'contact' as source_type
    FROM contacts c
    WHERE c.email IS NOT NULL AND c.email != ''
    
    UNION ALL
    
    -- From contact_emails with contact name lookup
    SELECT 
      ce.email,
      TRIM(c.first_name || ' ' || COALESCE(c.last_name, '')) as name,
      'contact_email' as source_type
    FROM contact_emails ce
    LEFT JOIN contacts c ON c.id = ce.contact_id
    WHERE ce.email IS NOT NULL AND ce.email != ''
  ) source
  ORDER BY LOWER(email), LENGTH(name) DESC
  ON CONFLICT (email) 
  DO UPDATE SET
    name = CASE 
      WHEN LENGTH(COALESCE(EXCLUDED.name, '')) > LENGTH(COALESCE(platform_email_sending_list.name, ''))
      THEN EXCLUDED.name
      ELSE platform_email_sending_list.name
    END,
    last_synced_at = NOW(),
    is_unsubscribed = EXCLUDED.is_unsubscribed;
    
  -- Mark unsubscribed emails
  UPDATE platform_email_sending_list
  SET is_unsubscribed = true
  WHERE email IN (SELECT LOWER(email) FROM email_unsubscribes);
END;
$$;

-- 3. Schedule daily cron job (2 AM)
SELECT cron.schedule(
  'sync-platform-email-list-daily',
  '0 2 * * *',
  $$SELECT sync_platform_email_list();$$
);

-- 4. Run initial sync immediately
SELECT sync_platform_email_list();

-- 5. Update blog trigger to use platform list
CREATE OR REPLACE FUNCTION trigger_blog_post_email_campaign()
RETURNS trigger
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
      AND name = 'Blog Announcement'
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
    
    -- Insert recipients from platform_email_sending_list (all users across all orgs)
    INSERT INTO email_campaign_recipients (
      campaign_id,
      org_id,
      contact_email,
      contact_name,
      status,
      created_at
    )
    SELECT 
      campaign_id,
      NEW.org_id,
      email,
      name,
      'pending',
      NOW()
    FROM platform_email_sending_list
    WHERE is_unsubscribed = false 
      AND bounce_count < 3;
    
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