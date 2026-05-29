-- Insert default Blog Announcement email template for existing organizations
INSERT INTO email_templates (
  org_id,
  name,
  subject,
  body_content,
  buttons,
  attachments,
  is_active,
  created_at,
  updated_at
)
SELECT 
  id as org_id,
  'Blog Announcement' as name,
  'New Blog Post: {{blog_title}}' as subject,
  '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="margin-bottom: 20px;">
      <img src="{{featured_image_url}}" alt="{{blog_title}}" style="width: 100%; height: auto; border-radius: 8px; margin-bottom: 20px;" />
    </div>
    
    <h2 style="color: #1a1a1a; margin-bottom: 16px; font-size: 24px;">{{blog_title}}</h2>
    
    <p style="color: #666; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
      {{blog_excerpt}}
    </p>
    
    <a href="{{blog_url}}" style="display: inline-block; background-color: #0066cc; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
      Read Full Article →
    </a>
    
    <div style="background-color: #f5f5f5; padding: 16px; text-align: center; margin-top: 30px; font-size: 12px; color: #999; border-radius: 6px;">
      You received this email because you are subscribed to our blog updates.
    </div>
  </div>' as body_content,
  '[]'::jsonb as buttons,
  '[]'::jsonb as attachments,
  true as is_active,
  NOW() as created_at,
  NOW() as updated_at
FROM organizations
WHERE NOT EXISTS (
  SELECT 1 FROM email_templates 
  WHERE email_templates.org_id = organizations.id 
  AND email_templates.name = 'Blog Announcement'
);