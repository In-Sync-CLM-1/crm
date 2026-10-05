-- The product page address is /products/vendorsync.
UPDATE public.blog_posts
   SET linkedin_short_caption = replace(linkedin_short_caption, '/products/vendor-verification', '/products/vendorsync')
 WHERE linkedin_short_caption LIKE '%/products/vendor-verification%';
